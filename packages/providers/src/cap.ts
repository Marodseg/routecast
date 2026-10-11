import type { Warning, WarningKind, WarningLevel } from '@routecast/shared/providers';
import { zoneByCode, zoneByName } from './zones';

/** Extrae los ficheros de un tar POSIX/ustar (los avisos CAP de AEMET llegan así). */
export function untar(bytes: Uint8Array): { name: string; data: Uint8Array }[] {
  const ascii = (from: number, to: number) => {
    let s = '';
    for (let i = from; i < to && bytes[i] !== 0; i++) s += String.fromCharCode(bytes[i] ?? 0);
    return s;
  };
  const files: { name: string; data: Uint8Array }[] = [];
  let off = 0;
  while (off + 512 <= bytes.length) {
    const name = ascii(off, off + 100);
    if (!name) break;
    const size = Number.parseInt(ascii(off + 124, off + 136).trim(), 8);
    if (!Number.isFinite(size) || size < 0 || off + 512 + size > bytes.length) throw new RangeError('tar truncado');
    files.push({ name, data: bytes.subarray(off + 512, off + 512 + size) });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

const LEVELS: Record<string, WarningLevel> = { amarillo: 'yellow', naranja: 'orange', rojo: 'red' };

/** Códigos de fenómeno AEMET-Meteoalerta → tipo normalizado. */
const AEMET_KIND: Record<string, WarningKind> = {
  VI: 'wind',
  PR: 'rain',
  NE: 'snow',
  TO: 'storm',
  NI: 'fog',
  AT: 'heat',
  BT: 'cold',
  CO: 'coastal',
  VS: 'dust',
};

const tag = (s: string, t: string): string | undefined => {
  const i = s.indexOf(`<${t}>`);
  if (i < 0) return undefined;
  const j = s.indexOf(`</${t}>`, i);
  return j < 0 ? undefined : decodeXml(s.slice(i + t.length + 2, j).trim());
};

const param = (s: string, name: string): string | undefined =>
  new RegExp(`<valueName>${name}</valueName>\\s*<value>([^<]*)</value>`).exec(s)?.[1]?.trim();

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parsePolygon(text: string): [number, number][] | null {
  const pts: [number, number][] = [];
  for (const pair of text.trim().split(/\s+/)) {
    const [lat, lng] = pair.split(',').map(Number);
    if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    pts.push([lng, lat]);
  }
  return pts.length >= 3 ? pts : null;
}

/**
 * Avisos de un documento CAP de AEMET (bloque es-ES). Se descartan los de nivel «verde» (sin aviso) sin analizar sus
 * polígonos: es lo que mantiene el coste de CPU dentro del presupuesto del Worker.
 */
export function parseAemetCap(xml: string): Warning[] {
  const out: Warning[] = [];
  const identifier = tag(xml, 'identifier') ?? '';
  for (const info of xml.split('<info>').slice(1)) {
    if (tag(info, 'language') !== 'es-ES') continue;
    const level = LEVELS[param(info, 'AEMET-Meteoalerta nivel') ?? ''];
    if (!level) continue;
    const kindCode = (param(info, 'AEMET-Meteoalerta fenomeno') ?? '').split(';')[0] ?? '';
    const fromMs = Date.parse(tag(info, 'onset') ?? tag(info, 'effective') ?? '');
    const toMs = Date.parse(tag(info, 'expires') ?? '');
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) continue;
    const description = tag(info, 'description');
    for (const area of info.split('<area>').slice(1)) {
      const areaName = tag(area, 'areaDesc');
      if (!areaName) continue;
      const zoneCode = param(area, 'AEMET-Meteoalerta zona');
      const polygons = [...area.matchAll(/<polygon>([^<]+)<\/polygon>/g)]
        .map((m) => parsePolygon(m[1] ?? ''))
        .filter((p): p is [number, number][] => p !== null);
      const zone = zoneCode ? zoneByCode(zoneCode) : zoneByName(areaName);
      out.push({
        id: `aemet:${identifier}:${zoneCode ?? areaName}:${fromMs}`,
        level,
        kind: AEMET_KIND[kindCode] ?? 'other',
        areaName,
        ...(zoneCode ? { zoneCode } : {}),
        polygons: polygons.length ? polygons : (zone?.polygons ?? []),
        fromMs,
        toMs,
        ...(description ? { description } : {}),
        source: 'AEMET',
      });
    }
  }
  return out;
}

const SEVERITY_LEVEL: Record<string, WarningLevel> = { Moderate: 'yellow', Severe: 'orange', Extreme: 'red' };

/** Tipo de fenómeno a partir del título del Atom de Meteoalarm («Yellow Rain Warning issued for Spain - …»). */
function meteoalarmKind(title: string): WarningKind {
  const t = title.toLowerCase();
  if (/thunder/.test(t)) return 'storm';
  if (/snow|ice/.test(t)) return 'snow';
  if (/wind/.test(t)) return 'wind';
  if (/rain|flood/.test(t)) return 'rain';
  if (/fog/.test(t)) return 'fog';
  if (/high.temp/.test(t)) return 'heat';
  if (/low.temp/.test(t)) return 'cold';
  if (/coast/.test(t)) return 'coastal';
  if (/dust/.test(t)) return 'dust';
  return 'other';
}

/** Avisos del feed Atom de Meteoalarm (España). Sin polígonos propios: se localizan con la tabla de zonas de AEMET. */
export function parseMeteoalarmAtom(xml: string): Warning[] {
  const out: Warning[] = [];
  for (const entry of xml.split('<entry>').slice(1)) {
    const level = SEVERITY_LEVEL[tag(entry, 'cap:severity') ?? ''];
    if (!level || tag(entry, 'cap:status') !== 'Actual') continue;
    const areaName = tag(entry, 'cap:areaDesc');
    const title = tag(entry, 'title') ?? '';
    const fromMs = Date.parse(tag(entry, 'cap:onset') ?? tag(entry, 'cap:effective') ?? '');
    const toMs = Date.parse(tag(entry, 'cap:expires') ?? '');
    if (!areaName || !Number.isFinite(fromMs) || !Number.isFinite(toMs)) continue;
    const zone = zoneByName(areaName);
    out.push({
      id: `meteoalarm:${tag(entry, 'cap:identifier') ?? title}:${areaName}:${fromMs}`,
      level,
      kind: meteoalarmKind(title),
      areaName,
      ...(zone ? { zoneCode: zone.code } : {}),
      polygons: zone?.polygons ?? [],
      fromMs,
      toMs,
      source: 'Meteoalarm',
    });
  }
  return out;
}

const RANK: Record<WarningLevel, number> = { yellow: 1, orange: 2, red: 3 };

/**
 * Fusiona avisos de AEMET y Meteoalarm (Meteoalarm reproduce los de AEMET para España): mismo fenómeno, misma zona y
 * ventanas solapadas → uno solo, el de mayor nivel; a igualdad, el de AEMET (trae el polígono y el texto oficial).
 */
export function mergeWarnings(lists: readonly (readonly Warning[])[]): Warning[] {
  const out: Warning[] = [];
  for (const w of lists.flat()) {
    const key = (x: Warning) => `${x.zoneCode ?? x.areaName.toLowerCase()}|${x.kind}`;
    const dup = out.findIndex((x) => key(x) === key(w) && x.fromMs <= w.toMs && w.fromMs <= x.toMs);
    if (dup < 0) {
      out.push(w);
      continue;
    }
    const cur = out[dup] as Warning;
    const better =
      RANK[w.level] > RANK[cur.level] ||
      (RANK[w.level] === RANK[cur.level] && w.source === 'AEMET' && cur.source !== 'AEMET');
    if (better) out[dup] = w;
  }
  return out.sort((a, b) => RANK[b.level] - RANK[a.level] || a.fromMs - b.fromMs);
}

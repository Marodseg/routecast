import { err, ok, type ProviderError, type Result, type Warning } from '@routecast/shared/providers';
import { z } from 'zod';
import { parseAemetCap, parseMeteoalarmAtom, untar } from './cap';
import { getBytes, getJson } from './http';

const UTF8 = new TextDecoder('utf-8');

export interface AemetOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

const AemetMeta = z.object({
  estado: z.number().optional(),
  datos: z.string().url().optional(),
  descripcion: z.string().optional(),
});

/**
 * Avisos CAP de AEMET para una comunidad autónoma (API en dos pasos: metadatos con URL `datos` → tar de XML CAP).
 * Solo para el Worker: la clave va en la cabecera `api_key` y nunca llega al cliente (CLAUDE.md regla 2).
 */
export async function fetchAemetArea(area: string, o: AemetOptions, signal: AbortSignal): Promise<Result<Warning[]>> {
  if (!/^\d{2}$/.test(area)) return err({ kind: 'bad_response', detail: 'área no válida' });
  const headers: Record<string, string> = { api_key: o.apiKey, Accept: 'application/json' };
  if (o.userAgent) headers['User-Agent'] = o.userAgent;
  const meta = await getJson(
    `${o.baseUrl ?? 'https://opendata.aemet.es'}/opendata/api/avisos_cap/ultimoelaborado/area/${area}`,
    {
      schema: AemetMeta,
      signal,
      timeoutMs: o.timeoutMs ?? 8000,
      init: { headers },
      ...(o.fetchImpl ? { fetchImpl: o.fetchImpl } : {}),
      mapClientError: (status): ProviderError =>
        status === 401 ? { kind: 'bad_response', detail: 'clave AEMET rechazada' } : { kind: 'unavailable', status },
    },
  );
  if (!meta.ok) return meta;
  // AEMET responde 200 con `estado` 404/429/500 en el cuerpo cuando algo falla.
  if (meta.value.estado === 429) return err({ kind: 'rate_limited' });
  if (!meta.value.datos) return err({ kind: 'unavailable', status: meta.value.estado ?? 0 });
  // La URL de datos la da AEMET: solo se sigue si apunta a su propio dominio.
  let dataUrl: URL;
  try {
    dataUrl = new URL(meta.value.datos);
  } catch {
    return err({ kind: 'bad_response', detail: 'URL de datos no válida' });
  }
  if (dataUrl.protocol !== 'https:' || dataUrl.hostname !== 'opendata.aemet.es')
    return err({ kind: 'bad_response', detail: 'URL de datos inesperada' });

  const tar = await getBytes(dataUrl.href, {
    signal,
    timeoutMs: o.timeoutMs ?? 10_000,
    maxBytes: 5_000_000,
    // Sin seguir redirecciones (la URL ya se ha comprobado). «manual» y no «error»: Workers no admite «error».
    // Una respuesta 3xx se rechaza en getBytes.
    init: { redirect: 'manual', ...(o.userAgent ? { headers: { 'User-Agent': o.userAgent } } : {}) },
    ...(o.fetchImpl ? { fetchImpl: o.fetchImpl } : {}),
  });
  if (!tar.ok) return tar;
  try {
    const out: Warning[] = [];
    for (const f of untar(tar.value)) {
      const xml = UTF8.decode(f.data);
      // Filtro barato antes de analizar: la mayoría de ficheros son «verde» (sin aviso).
      if (!/<value>(amarillo|naranja|rojo)<\/value>/.test(xml)) continue;
      out.push(...parseAemetCap(xml));
    }
    return ok(out);
  } catch (e) {
    return err({ kind: 'bad_response', detail: e instanceof Error ? e.message : 'tar no válido' });
  }
}

export interface MeteoalarmOptions {
  url?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

/** Avisos activos de Meteoalarm para España (feed Atom, pequeño: solo avisos vigentes). */
export async function fetchMeteoalarmSpain(o: MeteoalarmOptions, signal: AbortSignal): Promise<Result<Warning[]>> {
  const res = await getBytes(o.url ?? 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-spain', {
    signal,
    timeoutMs: o.timeoutMs ?? 8000,
    maxBytes: 2_000_000,
    ...(o.userAgent ? { init: { headers: { 'User-Agent': o.userAgent } } } : {}),
    ...(o.fetchImpl ? { fetchImpl: o.fetchImpl } : {}),
  });
  if (!res.ok) return res;
  const xml = UTF8.decode(res.value);
  if (!xml.includes('<feed')) return err({ kind: 'bad_response', detail: 'no es un feed Atom' });
  return ok(parseMeteoalarmAtom(xml));
}

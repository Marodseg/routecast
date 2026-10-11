// Genera la tabla estática de zonas de aviso de AEMET (nombre, código, comunidad, polígonos) a partir de los CAP
// de «último elaborado» de cada comunidad, y graba fixtures de AEMET/Meteoalarm/ORS para los tests.
// Ejecutar a mano y con moderación (≈ 40 peticiones espaciadas ≥ 1,6 s; AEMET limita por minuto):
//   node packages/providers/scripts/build-aemet-zones.mjs
// Necesita AEMET_API_KEY y ORS_API_KEY en apps/worker/.dev.vars (nunca en el repositorio).
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const vars = Object.fromEntries(
  readFileSync(new URL('apps/worker/.dev.vars', ROOT), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const UA = 'Routecast/0.1 (proyecto personal no comercial; ver README del repositorio routecast)';
const AREAS = [
  '61',
  '62',
  '63',
  '64',
  '65',
  '66',
  '67',
  '68',
  '69',
  '70',
  '71',
  '72',
  '73',
  '74',
  '75',
  '76',
  '77',
  '78',
  '79',
];
const FIXTURES = new URL('packages/providers/test/__fixtures__/', ROOT);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function aemetTar(area) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const meta = await fetch(`https://opendata.aemet.es/opendata/api/avisos_cap/ultimoelaborado/area/${area}`, {
        headers: { api_key: vars.AEMET_API_KEY, 'User-Agent': UA },
        signal: AbortSignal.timeout(20_000),
      });
      if (meta.status === 429) throw new Error('429');
      const j = await meta.json();
      if (j.estado === 429) throw new Error('429 (estado en el cuerpo)');
      if (!j.datos) throw new Error(`sin datos: ${j.descripcion}`);
      await wait(1600);
      const tar = await fetch(j.datos, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
      if (!tar.ok) throw new Error(`HTTP ${tar.status}`);
      return Buffer.from(await tar.arrayBuffer());
    } catch (e) {
      console.warn(`  área ${area}: ${e.message}; reintento`);
      await wait(e.message.startsWith('429') ? 60_000 : 6000 * (attempt + 1));
    }
  }
  throw new Error(`área ${area}: sin respuesta`);
}

function untar(buf) {
  const files = [];
  let off = 0;
  while (off + 512 <= buf.length) {
    const name = buf
      .subarray(off, off + 100)
      .toString()
      .replace(/\0.*$/s, '');
    if (!name) break;
    const size = Number.parseInt(
      buf
        .subarray(off + 124, off + 136)
        .toString()
        .replace(/\0.*$/s, '')
        .trim(),
      8,
    );
    files.push({ name, text: new TextDecoder('utf-8').decode(buf.subarray(off + 512, off + 512 + size)) });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

const zones = new Map();
const tag = (s, t) => s.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1]?.trim();
for (const area of AREAS) {
  const buf = await aemetTar(area);
  if (area === '61' || area === '64') writeFileSync(new URL(`aemet-avisos-${area}.tar`, FIXTURES), buf);
  const files = untar(buf);
  const levels = new Set();
  for (const f of files) {
    for (const info of f.text.split('<info>').slice(1)) {
      if (tag(info, 'language') !== 'es-ES') continue;
      levels.add(info.match(/AEMET-Meteoalerta nivel<\/valueName>\s*<value>([^<]+)/)?.[1]);
      for (const a of info.split('<area>').slice(1)) {
        const name = tag(a, 'areaDesc');
        const code = a.match(/AEMET-Meteoalerta zona<\/valueName>\s*<value>([^<]+)/)?.[1];
        if (!name || !code || zones.has(code)) continue;
        const polygons = [...a.matchAll(/<polygon>([^<]+)<\/polygon>/g)].map((m) =>
          m[1]
            .trim()
            .split(/\s+/)
            .map((pair) => {
              const [lat, lng] = pair.split(',').map(Number);
              return [Math.round(lng * 100) / 100, Math.round(lat * 100) / 100];
            }),
        );
        zones.set(code, { code, name, area, polygons });
      }
    }
  }
  console.warn(
    `área ${area}: ${files.length} ficheros, niveles ${[...levels].join('/')}, zonas acumuladas ${zones.size}`,
  );
  await wait(1600);
}

const out = [...zones.values()].sort((a, b) => a.code.localeCompare(b.code));
writeFileSync(new URL('packages/providers/src/data/aemet-zones.json', ROOT), `${JSON.stringify(out)}\n`);
console.warn(`zonas: ${out.length}`);

// Fixtures complementarios
const atom = await fetch('https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-spain', {
  headers: { 'User-Agent': UA },
  signal: AbortSignal.timeout(20_000),
});
if (atom.ok) writeFileSync(new URL('meteoalarm-spain.atom', FIXTURES), await atom.text());
await wait(1600);
const ors = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
  method: 'POST',
  signal: AbortSignal.timeout(20_000),
  headers: {
    Authorization: vars.ORS_API_KEY,
    'Content-Type': 'application/json',
    Accept: 'application/geo+json',
    'User-Agent': UA,
  },
  body: JSON.stringify({
    coordinates: [
      [-4.4214, 36.7213],
      [-3.5986, 37.1773],
    ],
    alternative_routes: { target_count: 3, weight_factor: 1.6, share_factor: 0.6 },
    instructions: true,
    language: 'es',
  }),
});
if (ors.ok) writeFileSync(new URL('ors-malaga-granada.json', FIXTURES), await ors.text());
console.warn('fixtures: meteoalarm', atom.status, 'ors', ors.status);

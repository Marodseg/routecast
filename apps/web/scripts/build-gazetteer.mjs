// Genera el nomenclátor del buscador (public/gazetteer.json) desde Wikidata (CC0).
// Motivo: el Photon público no indexa nombres en castellano (lang=es no soportado, 2026-10-11), así que no encuentra
// «Hendaya», «Burdeos» ni «San Sebastián» → Donostia. Ejecutar a mano (3 consultas SPARQL espaciadas):
//   pnpm --filter @routecast/web exec node scripts/build-gazetteer.mjs
import { writeFileSync } from 'node:fs';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const UA =
  'Routecast/0.1 (proyecto personal no comercial; generación de nomenclátor; ver README del repositorio routecast)';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' },
      signal: AbortSignal.timeout(90_000),
    });
    if (r.ok) return (await r.json()).results.bindings;
    console.warn(`  SPARQL ${r.status}; reintento`);
    await wait(10_000 * (attempt + 1));
  }
  throw new Error('SPARQL sin respuesta');
}

const PROVINCES = {
  '01': 'Álava',
  '02': 'Albacete',
  '03': 'Alicante',
  '04': 'Almería',
  '05': 'Ávila',
  '06': 'Badajoz',
  '07': 'Baleares',
  '08': 'Barcelona',
  '09': 'Burgos',
  10: 'Cáceres',
  11: 'Cádiz',
  12: 'Castellón',
  13: 'Ciudad Real',
  14: 'Córdoba',
  15: 'A Coruña',
  16: 'Cuenca',
  17: 'Girona',
  18: 'Granada',
  19: 'Guadalajara',
  20: 'Gipuzkoa',
  21: 'Huelva',
  22: 'Huesca',
  23: 'Jaén',
  24: 'León',
  25: 'Lleida',
  26: 'La Rioja',
  27: 'Lugo',
  28: 'Madrid',
  29: 'Málaga',
  30: 'Murcia',
  31: 'Navarra',
  32: 'Ourense',
  33: 'Asturias',
  34: 'Palencia',
  35: 'Las Palmas',
  36: 'Pontevedra',
  37: 'Salamanca',
  38: 'Santa Cruz de Tenerife',
  39: 'Cantabria',
  40: 'Segovia',
  41: 'Sevilla',
  42: 'Soria',
  43: 'Tarragona',
  44: 'Teruel',
  45: 'Toledo',
  46: 'Valencia',
  47: 'Valladolid',
  48: 'Bizkaia',
  49: 'Zamora',
  50: 'Zaragoza',
  51: 'Ceuta',
  52: 'Melilla',
};

// Municipios de España (≥ 1.000 hab.), con nombre en castellano y nombres oficiales/cooficiales.
const SPAIN = `
SELECT ?item ?es ?label ?alt ?alias ?ine (MAX(?p) AS ?pop) (SAMPLE(?c) AS ?coord) WHERE {
  # Por código INE (todos los municipios lo tienen; el tipo P31 varía por comunidad: Cataluña, Galicia…).
  ?item wdt:P772 ?ine; wdt:P1082 ?p; wdt:P625 ?c.
  FILTER(STRLEN(?ine) = 5 && ?p >= 1000)
  FILTER NOT EXISTS { ?item wdt:P576 ?disuelto }
  OPTIONAL { ?item rdfs:label ?es FILTER(LANG(?es) = "es") }
  OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) IN ("eu", "ca", "gl", "ast", "an", "oc")) }
  OPTIONAL { ?item wdt:P1448 ?alt }
  OPTIONAL { ?item skos:altLabel ?alias FILTER(LANG(?alias) = "es") }
} GROUP BY ?item ?es ?label ?alt ?alias ?ine`;

// Vecinos: Francia (≥ 8.000 hab.), Portugal (municipios), Andorra (parroquias).
const NEIGHBOURS = `
SELECT ?item ?es ?label ?country (MAX(?p) AS ?pop) (SAMPLE(?c) AS ?coord) WHERE {
  VALUES (?kind ?country ?min) { (wd:Q484170 "FR" 8000) (wd:Q13217644 "PT" 0) (wd:Q24279 "AD" 0) }
  ?item wdt:P31 ?kind; wdt:P1082 ?p; wdt:P625 ?c.
  FILTER(?p >= ?min)
  OPTIONAL { ?item rdfs:label ?es FILTER(LANG(?es) = "es") }
  OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) IN ("fr", "pt", "ca", "eu", "en")) }
} GROUP BY ?item ?es ?label ?country`;

// Grandes ciudades de Europa (≥ 200.000 hab.) con su nombre en castellano (Londres, Múnich…). Lista de países
// explícita: el filtro por continente agota el tiempo de Wikidata (504).
const EUROPE = `
SELECT ?item ?es ?label ?cc (MAX(?p) AS ?pop) (SAMPLE(?c) AS ?coord) WHERE {
  VALUES (?country ?cc) {
    (wd:Q38 "IT") (wd:Q183 "DE") (wd:Q145 "GB") (wd:Q55 "NL") (wd:Q31 "BE") (wd:Q39 "CH") (wd:Q40 "AT") (wd:Q27 "IE")
    (wd:Q36 "PL") (wd:Q213 "CZ") (wd:Q35 "DK") (wd:Q34 "SE") (wd:Q20 "NO") (wd:Q33 "FI") (wd:Q28 "HU") (wd:Q41 "GR")
    (wd:Q218 "RO") (wd:Q219 "BG") (wd:Q224 "HR") (wd:Q32 "LU")
  }
  VALUES ?kind { wd:Q1549591 wd:Q1637706 wd:Q515 wd:Q5119 }
  ?item wdt:P17 ?country; wdt:P31 ?kind; wdt:P1082 ?p; wdt:P625 ?c.
  FILTER(?p >= 200000)
  OPTIONAL { ?item rdfs:label ?es FILTER(LANG(?es) = "es") }
  OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) = "en") }
} GROUP BY ?item ?es ?label ?cc`;

const COUNTRY_ES = {
  FR: 'Francia',
  PT: 'Portugal',
  AD: 'Andorra',
  IT: 'Italia',
  DE: 'Alemania',
  GB: 'Reino Unido',
  NL: 'Países Bajos',
  BE: 'Bélgica',
  CH: 'Suiza',
  AT: 'Austria',
  IE: 'Irlanda',
  PL: 'Polonia',
  CZ: 'Chequia',
  DK: 'Dinamarca',
  SE: 'Suecia',
  NO: 'Noruega',
  FI: 'Finlandia',
  HU: 'Hungría',
  GR: 'Grecia',
  RO: 'Rumanía',
  BG: 'Bulgaria',
  HR: 'Croacia',
  RS: 'Serbia',
  SK: 'Eslovaquia',
  SI: 'Eslovenia',
  LT: 'Lituania',
  LV: 'Letonia',
  EE: 'Estonia',
  LU: 'Luxemburgo',
  MT: 'Malta',
  BA: 'Bosnia y Herzegovina',
  AL: 'Albania',
  MK: 'Macedonia del Norte',
  MD: 'Moldavia',
  ME: 'Montenegro',
  IS: 'Islandia',
};

const places = new Map();
function add(row, detail, country) {
  const id = row.item.value.split('/').pop();
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(row.coord?.value ?? '');
  if (!m) return;
  const name = row.es?.value ?? row.label?.value;
  if (!name || /^Q\d+$/.test(name)) return;
  const cur = places.get(id) ?? {
    id,
    name,
    names: new Set(),
    detail,
    country,
    pop: Number(row.pop?.value ?? 0),
    lat: Math.round(Number(m[2]) * 1e3) / 1e3,
    lng: Math.round(Number(m[1]) * 1e3) / 1e3,
    officials: new Set(),
  };
  if (row.alt?.value && country === 'ES') cur.officials.add(row.alt.value);
  const norm = (x) =>
    x
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  for (const n of [row.es?.value, row.label?.value, row.alt?.value, row.alias?.value]) {
    // Solo alias que aporten algo: distintos del nombre una vez normalizados.
    if (n && norm(n) !== norm(cur.name) && n.length <= 60 && ![...cur.names].some((x) => norm(x) === norm(n)))
      cur.names.add(n);
  }
  places.set(id, cur);
}

console.warn('España…');
for (const row of await sparql(SPAIN)) add(row, PROVINCES[row.ine.value.slice(0, 2)] ?? 'España', 'ES');
await wait(5000);
console.warn('Francia, Portugal, Andorra…');
for (const row of await sparql(NEIGHBOURS)) add(row, COUNTRY_ES[row.country.value], row.country.value);
await wait(5000);
console.warn('Grandes ciudades de Europa…');
for (const row of await sparql(EUROPE)) add(row, COUNTRY_ES[row.cc.value] ?? row.cc.value, row.cc.value);

// Formato compacto: [nombre, otros nombres separados por «|», detalle, lat, lng, población, país ISO]
// En España se muestra el nombre oficial (A Coruña, Girona, Lleida), salvo si es bilingüe («Donostia / San Sebastián»,
// «Vitoria-Gasteiz»): ahí, el castellano. Todos los nombres siguen siendo buscables.
const display = (p) => {
  const [only, ...more] = [...p.officials];
  return only && !more.length && !/[/-]/.test(only) ? only : p.name;
};
const out = [...places.values()]
  .sort((a, b) => b.pop - a.pop)
  .map((p) => {
    const shown = display(p);
    const others = [...new Set([p.name, ...p.names])].filter((n) => n !== shown);
    return [shown, others.join('|'), p.detail, p.lat, p.lng, p.pop, p.country];
  });
writeFileSync(new URL('../public/gazetteer.json', import.meta.url), JSON.stringify(out));
console.warn(`nomenclátor: ${out.length} lugares`);

import type { Place } from '@routecast/shared';

/**
 * Nomenclátor propio (Wikidata, CC0; scripts/build-gazetteer.mjs): municipios de España con nombres en castellano y en
 * lenguas cooficiales, y ciudades de Francia, Portugal, Andorra y grandes ciudades de Europa con su exónimo (Hendaya,
 * Burdeos, Londres). Existe porque el Photon público no indexa nombres en castellano.
 */
type Row = [name: string, aliases: string, detail: string, lat: number, lng: number, pop: number, country?: string];

interface Entry {
  place: Place;
  name: string;
  aliases: string[];
  pop: number;
  country: string;
}

export const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñç ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

let loading: Promise<Entry[]> | null = null;

function isRow(r: unknown): r is Row {
  return (
    Array.isArray(r) &&
    typeof r[0] === 'string' &&
    typeof r[1] === 'string' &&
    typeof r[2] === 'string' &&
    Number.isFinite(r[3]) &&
    Number.isFinite(r[4]) &&
    Math.abs(r[3] as number) <= 90 &&
    Math.abs(r[4] as number) <= 180
  );
}

export function buildIndex(rows: unknown): Entry[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter(isRow).map(([name, aliases, detail, lat, lng, pop, country], i) => ({
    place: { id: `gz${i}`, name, ...(detail ? { detail } : {}), at: { lat, lng } },
    name: norm(name),
    aliases: aliases ? aliases.split('|').map(norm) : [],
    pop: Number.isFinite(pop) ? pop : 0,
    country: typeof country === 'string' ? country : 'ES',
  }));
}

/** Carga perezosa (solo al usar el buscador). Si falla, el buscador sigue con Photon. */
export function loadGazetteer(fetchImpl: typeof fetch = fetch): Promise<Entry[]> {
  loading ??= fetchImpl(`${import.meta.env.BASE_URL}gazetteer.json`)
    .then((r) => (r.ok ? r.json() : []))
    .then(buildIndex)
    .catch(() => {
      loading = null;
      return [];
    });
  return loading;
}

/** Viajes en coche desde España: a igual coincidencia, primero España y después sus vecinos. */
const COUNTRY_BONUS: Record<string, number> = { ES: 8, PT: 3, FR: 3, AD: 3 };

/** Puntuación: exacto > empieza por > alguna palabra empieza por; nombre mostrado > alias; país; población. */
function score(q: string, e: Entry): number {
  const s = (t: string, base: number) => {
    if (t === q) return base + 30;
    if (t.startsWith(q)) return base + 20;
    if (t.split(' ').some((w) => w.startsWith(q))) return base + 5;
    return -1;
  };
  let best = s(e.name, 70);
  for (const a of e.aliases) best = Math.max(best, s(a, 60));
  return best < 0 ? -1 : best + (COUNTRY_BONUS[e.country] ?? 0) + Math.log10(e.pop + 10) * 3;
}

export function searchGazetteer(index: readonly Entry[], query: string, limit = 5): Place[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const hits: { e: Entry; sc: number }[] = [];
  for (const e of index) {
    const sc = score(q, e);
    if (sc >= 0) hits.push({ e, sc });
  }
  return hits
    .sort((a, b) => b.sc - a.sc)
    .slice(0, limit)
    .map((h) => h.e.place);
}

const KM = 111;
const distKm = (a: Place, b: Place) => Math.hypot((a.at.lat - b.at.lat) * KM, (a.at.lng - b.at.lng) * KM * 0.75);

/** ¿El nombre contiene lo escrito? Descarta las coincidencias difusas de Photon (otros alfabetos, nombres parecidos). */
export function matchesQuery(name: string, query: string): boolean {
  const q = norm(query);
  const n = norm(name);
  return q.length > 0 && (n.includes(q) || n.split(' ').some((w) => w.startsWith(q.split(' ')[0] ?? q)));
}

/**
 * Une nomenclátor y Photon: primero el nomenclátor; de Photon solo lo que coincide con lo escrito y no es el mismo
 * sitio (a menos de 4 km de otro resultado, o mismo nombre a menos de 15 km: p. ej. «Hendaya» y «Hendaye»).
 */
export function mergePlaces(primary: readonly Place[], secondary: readonly Place[], query: string, limit = 7): Place[] {
  const out = [...primary];
  for (const p of secondary) {
    if (out.length >= limit) break;
    if (!matchesQuery(p.name, query)) continue;
    if (out.some((x) => distKm(x, p) < 4 || (norm(x.name) === norm(p.name) && distKm(x, p) < 15))) continue;
    out.push(p);
  }
  return out.slice(0, limit);
}

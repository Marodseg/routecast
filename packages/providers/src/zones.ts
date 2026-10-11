import zonesData from './data/aemet-zones.json';

/** Zona de aviso AEMET-Meteoalerta con su polígono ([lng, lat]), generada por scripts/build-aemet-zones.mjs. */
export interface AemetZone {
  code: string;
  name: string;
  /** Código de comunidad autónoma de la API de avisos (61 Andalucía…). */
  area: string;
  polygons: [number, number][][];
}

export const AEMET_ZONES: readonly AemetZone[] = zonesData as AemetZone[];

/** Nombre normalizado para casar zonas entre AEMET y Meteoalarm (sin tildes, mayúsculas ni espacios extra). */
export const normName = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const byName = new Map(AEMET_ZONES.map((z) => [normName(z.name), z]));
const byCode = new Map(AEMET_ZONES.map((z) => [z.code, z]));

export const zoneByName = (name: string): AemetZone | undefined => byName.get(normName(name));
export const zoneByCode = (code: string): AemetZone | undefined => byCode.get(code);

export type BBoxTuple = [west: number, south: number, east: number, north: number];

export function polygonBBox(polygons: readonly (readonly [number, number][])[]): BBoxTuple {
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const poly of polygons) {
    for (const [lng, lat] of poly) {
      if (lng < w) w = lng;
      if (lng > e) e = lng;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  }
  return [w, s, e, n];
}

export const bboxIntersects = (a: BBoxTuple, b: BBoxTuple): boolean =>
  a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

const AREA_BBOX = new Map<string, BBoxTuple>();
for (const z of AEMET_ZONES) {
  const bb = polygonBBox(z.polygons);
  const cur = AREA_BBOX.get(z.area);
  AREA_BBOX.set(
    z.area,
    cur ? [Math.min(cur[0], bb[0]), Math.min(cur[1], bb[1]), Math.max(cur[2], bb[2]), Math.max(cur[3], bb[3])] : bb,
  );
}

/** Comunidades autónomas cuya extensión toca la caja (para pedir a AEMET solo lo necesario). */
export const areasForBBox = (bbox: BBoxTuple): string[] =>
  [...AREA_BBOX].filter(([, bb]) => bboxIntersects(bb, bbox)).map(([area]) => area);

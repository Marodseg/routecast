import type { LatLng } from '@routecast/shared';
import { normalizeDeg } from './wind';

const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

/** Diferencia de longitudes en (-180, 180]: el camino corto, también a través del antimeridiano. */
const deltaLng = (a: number, b: number): number => {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return d === -180 ? 180 : d;
};

/** Distancia ortodrómica en metros (fórmula de haversine). */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = deltaLng(a.lng, b.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumbo inicial de `a` hacia `b` en [0, 360) (0 = norte, sentido horario). Puntos iguales → 0. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const φ1 = a.lat * RAD;
  const φ2 = b.lat * RAD;
  const Δλ = deltaLng(a.lng, b.lng) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  if (Math.abs(x) < 1e-15 && Math.abs(y) < 1e-15) return 0;
  return normalizeDeg(Math.atan2(y, x) / RAD);
}

/** Diferencia angular mínima en [0, 180]. */
export function angularDiffDeg(a: number, b: number): number {
  const d = Math.abs(normalizeDeg(a) - normalizeDeg(b));
  return d > 180 ? 360 - d : d;
}

/** Media circular ponderada; null si no hay datos o los rumbos se anulan (resultante ≈ 0). */
export function circularMeanDeg(angles: readonly number[], weights?: readonly number[]): number | null {
  let x = 0;
  let y = 0;
  let total = 0;
  angles.forEach((a, i) => {
    const w = weights?.[i] ?? 1;
    x += w * Math.cos(a * RAD);
    y += w * Math.sin(a * RAD);
    total += w;
  });
  if (total <= 0 || Math.hypot(x, y) / total < 1e-9) return null;
  return normalizeDeg(Math.atan2(y, x) / RAD);
}

/** Distancia acumulada (m) hasta cada vértice. */
export function cumulativeDistancesM(geometry: readonly LatLng[]): number[] {
  const out: number[] = [];
  let acc = 0;
  geometry.forEach((p, i) => {
    const prev = geometry[i - 1];
    if (prev) acc += haversineM(prev, p);
    out.push(acc);
  });
  return out;
}

export interface PointOnLine {
  at: LatLng;
  /** Índice del vértice inicial del segmento que contiene el punto. */
  segment: number;
  /** Fracción [0, 1] dentro del segmento. */
  t: number;
}

/** Interpolación lineal en lat/lng (suficiente para segmentos de ruta, que son cortos). */
function lerp(a: LatLng, b: LatLng, t: number): LatLng {
  const lng = a.lng + deltaLng(a.lng, b.lng) * t;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: lng > 180 ? lng - 360 : lng < -180 ? lng + 360 : lng };
}

/** Punto a `d` metros del origen sobre la polilínea, acotado a los extremos. */
export function pointAtDistance(geometry: readonly LatLng[], cum: readonly number[], d: number): PointOnLine {
  const first = geometry[0];
  if (!first) throw new RangeError('pointAtDistance: geometría vacía');
  const last = geometry.length - 1;
  const total = cum[last] ?? 0;
  if (d <= 0 || last === 0) return { at: first, segment: 0, t: 0 };
  if (d >= total) return { at: geometry[last] ?? first, segment: Math.max(0, last - 1), t: 1 };
  // Búsqueda binaria del primer vértice con distancia acumulada ≥ d.
  let lo = 1;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((cum[mid] ?? 0) < d) lo = mid + 1;
    else hi = mid;
  }
  const i = lo - 1;
  const a = geometry[i] ?? first;
  const b = geometry[lo] ?? a;
  const len = (cum[lo] ?? 0) - (cum[i] ?? 0);
  const t = len > 0 ? (d - (cum[i] ?? 0)) / len : 0;
  return { at: lerp(a, b, t), segment: i, t };
}

/**
 * Rumbo suavizado en `d`: media circular de los rumbos de los segmentos que solapan [d − w, d + w],
 * ponderada por la longitud solapada (SPEC §6.2). Ignora segmentos de longitud 0.
 */
export function smoothedHeadingAt(
  geometry: readonly LatLng[],
  cum: readonly number[],
  d: number,
  windowM: number,
): number {
  const n = geometry.length;
  if (n < 2) return 0;
  // Solo los segmentos que tocan la ventana: O(log n + k). Recorrer toda la ruta en cada consulta era O(n) y, al
  // muestrear rutas largas y densas (≈ 60.000 vértices), O(n²): bloqueaba el navegador.
  const angles: number[] = [];
  const weights: number[] = [];
  for (let i = Math.max(0, upperBound(cum, d - windowM) - 1); i < n - 1 && (cum[i] ?? 0) < d + windowM; i++) {
    const a = geometry[i];
    const b = geometry[i + 1];
    const s0 = cum[i] ?? 0;
    const s1 = cum[i + 1] ?? 0;
    if (!a || !b || s1 - s0 <= 0) continue;
    const overlap = Math.min(s1, d + windowM) - Math.max(s0, d - windowM);
    if (overlap > 0) {
      angles.push(bearingDeg(a, b));
      weights.push(overlap);
    }
  }
  const mean = circularMeanDeg(angles, weights);
  if (mean !== null) return mean;
  // Sin solape (fuera de la ruta o ventana sobre segmentos de longitud 0): el segmento con longitud más cercano.
  const k = Math.min(n - 2, Math.max(0, upperBound(cum, d) - 1));
  for (let off = 0; off < n; off++) {
    for (const i of off ? [k - off, k + off] : [k]) {
      const a = geometry[i];
      const b = geometry[i + 1];
      if (a && b && (cum[i + 1] ?? 0) - (cum[i] ?? 0) > 0) return bearingDeg(a, b);
    }
  }
  return 0;
}

/** Primer índice con cum[i] > x (búsqueda binaria; cum es no decreciente). */
function upperBound(cum: readonly number[], x: number): number {
  let lo = 0;
  let hi = cum.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((cum[mid] ?? 0) > x) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Trozo de la polilínea entre dos distancias (m), con los extremos interpolados. */
export function sliceLine(geometry: readonly LatLng[], cum: readonly number[], fromM: number, toM: number): LatLng[] {
  if (geometry.length === 0) return [];
  const a = pointAtDistance(geometry, cum, Math.min(fromM, toM));
  const b = pointAtDistance(geometry, cum, Math.max(fromM, toM));
  const out: LatLng[] = [a.at];
  for (let i = a.segment + 1; i <= b.segment; i++) {
    const p = geometry[i];
    if (p) out.push(p);
  }
  out.push(b.at);
  return out;
}

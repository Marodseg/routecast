import type { HourlyWeather, LatLng, UnixMs } from '@routecast/shared';

/** Resolución de la rejilla de deduplicación (SPEC F5, CLAUDE.md regla 6). */
export const CELL_DEG = 0.1;

const fmt = (n: number): string => {
  // Redondeo simétrico (mitades lejos de cero): la rejilla es igual en ambos hemisferios.
  const steps = Math.round(Math.abs(n) / CELL_DEG + 1e-9);
  const r = Math.sign(n) * steps * CELL_DEG;
  const v = Object.is(r, -0) || Math.abs(r) < 1e-9 ? 0 : r;
  // -180° y 180° son el mismo meridiano.
  return (v <= -180 ? 180 : v).toFixed(1);
};

/** Clave de celda "lat:lng" cuantizada a 0,1°. */
export const cellKey = (p: LatLng): string => `${fmt(p.lat)}:${fmt(p.lng)}`;

export function cellCenter(key: string): LatLng {
  const m = /^(-?\d+\.\d):(-?\d+\.\d)$/.exec(key);
  if (!m) throw new RangeError(`cellCenter: clave no válida «${key}»`);
  return { lat: Number(m[1]), lng: Number(m[2]) };
}

/** Celdas únicas en orden de aparición (una petición multi-ubicación por ruta, ARCHITECTURE §4.2). */
export function uniqueCells(points: readonly LatLng[]): { key: string; at: LatLng }[] {
  const seen = new Map<string, LatLng>();
  for (const p of points) {
    const k = cellKey(p);
    if (!seen.has(k)) seen.set(k, cellCenter(k));
  }
  return [...seen].map(([key, at]) => ({ key, at }));
}

/** Una hora de previsión con todos sus valores (null = ausente). */
export interface HourSample {
  timeMs: UnixMs;
  precipitationMmH: number | null;
  gustsKmH: number | null;
  windKmH: number | null;
  windFromDeg: number | null;
  weatherCode: number | null;
  tempC: number | null;
  visibilityM: number | null;
  cape: number | null;
  lightningPotential: number | null;
  snowfallCmH: number | null;
}

export const WINDOW_MS = 30 * 60_000;
const HOUR_MS = 3_600_000;

const at = (arr: readonly (number | null)[], i: number): number | null => {
  const v = arr[i];
  return v === undefined || v === null || !Number.isFinite(v) ? null : v;
};

const sortedCache = new WeakMap<readonly number[], boolean>();
function isSorted(times: readonly number[]): boolean {
  let v = sortedCache.get(times);
  if (v === undefined) {
    v = times.every((t, i) => i === 0 || t >= (times[i - 1] as number));
    sortedCache.set(times, v);
  }
  return v;
}

/** Primer índice con times[i] ≥ x (times no decreciente). */
function lowerBound(times: readonly number[], x: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] as number) < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Registros horarios relevantes para pasar por un punto a `etaMs` (ventana ±30 min, SPEC §6.1), respetando la
 * semántica de Open-Meteo (verificada en open-meteo.com/en/docs, 2026-10-10):
 * - precipitación, nieve y rachas son AGREGADOS de la hora anterior al sello: el sello t cubre (t − 1 h, t].
 *   Entran los sellos cuyo intervalo solapa la ventana: t ∈ (ETA − 30 min, ETA + 90 min).
 * - el resto de variables son INSTANTÁNEAS: entran los sellos con |t − ETA| ≤ 30 min.
 * Cada registro con agregados toma los instantáneos (dirección, temperatura…) del instante de la ventana más
 * cercano, para que la racha cruzada combine racha y dirección coherentes.
 * Fuera del horizonte devuelve [] y el punto queda «sin datos»: nunca se extrapola.
 */
export function hoursAround(hw: HourlyWeather, etaMs: UnixMs, windowMs = WINDOW_MS): HourSample[] {
  const instant: number[] = [];
  const interval: number[] = [];
  const times = hw.timesMs;
  const consider = (i: number) => {
    const t = times[i] as number;
    if (Math.abs(t - etaMs) <= windowMs) instant.push(i);
    if (t > etaMs - windowMs && t - HOUR_MS < etaMs + windowMs) interval.push(i);
  };
  // Solo los sellos en [ETA − w, ETA + w + 1 h): búsqueda binaria en vez de recorrer la serie entera (7 días × cada
  // punto × cada hora de salida del dial). Una serie desordenada (dato externo) se recorre entera.
  if (isSorted(times)) {
    const hi = etaMs + windowMs + HOUR_MS;
    for (let i = lowerBound(times, etaMs - windowMs); i < times.length && (times[i] as number) < hi; i++) consider(i);
  } else {
    for (let i = 0; i < times.length; i++) consider(i);
  }
  if (instant.length === 0) return [];
  const nearestInstant = (t: number): number =>
    instant.reduce((best, i) =>
      Math.abs((hw.timesMs[i] ?? 0) - t) < Math.abs((hw.timesMs[best] ?? 0) - t) ? i : best,
    );

  const stamps = [...new Set([...instant, ...interval])].sort((a, b) => (times[a] as number) - (times[b] as number));
  return stamps.map((i) => {
    const t = hw.timesMs[i] ?? 0;
    const k = instant.includes(i) ? i : nearestInstant(t);
    const agg = interval.includes(i);
    return {
      timeMs: t,
      precipitationMmH: agg ? at(hw.precipitationMmH, i) : null,
      gustsKmH: agg ? at(hw.gustsKmH, i) : null,
      snowfallCmH: agg ? at(hw.snowfallCmH, i) : null,
      windKmH: at(hw.windKmH, k),
      windFromDeg: at(hw.windFromDeg, k),
      weatherCode: at(hw.weatherCode, k),
      tempC: at(hw.tempC, k),
      visibilityM: at(hw.visibilityM, k),
      cape: at(hw.cape, k),
      lightningPotential: at(hw.lightningPotential, k),
    };
  });
}

import type { HourlyWeather, LatLng, UnixMs } from '@routecast/shared';

/** Resolución de la rejilla de deduplicación (SPEC F5, CLAUDE.md regla 6). */
export const CELL_DEG = 0.1;

const fmt = (n: number): string => {
  // Redondeo simétrico (mitades lejos de cero): la rejilla es igual en ambos hemisferios.
  const steps = Math.round(Math.abs(n) / CELL_DEG + 1e-9);
  const r = Math.sign(n) * steps * CELL_DEG;
  return (Object.is(r, -0) || Math.abs(r) < 1e-9 ? 0 : r).toFixed(1);
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

const at = (arr: readonly (number | null)[], i: number): number | null => {
  const v = arr[i];
  return v === undefined || v === null || !Number.isFinite(v) ? null : v;
};

/**
 * Horas de previsión dentro de ±30 min de la ETA (bordes inclusivos), SPEC §6.1.
 * Fuera del horizonte devuelve [] y el punto queda «sin datos»: nunca se extrapola.
 */
export function hoursAround(hw: HourlyWeather, etaMs: UnixMs, windowMs = WINDOW_MS): HourSample[] {
  const out: HourSample[] = [];
  hw.timesMs.forEach((t, i) => {
    if (Math.abs(t - etaMs) > windowMs) return;
    out.push({
      timeMs: t,
      precipitationMmH: at(hw.precipitationMmH, i),
      gustsKmH: at(hw.gustsKmH, i),
      windKmH: at(hw.windKmH, i),
      windFromDeg: at(hw.windFromDeg, i),
      weatherCode: at(hw.weatherCode, i),
      tempC: at(hw.tempC, i),
      visibilityM: at(hw.visibilityM, i),
      cape: at(hw.cape, i),
      lightningPotential: at(hw.lightningPotential, i),
      snowfallCmH: at(hw.snowfallCmH, i),
    });
  });
  return out;
}

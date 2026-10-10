import type { HourlyWeather } from '@routecast/shared';
import type { HourSample } from '../src/weather';

export const T0 = Date.UTC(2026, 9, 10, 12, 0);
export const H = 3_600_000;

/** Hora sin riesgo con todos los datos presentes. */
export const calmHour = (timeMs = T0, over: Partial<HourSample> = {}): HourSample => ({
  timeMs,
  precipitationMmH: 0,
  gustsKmH: 10,
  windKmH: 5,
  windFromDeg: 0,
  weatherCode: 0,
  tempC: 18,
  visibilityM: 20_000,
  cape: 0,
  lightningPotential: null,
  snowfallCmH: 0,
  ...over,
});

/** Serie horaria de `n` horas desde T0 con valores por defecto en calma; `patch` cambia horas concretas. */
export function hourly(n: number, patch: Record<number, Partial<HourSample>> = {}, cell = '37.0:-4.5'): HourlyWeather {
  const hours = Array.from({ length: n }, (_, i) => calmHour(T0 + i * H, patch[i] ?? {}));
  return {
    cell,
    timesMs: hours.map((h) => h.timeMs),
    precipitationMmH: hours.map((h) => h.precipitationMmH),
    gustsKmH: hours.map((h) => h.gustsKmH),
    windKmH: hours.map((h) => h.windKmH),
    windFromDeg: hours.map((h) => h.windFromDeg),
    weatherCode: hours.map((h) => h.weatherCode),
    tempC: hours.map((h) => h.tempC),
    visibilityM: hours.map((h) => h.visibilityM),
    cape: hours.map((h) => h.cape),
    lightningPotential: hours.map((h) => h.lightningPotential),
    snowfallCmH: hours.map((h) => h.snowfallCmH),
    fetchedAtMs: T0,
  };
}

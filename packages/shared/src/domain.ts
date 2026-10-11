/** Modelos de dominio (ARCHITECTURE §3). `null` = dato ausente; nunca se sustituye por 0. */

export type LatLng = { lat: number; lng: number };
export type UnixMs = number;

export interface Route {
  id: string;
  /** Polilínea simplificada para pintar y muestrear. */
  geometry: LatLng[];
  distanceM: number;
  durationS: number;
  /** Segundos desde el origen hasta geometry[i]. */
  cumDurationS: number[];
  provider: string;
  /** Vías principales («A-45 · A-92») si el proveedor las da. */
  name?: string;
}

export interface SamplePoint {
  index: number;
  at: LatLng;
  kmFromStart: number;
  /** Salida + duración acumulada interpolada. */
  etaMs: UnixMs;
  /** Rumbo suavizado de la carretera, [0, 360). */
  headingDeg: number;
}

export interface HourlyWeather {
  /** "lat:lng" cuantizado a 0,1°. */
  cell: string;
  timesMs: UnixMs[];
  precipitationMmH: (number | null)[];
  gustsKmH: (number | null)[];
  windKmH: (number | null)[];
  windFromDeg: (number | null)[];
  weatherCode: (number | null)[];
  tempC: (number | null)[];
  visibilityM: (number | null)[];
  cape: (number | null)[];
  lightningPotential: (number | null)[];
  snowfallCmH: (number | null)[];
  fetchedAtMs: UnixMs;
}

export const RISK_LEVEL_VALUES = [0, 1, 2, 3] as const;
export type RiskLevel = (typeof RISK_LEVEL_VALUES)[number];
export type RiskLevelOrUnknown = RiskLevel | 'unknown';

export const FACTORS = ['rain', 'crosswind', 'gust', 'snow', 'ice', 'visibility', 'storm'] as const;
export type Factor = (typeof FACTORS)[number];

export interface PointRisk {
  level: RiskLevelOrUnknown;
  dominant?: Factor;
  values: Record<string, number | null>;
}

export interface Place {
  id: string;
  name: string;
  /** Provincia, región o país, para desambiguar. */
  detail?: string;
  at: LatLng;
}

/** Contratos de proveedor (ARCHITECTURE §4, ADR-0003). La UI y core solo conocen estas interfaces. */
import type { HourlyWeather, LatLng, Place, Route, UnixMs } from './domain';

export type { HourlyWeather, LatLng, Place, Route, UnixMs } from './domain';

export type ProviderError =
  | { kind: 'rate_limited'; retryAfterS?: number }
  | { kind: 'unavailable'; status?: number }
  | { kind: 'timeout' }
  | { kind: 'bad_response'; detail: string }
  | { kind: 'no_route' }
  | { kind: 'no_coverage' }
  | { kind: 'aborted' };

export type Result<T, E = ProviderError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export interface RoutingProvider {
  readonly id: string;
  getRoutes(from: LatLng, to: LatLng, opts: { alternatives: number; signal: AbortSignal }): Promise<Result<Route[]>>;
}

export interface WeatherCell {
  /** Clave de celda de core (`cellKey`). */
  key: string;
  at: LatLng;
}

export interface WeatherProvider {
  readonly id: string;
  getHourly(
    cells: readonly WeatherCell[],
    opts: {
      signal: AbortSignal;
      forecastDays?: number;
      /** Avance para la UI: celdas resueltas (con o sin éxito) de `total`. */
      onProgress?: (done: number, total: number) => void;
    },
  ): Promise<Result<HourlyWeather[]>>;
}

export interface GeocodingProvider {
  readonly id: string;
  suggest(query: string, opts: { signal: AbortSignal; bias?: LatLng }): Promise<Result<Place[]>>;
}

export type BBox = [west: number, south: number, east: number, north: number];

export type WarningLevel = 'yellow' | 'orange' | 'red';

/** Fenómeno normalizado (los textos se traducen en la UI). */
export const WARNING_KINDS = [
  'wind',
  'rain',
  'snow',
  'storm',
  'fog',
  'heat',
  'cold',
  'coastal',
  'dust',
  'other',
] as const;
export type WarningKind = (typeof WARNING_KINDS)[number];

export interface Warning {
  id: string;
  level: WarningLevel;
  kind: WarningKind;
  /** Zona de aviso (nombre oficial de AEMET, p. ej. «Vega de Granada»). */
  areaName: string;
  /** Código de zona AEMET-Meteoalerta si se conoce. */
  zoneCode?: string;
  /** Polígonos del área [lng, lat]; vacío si la zona no se pudo localizar. */
  polygons: [number, number][][];
  fromMs: UnixMs;
  toMs: UnixMs;
  /** Texto oficial breve (p. ej. «Precipitación acumulada en una hora: 20 mm.»), si existe. */
  description?: string;
  source: 'AEMET' | 'Meteoalarm';
}

export interface WarningsProvider {
  readonly id: string;
  getWarnings(
    bbox: BBox,
    window: [UnixMs, UnixMs],
    opts: { signal: AbortSignal },
  ): Promise<Result<{ warnings: Warning[]; partial: boolean }>>;
}

/** Texto corto y estable de un error para registros y tests. */
export const describeError = (e: ProviderError): string =>
  e.kind === 'bad_response' ? `bad_response: ${e.detail}` : e.kind;

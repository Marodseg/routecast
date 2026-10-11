import {
  err,
  type HourlyWeather,
  ok,
  type Result,
  type WeatherCell,
  type WeatherProvider,
} from '@routecast/shared/providers';
import { z } from 'zod';
import { type Clock, realClock } from './fallback';
import { getJson } from './http';

/** Variables horarias pedidas (SPEC §6.1). `lightning_potential` no existe en horario (PROVIDERS.md, 2026-10-10). */
export const HOURLY_VARS = [
  'precipitation',
  'snowfall',
  'weather_code',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'temperature_2m',
  'visibility',
  'cape',
] as const;

const series = z.array(z.number().nullable());

/** Tolerante: una variable ausente o de longitud distinta se degrada a nulls, no rompe (CLAUDE.md regla 4). */
const Location = z.object({
  latitude: z.number(),
  longitude: z.number(),
  hourly: z.object({ time: z.array(z.number().int()) }).catchall(z.unknown()),
});

export const OpenMeteoResponse = z.union([z.array(Location).min(1), Location]);

/**
 * Celdas por petición y lotes simultáneos. La latencia de Open-Meteo crece con las ubicaciones de cada petición
 * (medido el 2026-10-11: 10 → 3 s, 25 → 6 s, 50 → 14-35 s): lotes pequeños en paralelo tardan mucho menos que uno
 * grande, con el mismo peso en el límite por IP (PROVIDERS.md).
 */
export const MAX_CELLS_PER_REQUEST = 20;
const MAX_PARALLEL = 3;
/** Timeout por lote: base + margen por ubicación (un lote lleno ≈ 22 s). */
const BASE_TIMEOUT_MS = 10_000;
const PER_CELL_TIMEOUT_MS = 600;

export interface OpenMeteoOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  clock?: Clock;
  /** Reintentos ante 429 (respetando Retry-After, máx. 10 s de espera cada uno). */
  maxRetries?: number;
  /** Escalonado entre los primeros lotes en paralelo (ms). */
  batchGapMs?: number;
}

function column(hourly: Record<string, unknown>, key: string, n: number): (number | null)[] {
  const parsed = series.safeParse(hourly[key]);
  if (!parsed.success || parsed.data.length !== n) return new Array<number | null>(n).fill(null);
  return parsed.data.map((v) => (v === null || Number.isFinite(v) ? v : null));
}

export function toHourly(loc: z.infer<typeof Location>, cell: string, fetchedAtMs: number): HourlyWeather {
  const n = loc.hourly.time.length;
  const h = loc.hourly as Record<string, unknown>;
  return {
    cell,
    timesMs: loc.hourly.time.map((t) => t * 1000),
    precipitationMmH: column(h, 'precipitation', n),
    snowfallCmH: column(h, 'snowfall', n),
    weatherCode: column(h, 'weather_code', n),
    windKmH: column(h, 'wind_speed_10m', n),
    gustsKmH: column(h, 'wind_gusts_10m', n),
    windFromDeg: column(h, 'wind_direction_10m', n),
    tempC: column(h, 'temperature_2m', n),
    visibilityM: column(h, 'visibility', n),
    cape: column(h, 'cape', n),
    lightningPotential: new Array<number | null>(n).fill(null),
    fetchedAtMs,
  };
}

/**
 * Open-Meteo desde el navegador (ADR-0002): una petición multi-ubicación por lote, `timezone=UTC`,
 * `timeformat=unixtime`. La respuesta viene en el MISMO orden pedido y con coordenadas ajustadas a la rejilla del
 * modelo, así que se asocia por índice, nunca por coordenada.
 */
export class OpenMeteoWeather implements WeatherProvider {
  readonly id = 'open-meteo';
  readonly #o: OpenMeteoOptions;

  constructor(o: OpenMeteoOptions = {}) {
    this.#o = o;
  }

  async getHourly(
    cells: readonly WeatherCell[],
    opts: { signal: AbortSignal; forecastDays?: number; onProgress?: (done: number, total: number) => void },
  ): Promise<Result<HourlyWeather[]>> {
    const clock = this.#o.clock ?? realClock;
    const batches: WeatherCell[][] = [];
    for (let i = 0; i < cells.length; i += MAX_CELLS_PER_REQUEST)
      batches.push(cells.slice(i, i + MAX_CELLS_PER_REQUEST));
    const results: Result<HourlyWeather[]>[] = [];
    // Varios lotes a la vez (la latencia crece con las ubicaciones de cada petición), escalonados al empezar.
    let next = 0;
    let done = 0;
    const worker = async (w: number) => {
      if (w > 0) await clock.sleep(w * (this.#o.batchGapMs ?? 250), opts.signal);
      while (next < batches.length && !opts.signal.aborted) {
        const i = next++;
        const batch = batches[i] as WeatherCell[];
        results[i] = await this.#batch(batch, opts, clock);
        done += batch.length;
        if (!opts.signal.aborted) opts.onProgress?.(done, cells.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, batches.length) }, (_, w) => worker(w)));
    if (opts.signal.aborted) return err({ kind: 'aborted' });
    // Lo ya descargado sigue valiendo: se devuelve parcial y quien llama detecta las celdas que faltan.
    const out = results.flatMap((r) => (r.ok ? r.value : []));
    const failed = results.find((r) => !r.ok);
    return out.length > 0 || !failed ? ok(out) : failed;
  }

  async #batch(
    batch: readonly WeatherCell[],
    opts: { signal: AbortSignal; forecastDays?: number },
    clock: Clock,
  ): Promise<Result<HourlyWeather[]>> {
    const params = new URLSearchParams({
      latitude: batch.map((c) => c.at.lat.toFixed(2)).join(','),
      longitude: batch.map((c) => c.at.lng.toFixed(2)).join(','),
      hourly: HOURLY_VARS.join(','),
      timezone: 'UTC',
      timeformat: 'unixtime',
      wind_speed_unit: 'kmh',
      forecast_days: String(Math.max(1, Math.min(7, opts.forecastDays ?? 3))),
    });
    const url = `${this.#o.baseUrl ?? 'https://api.open-meteo.com'}/v1/forecast?${params}`;
    for (let attempt = 0; ; attempt++) {
      const res = await getJson(url, {
        schema: OpenMeteoResponse,
        signal: opts.signal,
        timeoutMs: this.#o.timeoutMs ?? BASE_TIMEOUT_MS + PER_CELL_TIMEOUT_MS * batch.length,
        ...(this.#o.fetchImpl ? { fetchImpl: this.#o.fetchImpl } : {}),
      });
      if (res.ok) {
        const locs = Array.isArray(res.value) ? res.value : [res.value];
        if (locs.length !== batch.length) {
          return err({
            kind: 'bad_response',
            detail: `esperaba ${batch.length} ubicaciones y llegaron ${locs.length}`,
          });
        }
        const now = clock.now();
        return ok(locs.map((loc, j) => toHourly(loc, (batch[j] as WeatherCell).key, now)));
      }
      // 429 es un estado normal (CLAUDE.md regla 6): esperamos lo que pida, con tope, y reintentamos.
      if (res.error.kind !== 'rate_limited' || attempt >= (this.#o.maxRetries ?? 2)) return res;
      await clock.sleep(Math.min(10, res.error.retryAfterS ?? 2 ** (attempt + 1)) * 1000, opts.signal);
      if (opts.signal.aborted) return err({ kind: 'aborted' });
    }
  }
}

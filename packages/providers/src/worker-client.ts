import {
  type BBox,
  err,
  type LatLng,
  ok,
  type ProviderError,
  type Result,
  type Route,
  type RoutingProvider,
  type UnixMs,
  WARNING_KINDS,
  type Warning,
  type WarningsProvider,
} from '@routecast/shared/providers';
import { z } from 'zod';
import { getJson } from './http';

const Ring = z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).min(3);

const WarningSchema = z.object({
  id: z.string().max(300),
  level: z.enum(['yellow', 'orange', 'red']),
  kind: z.enum(WARNING_KINDS).catch('other'),
  areaName: z.string().max(200),
  zoneCode: z.string().max(20).optional(),
  polygons: z.array(Ring).max(20),
  fromMs: z.number(),
  toMs: z.number(),
  description: z.string().max(500).optional(),
  source: z.enum(['AEMET', 'Meteoalarm']),
});

export const WarningsResponse = z.object({ warnings: z.array(WarningSchema).max(500), partial: z.boolean() });

const LatLngSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export const WorkerRoutesResponse = z.object({
  routes: z
    .array(
      z.object({
        id: z.string(),
        geometry: z.array(LatLngSchema).min(2),
        distanceM: z.number().nonnegative(),
        durationS: z.number().nonnegative(),
        cumDurationS: z.array(z.number().nonnegative()),
        provider: z.string(),
        name: z.string().optional(),
      }),
    )
    .min(1)
    .max(3),
});

const mapWorkerError = (status: number, b: unknown): ProviderError | undefined => {
  const code = (b as { error?: unknown } | null)?.error;
  if (code === 'no_route') return { kind: 'no_route' };
  if (code === 'out_of_coverage') return { kind: 'no_coverage' };
  if (status === 404) return { kind: 'unavailable', status };
  return undefined;
};

export interface WorkerClientOptions {
  /** URL base del Worker (p. ej. https://routecast-api.<cuenta>.workers.dev). */
  baseUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Avisos oficiales a través de nuestro Worker (las claves nunca llegan al navegador). */
export class WorkerWarnings implements WarningsProvider {
  readonly id = 'worker-warnings';
  readonly #o: WorkerClientOptions;

  constructor(o: WorkerClientOptions) {
    this.#o = o;
  }

  async getWarnings(
    bbox: BBox,
    window: [UnixMs, UnixMs],
    opts: { signal: AbortSignal },
  ): Promise<Result<{ warnings: Warning[]; partial: boolean }>> {
    const r = (n: number) => n.toFixed(2);
    const q = new URLSearchParams({
      bbox: bbox.map(r).join(','),
      from: String(Math.floor(window[0])),
      to: String(Math.ceil(window[1])),
    });
    const res = await getJson(`${this.#o.baseUrl}/api/warnings?${q}`, {
      schema: WarningsResponse,
      signal: opts.signal,
      timeoutMs: this.#o.timeoutMs ?? 20_000,
      ...(this.#o.fetchImpl ? { fetchImpl: this.#o.fetchImpl } : {}),
      mapClientError: mapWorkerError,
    });
    if (!res.ok) return res;
    return ok({
      partial: res.value.partial,
      warnings: res.value.warnings.map((w) => {
        const { zoneCode, description, ...rest } = w;
        return { ...rest, ...(zoneCode ? { zoneCode } : {}), ...(description ? { description } : {}) };
      }),
    });
  }
}

/** Rutas de OpenRouteService a través del Worker: último recurso de la cadena de respaldo (ADR-0008). */
export class WorkerRouting implements RoutingProvider {
  readonly id = 'ors';
  readonly #o: WorkerClientOptions;

  constructor(o: WorkerClientOptions) {
    this.#o = o;
  }

  async getRoutes(
    from: LatLng,
    to: LatLng,
    opts: { alternatives: number; signal: AbortSignal },
  ): Promise<Result<Route[]>> {
    const p = (x: LatLng) => `${x.lat.toFixed(5)},${x.lng.toFixed(5)}`;
    const q = new URLSearchParams({
      from: p(from),
      to: p(to),
      alt: String(Math.max(0, Math.min(2, opts.alternatives))),
    });
    const res = await getJson(`${this.#o.baseUrl}/api/route?${q}`, {
      schema: WorkerRoutesResponse,
      signal: opts.signal,
      timeoutMs: this.#o.timeoutMs ?? 20_000,
      ...(this.#o.fetchImpl ? { fetchImpl: this.#o.fetchImpl } : {}),
      mapClientError: mapWorkerError,
    });
    if (!res.ok) return res;
    for (const r of res.value.routes) {
      if (r.cumDurationS.length !== r.geometry.length) return err({ kind: 'bad_response', detail: 'cumDurationS' });
    }
    return ok(res.value.routes.map(({ name, ...r }) => ({ ...r, ...(name ? { name } : {}) })));
  }
}

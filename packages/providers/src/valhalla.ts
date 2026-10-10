import {
  err,
  type LatLng,
  ok,
  type ProviderError,
  type Result,
  type Route,
  type RoutingProvider,
} from '@routecast/shared/providers';
import { z } from 'zod';
import { getJson } from './http';
import { decodePolyline } from './polyline';
import { routeName, segmentLengthsM } from './route-utils';

const Maneuver = z.object({
  time: z.number().nonnegative(),
  length: z.number().nonnegative(),
  begin_shape_index: z.number().int().nonnegative(),
  end_shape_index: z.number().int().nonnegative(),
  street_names: z.array(z.string()).optional(),
});

const Trip = z.object({
  summary: z.object({ time: z.number().nonnegative(), length: z.number().nonnegative() }),
  legs: z.array(z.object({ shape: z.string().min(1), maneuvers: z.array(Maneuver).min(1) })).min(1),
});

export const ValhallaResponse = z.object({
  trip: Trip,
  alternates: z.array(z.object({ trip: Trip })).optional(),
});

/** Errores de Valhalla que significan «no hay camino» o puntos fuera de la red (no reintentables). */
const NO_ROUTE_CODES = new Set([170, 171, 442, 443]);

export interface ValhallaOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Reparte el tiempo de cada maniobra por distancia entre sus vértices → segundos acumulados por vértice. */
export function cumulativeFromManeuvers(geometry: LatLng[], maneuvers: z.infer<typeof Maneuver>[]): number[] {
  const seg = segmentLengthsM(geometry);
  const cum = new Array<number>(geometry.length).fill(0);
  let t = 0;
  for (const m of maneuvers) {
    const from = Math.min(m.begin_shape_index, geometry.length - 1);
    const to = Math.min(Math.max(m.end_shape_index, from), geometry.length - 1);
    let len = 0;
    for (let i = from; i < to; i++) len += seg[i] ?? 0;
    for (let i = from; i < to; i++) {
      const share = len > 0 ? (seg[i] ?? 0) / len : 1 / Math.max(1, to - from);
      t += m.time * share;
      cum[i + 1] = t;
    }
  }
  // Monotonía garantizada aunque una maniobra venga mal indexada.
  for (let i = 1; i < cum.length; i++) cum[i] = Math.max(cum[i] ?? 0, cum[i - 1] ?? 0);
  return cum;
}

export function tripToRoute(trip: z.infer<typeof Trip>, id: string): Route {
  const geometry: LatLng[] = [];
  const maneuvers: z.infer<typeof Maneuver>[] = [];
  for (const leg of trip.legs) {
    const offset = geometry.length === 0 ? 0 : geometry.length - 1;
    const shape = decodePolyline(leg.shape, 6);
    geometry.push(...(geometry.length === 0 ? shape : shape.slice(1)));
    for (const m of leg.maneuvers) {
      maneuvers.push({
        ...m,
        begin_shape_index: m.begin_shape_index + offset,
        end_shape_index: m.end_shape_index + offset,
      });
    }
  }
  return {
    id,
    geometry,
    distanceM: Math.round(trip.summary.length * 1000),
    durationS: Math.round(trip.summary.time),
    cumDurationS: cumulativeFromManeuvers(geometry, maneuvers),
    provider: 'valhalla',
    name: routeName(maneuvers.map((m) => ({ names: m.street_names ?? [], lengthM: m.length * 1000 }))),
  };
}

/**
 * Valhalla (demo FOSSGIS). Da alternativas de verdad (OSRM demo a menudo no). Demo sin SLA, ~1 req/s por IP,
 * «no para producción» (PROVIDERS.md): va detrás de throttle y circuit breaker en `FallbackRouting`.
 */
export class ValhallaRouting implements RoutingProvider {
  readonly id = 'valhalla';
  readonly #o: ValhallaOptions;

  constructor(o: ValhallaOptions = {}) {
    this.#o = o;
  }

  async getRoutes(
    from: LatLng,
    to: LatLng,
    opts: { alternatives: number; signal: AbortSignal },
  ): Promise<Result<Route[]>> {
    const body = {
      locations: [
        { lat: from.lat, lon: from.lng },
        { lat: to.lat, lon: to.lng },
      ],
      costing: 'auto',
      alternates: Math.max(0, Math.min(2, opts.alternatives)),
      units: 'kilometers',
      directions_type: 'maneuvers',
      language: 'es-ES',
    };
    const url = `${this.#o.baseUrl ?? 'https://valhalla1.openstreetmap.de'}/route?json=${encodeURIComponent(JSON.stringify(body))}`;
    const res = await getJson(url, {
      schema: ValhallaResponse,
      signal: opts.signal,
      timeoutMs: this.#o.timeoutMs ?? 12_000,
      ...(this.#o.fetchImpl ? { fetchImpl: this.#o.fetchImpl } : {}),
      mapClientError: (_status, b): ProviderError | undefined => {
        const code = (b as { error_code?: unknown } | null)?.error_code;
        return typeof code === 'number' && NO_ROUTE_CODES.has(code) ? { kind: 'no_route' } : undefined;
      },
    });
    if (!res.ok) return res;
    const trips = [res.value.trip, ...(res.value.alternates ?? []).map((a) => a.trip)];
    try {
      return ok(trips.map((trip, i) => tripToRoute(trip, `valhalla-${i}`)));
    } catch (e) {
      return err({ kind: 'bad_response', detail: e instanceof Error ? e.message : 'geometría no válida' });
    }
  }
}

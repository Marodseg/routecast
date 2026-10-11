import {
  type LatLng,
  ok,
  type ProviderError,
  type Result,
  type Route,
  type RoutingProvider,
} from '@routecast/shared/providers';
import { z } from 'zod';
import { getJson } from './http';
import { routeName } from './route-utils';

const Coord = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const OsrmResponse = z.object({
  code: z.literal('Ok'),
  routes: z
    .array(
      z.object({
        distance: z.number().nonnegative(),
        duration: z.number().nonnegative(),
        geometry: z.object({ type: z.literal('LineString'), coordinates: z.array(Coord).min(2) }),
        legs: z
          .array(
            z.object({
              summary: z.string().optional(),
              distance: z.number().nonnegative(),
              annotation: z.object({ duration: z.array(z.number().nonnegative()) }),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export interface OsrmOptions {
  /** Base hasta el perfil, p. ej. https://routing.openstreetmap.de/routed-car o https://router.project-osrm.org */
  baseUrl: string;
  id: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** OSRM (demos públicos). `annotations=duration` da un tiempo por par de coordenadas → `cumDurationS` exacto. */
export class OsrmRouting implements RoutingProvider {
  readonly id: string;
  readonly #o: OsrmOptions;

  constructor(o: OsrmOptions) {
    this.#o = o;
    this.id = o.id;
  }

  async getRoutes(
    from: LatLng,
    to: LatLng,
    opts: { alternatives: number; signal: AbortSignal },
  ): Promise<Result<Route[]>> {
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const alt = Math.max(0, Math.min(2, opts.alternatives));
    const url = `${this.#o.baseUrl}/route/v1/driving/${coords}?alternatives=${alt > 0 ? alt : 'false'}&geometries=geojson&overview=full&annotations=duration`;
    const res = await getJson(url, {
      schema: OsrmResponse,
      signal: opts.signal,
      timeoutMs: this.#o.timeoutMs ?? 10_000,
      ...(this.#o.fetchImpl ? { fetchImpl: this.#o.fetchImpl } : {}),
      mapClientError: (_s, b): ProviderError | undefined => {
        const code = (b as { code?: unknown } | null)?.code;
        return code === 'NoRoute' || code === 'NoSegment' ? { kind: 'no_route' } : undefined;
      },
    });
    if (!res.ok) return res;

    const routes: Route[] = [];
    for (const [i, r] of res.value.routes.entries()) {
      const geometry = r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
      const durations = r.legs.flatMap((l) => l.annotation.duration);
      // OSRM repite el vértice de unión entre tramos: las duraciones son una por par de coordenadas.
      if (durations.length !== geometry.length - 1) {
        return { ok: false, error: { kind: 'bad_response', detail: 'annotation.duration no casa con la geometría' } };
      }
      const cum = [0];
      for (const d of durations) cum.push((cum.at(-1) ?? 0) + d);
      // annotation.duration excluye las penalizaciones de giro: se reparten proporcionalmente para que la llegada cuadre.
      const sum = cum.at(-1) ?? 0;
      const k = sum > 0 ? r.duration / sum : 1;
      for (let j = 0; j < cum.length; j++) cum[j] = (cum[j] ?? 0) * k;
      routes.push({
        id: `${this.id}-${i}`,
        geometry,
        distanceM: Math.round(r.distance),
        durationS: Math.round(r.duration),
        cumDurationS: cum,
        provider: this.id,
        name: routeName(r.legs.map((l) => ({ names: (l.summary ?? '').split(','), lengthM: l.distance }))),
      });
    }
    return ok(routes);
  }
}

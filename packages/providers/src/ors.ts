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

const Step = z.object({
  distance: z.number().nonnegative(),
  duration: z.number().nonnegative(),
  name: z.string().optional(),
  way_points: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
});

export const OrsResponse = z.object({
  features: z
    .array(
      z.object({
        geometry: z.object({
          type: z.literal('LineString'),
          coordinates: z
            .array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]).rest(z.number()))
            .min(2),
        }),
        properties: z.object({
          summary: z.object({ distance: z.number().nonnegative(), duration: z.number().nonnegative() }),
          segments: z.array(z.object({ steps: z.array(Step) })).min(1),
        }),
      }),
    )
    .min(1),
});

export interface OrsOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** OpenRouteService (clave secreta): solo dentro del Worker, como último recurso de rutas (ARCHITECTURE §4.1). */
export class OrsRouting implements RoutingProvider {
  readonly id = 'ors';
  readonly #o: OrsOptions;

  constructor(o: OrsOptions) {
    this.#o = o;
  }

  async getRoutes(
    from: LatLng,
    to: LatLng,
    opts: { alternatives: number; signal: AbortSignal },
  ): Promise<Result<Route[]>> {
    const alt = Math.max(0, Math.min(2, opts.alternatives));
    const body = {
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
      instructions: true,
      language: 'es',
      ...(alt > 0 ? { alternative_routes: { target_count: alt + 1, weight_factor: 1.6, share_factor: 0.6 } } : {}),
    };
    const res = await getJson(
      `${this.#o.baseUrl ?? 'https://api.openrouteservice.org'}/v2/directions/driving-car/geojson`,
      {
        schema: OrsResponse,
        signal: opts.signal,
        timeoutMs: this.#o.timeoutMs ?? 12_000,
        init: {
          method: 'POST',
          headers: {
            Authorization: this.#o.apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/geo+json',
          },
          body: JSON.stringify(body),
        },
        ...(this.#o.fetchImpl ? { fetchImpl: this.#o.fetchImpl } : {}),
        mapClientError: (status, b): ProviderError | undefined => {
          const code = (b as { error?: { code?: unknown } } | null)?.error?.code;
          // 2009/2010: no se encontró ruta / punto fuera de la red (documentación de errores de ORS).
          if (code === 2009 || code === 2010) return { kind: 'no_route' };
          if (status === 403) return { kind: 'unavailable', status };
          return undefined;
        },
      },
    );
    if (!res.ok) return res;

    return ok(
      res.value.features.map((f, i): Route => {
        const geometry = f.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
        const steps = f.properties.segments.flatMap((s) => s.steps);
        // Cada paso cubre los vértices [a, b]: su tiempo se reparte por igual entre sus tramos.
        const cum = new Array<number>(geometry.length).fill(0);
        let t = 0;
        for (const st of steps) {
          const [a, b] = st.way_points;
          const n = Math.max(1, Math.min(b, geometry.length - 1) - a);
          for (let k = a; k < Math.min(b, geometry.length - 1); k++) {
            t += st.duration / n;
            cum[k + 1] = t;
          }
        }
        for (let k = 1; k < cum.length; k++) cum[k] = Math.max(cum[k] ?? 0, cum[k - 1] ?? 0);
        return {
          id: `ors-${i}`,
          geometry,
          distanceM: Math.round(f.properties.summary.distance),
          durationS: Math.round(f.properties.summary.duration),
          cumDurationS: cum,
          provider: 'ors',
          name: routeName(steps.map((s) => ({ names: (s.name ?? '').split(/[,;]/), lengthM: s.distance }))),
        };
      }),
    );
  }
}

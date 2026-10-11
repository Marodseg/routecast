import { type GeocodingProvider, type LatLng, ok, type Place, type Result } from '@routecast/shared/providers';
import { z } from 'zod';
import { getJson } from './http';

const Feature = z.object({
  geometry: z.object({ type: z.literal('Point'), coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z.object({
    osm_type: z.string().optional(),
    osm_id: z.number().optional(),
    name: z.string().optional(),
    street: z.string().optional(),
    housenumber: z.string().optional(),
    city: z.string().optional(),
    county: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    countrycode: z.string().optional(),
  }),
});

export const PhotonResponse = z.object({ features: z.array(z.unknown()) });

export interface PhotonOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  limit?: number;
}

/** Centro aproximado de la península: sesgo por defecto hacia resultados en España. */
export const SPAIN_BIAS: LatLng = { lat: 40.2, lng: -3.7 };

/**
 * Photon (komoot) para autocompletar. Se usa con debounce ≥ 300 ms y cancelación desde la UI (PROVIDERS.md).
 * Nominatim no se usa para autocompletar (prohibido por su política).
 */
export class PhotonGeocoding implements GeocodingProvider {
  readonly id = 'photon';
  readonly #o: PhotonOptions;

  constructor(o: PhotonOptions = {}) {
    this.#o = o;
  }

  async suggest(query: string, opts: { signal: AbortSignal; bias?: LatLng }): Promise<Result<Place[]>> {
    const q = query.trim();
    if (q.length < 2) return ok([]);
    const bias = opts.bias ?? SPAIN_BIAS;
    const params = new URLSearchParams({
      q,
      limit: String(this.#o.limit ?? 6),
      lat: bias.lat.toFixed(3),
      lon: bias.lng.toFixed(3),
    });
    const res = await getJson(`${this.#o.baseUrl ?? 'https://photon.komoot.io'}/api/?${params}`, {
      schema: PhotonResponse,
      signal: opts.signal,
      timeoutMs: this.#o.timeoutMs ?? 6000,
      ...(this.#o.fetchImpl ? { fetchImpl: this.#o.fetchImpl } : {}),
    });
    if (!res.ok) return res;

    const seen = new Set<string>();
    const places: Place[] = [];
    for (const raw of res.value.features) {
      // Cada resultado se valida por separado: uno raro se descarta sin tumbar la lista.
      const f = Feature.safeParse(raw);
      if (!f.success) continue;
      const p = f.data.properties;
      const [lng, lat] = f.data.geometry.coordinates;
      const name = p.name ?? (p.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ''}` : undefined);
      if (!name) continue;
      const detailParts = [
        p.city !== name ? p.city : undefined,
        p.county,
        p.state,
        p.countrycode === 'ES' ? undefined : p.country,
      ];
      const detail = [...new Set(detailParts.filter((x): x is string => !!x))].slice(0, 2).join(', ');
      const key = `${name}|${detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      places.push({
        id: p.osm_type && p.osm_id !== undefined ? `${p.osm_type}${p.osm_id}` : `${lat.toFixed(5)},${lng.toFixed(5)}`,
        name,
        ...(detail ? { detail } : {}),
        at: { lat, lng },
      });
    }
    return ok(places);
  }
}

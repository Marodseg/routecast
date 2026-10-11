import { type GeocodingProvider, type LatLng, ok, type Place, type Result } from '@routecast/shared/providers';
import { z } from 'zod';
import { getJson } from './http';

const Feature = z.object({
  geometry: z.object({ type: z.literal('Point'), coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z.object({
    osm_type: z.string().optional(),
    osm_key: z.string().optional(),
    osm_value: z.string().optional(),
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

/** [oeste, sur, este, norte]: Europa, Canarias y Magreb. */
export const EUROPE_BBOX = [-25, 27, 45, 72] as const;
const PLACE_LAYERS = ['city', 'locality', 'district', 'county', 'state'] as const;
/** Lugares por orden de utilidad como origen/destino de un viaje en coche. */
const PLACE_RANK: Record<string, number> = {
  city: 0,
  town: 1,
  municipality: 1,
  village: 2,
  suburb: 3,
  hamlet: 4,
  locality: 5,
};

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
      limit: String(this.#o.limit ?? 10),
      lat: bias.lat.toFixed(3),
      lon: bias.lng.toFixed(3),
      // Sesgo suave: sin él, «Granada» devolvía paradas de autobús de Madrid antes que pueblos de otras provincias.
      location_bias_scale: '0.1',
      // Europa y norte de África: fuera de aquí no hay rutas en coche desde España.
      bbox: EUROPE_BBOX.join(','),
    });
    // Sin números en la consulta se buscan lugares, no direcciones ni POIs (calles homónimas, tiendas, paradas…).
    const address = /\d/.test(q);
    if (!address) for (const layer of PLACE_LAYERS) params.append('layer', layer);
    const res = await getJson(`${this.#o.baseUrl ?? 'https://photon.komoot.io'}/api/?${params}`, {
      schema: PhotonResponse,
      signal: opts.signal,
      timeoutMs: this.#o.timeoutMs ?? 6000,
      ...(this.#o.fetchImpl ? { fetchImpl: this.#o.fetchImpl } : {}),
    });
    if (!res.ok) return res;

    const seen = new Set<string>();
    const places: { place: Place; rank: number }[] = [];
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
      // Sin dirección en la consulta, solo lugares habitados o administrativos.
      if (!address && p.osm_key !== undefined && p.osm_key !== 'place' && p.osm_key !== 'boundary') continue;
      if (!address && (p.osm_value === 'house' || p.osm_value === 'isolated_dwelling')) continue;
      places.push({
        place: {
          id: p.osm_type && p.osm_id !== undefined ? `${p.osm_type}${p.osm_id}` : `${lat.toFixed(5)},${lng.toFixed(5)}`,
          name,
          ...(detail ? { detail } : {}),
          at: { lat, lng },
        },
        rank: PLACE_RANK[p.osm_value ?? ''] ?? 6,
      });
    }
    // Orden estable: primero ciudades y pueblos, después lugares menores, respetando el orden de Photon dentro de cada tipo.
    return ok(
      places
        .map((x, i) => ({ ...x, i }))
        .sort((a, b) => (address ? 0 : a.rank - b.rank) || a.i - b.i)
        .slice(0, 6)
        .map((x) => x.place),
    );
  }
}

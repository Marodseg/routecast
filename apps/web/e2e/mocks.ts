import { readFileSync } from 'node:fs';
import type { Page, Route } from '@playwright/test';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../packages/providers/test/__fixtures__/${name}`, import.meta.url), 'utf8'));

/** 16:40 en Madrid (14:40 UTC) del 10/10/2026. */
export const NOW = Date.UTC(2026, 9, 10, 14, 40);
const H = 3_600_000;

const ZONES = JSON.parse(
  readFileSync(new URL('../../../packages/providers/src/data/aemet-zones.json', import.meta.url), 'utf8'),
) as { code: string; polygons: [number, number][][] }[];
/** Polígono real de la zona AEMET «Antequera» (612901), por la que pasa la ruta A-45 · A-92. */
const ANTEQUERA = ZONES.find((z) => z.code === '612901')?.polygons ?? [];

export interface MockOptions {
  routing?: 'ok' | 'down';
  weather?: 'ok' | 'down' | 'rate_limited';
  /** Ventana UTC con rachas fuertes del oeste en el entorno de Antequera (ruta A). */
  gustWindow?: [number, number];
  /** Worker de avisos: ok (aviso naranja de viento en Antequera), down (503). */
  warnings?: 'ok' | 'down';
}

export interface NetLog {
  external: string[];
}

const MALAGA = {
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-4.4214, 36.7213] },
      properties: {
        osm_type: 'R',
        osm_id: 340746,
        name: 'Málaga',
        state: 'Andalucía',
        country: 'España',
        countrycode: 'ES',
      },
    },
  ],
};

/** Previsión sintética por celda: calma salvo rachas fuertes del oeste cerca de Antequera en `gustWindow`. */
function openMeteo(url: URL, gustWindow: [number, number]) {
  const lats = (url.searchParams.get('latitude') ?? '').split(',').map(Number);
  const lngs = (url.searchParams.get('longitude') ?? '').split(',').map(Number);
  const start = Date.UTC(2026, 9, 10) / 1000;
  const n = 72;
  const time = Array.from({ length: n }, (_, i) => start + i * 3600);
  const locs = lats.map((lat, i) => {
    const lng = lngs[i] ?? 0;
    const exposed = lat > 36.85 && lat < 37.15 && lng < -4.3;
    const gust = time.map((t) => (exposed && t * 1000 >= gustWindow[0] && t * 1000 <= gustWindow[1] ? 85 : 20));
    return {
      latitude: lat,
      longitude: lng,
      hourly: {
        time,
        precipitation: time.map(() => 0),
        snowfall: time.map(() => 0),
        weather_code: time.map(() => 1),
        wind_speed_10m: time.map(() => 10),
        wind_gusts_10m: gust,
        wind_direction_10m: time.map(() => 290),
        temperature_2m: time.map(() => 18),
        visibility: time.map(() => 20000),
        cape: time.map(() => 0),
      },
    };
  });
  return locs.length === 1 ? locs[0] : locs;
}

export async function mockNetwork(page: Page, o: MockOptions = {}): Promise<NetLog> {
  const log: NetLog = { external: [] };
  const gustWindow = o.gustWindow ?? [NOW - H, NOW + 4 * H];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
      headers: { 'access-control-allow-origin': '*' },
    });

  await page.route(/^https?:\/\/(?!localhost)/, async (route) => {
    const url = new URL(route.request().url());
    log.external.push(`${url.host}${url.pathname}`);
    if (url.host === 'photon.komoot.io') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      return json(route, q.startsWith('m') ? MALAGA : fixture('photon-granada.json'));
    }
    if (url.host === 'valhalla1.openstreetmap.de') {
      return o.routing === 'down'
        ? json(route, { error: 'down' }, 503)
        : json(route, fixture('valhalla-malaga-granada.json'));
    }
    if (url.host === 'routing.openstreetmap.de' || url.host === 'router.project-osrm.org') {
      return o.routing === 'down'
        ? json(route, { code: 'Down' }, 503)
        : json(route, fixture('osrm-malaga-granada.json'));
    }
    if (url.host === 'api.open-meteo.com') {
      if (o.weather === 'down') return json(route, { error: true, reason: 'down' }, 500);
      if (o.weather === 'rate_limited') {
        return route.fulfill({
          status: 429,
          headers: { 'retry-after': '1', 'access-control-allow-origin': '*' },
          body: '',
        });
      }
      return json(route, openMeteo(url, gustWindow));
    }
    if (url.host === 'api.routecast.test' && url.pathname === '/api/warnings') {
      if (o.warnings === 'down') return json(route, { error: 'unavailable' }, 503);
      return json(route, {
        partial: false,
        warnings: [
          {
            id: 'aemet:test:612901',
            level: 'orange',
            kind: 'wind',
            areaName: 'Antequera',
            zoneCode: '612901',
            polygons: ANTEQUERA,
            fromMs: NOW - H,
            toMs: NOW + 4 * H,
            description: 'Rachas máximas: 80 km/h.',
            source: 'AEMET',
          },
        ],
      });
    }
    // Mapa base fuera de los tests: la app debe seguir funcionando sin él.
    return route.fulfill({ status: 503, body: '' });
  });
  return log;
}

export async function pickPlace(page: Page, label: string, query: string): Promise<void> {
  const box = page.getByRole('combobox', { name: label });
  await box.fill(query);
  await page.getByRole('option').first().waitFor();
  await box.press('Enter');
}

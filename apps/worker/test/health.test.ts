import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createCache } from '../src/cache';
import { createApp, type Env } from '../src/index';

const FX = join(import.meta.dirname, '../../../packages/providers/test/__fixtures__');
const raw = (n: string) => readFileSync(join(FX, n));
const META = 'https://opendata.aemet.es/opendata/api/avisos_cap/ultimoelaborado/area/:area';
const DATA = 'https://opendata.aemet.es/opendata/sh/:id';
const ATOM = 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-spain';
const ORS = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ORIGIN = 'http://localhost:5173';
const env = (o: Partial<Env> = {}): Env => ({
  ALLOWED_ORIGINS: `${ORIGIN},https://example.github.io`,
  AEMET_API_KEY: 'k',
  ORS_API_KEY: 'o',
  ...o,
});
const app = () => createApp(createCache(Date.now, undefined));
const get = (path: string, e = env(), headers: Record<string, string> = { Origin: ORIGIN }) =>
  app().request(path, { headers }, e);

// Caja de Mallorca (aviso amarillo real en los fixtures del 12/10/2026).
const MALLORCA = 'bbox=2.3,39.2,3.5,40.0&from=0&to=9999999999999';

function aemetOk(calls: { meta: number } = { meta: 0 }) {
  server.use(
    http.get(META, ({ params }) => {
      calls.meta++;
      return HttpResponse.json({ estado: 200, datos: `https://opendata.aemet.es/opendata/sh/${params.area}` });
    }),
    http.get(
      DATA,
      ({ params }) => new HttpResponse(raw(params.id === '64' ? 'aemet-avisos-64.tar' : 'aemet-avisos-61.tar')),
    ),
  );
  return calls;
}
const atomOk = () => server.use(http.get(ATOM, () => new HttpResponse(raw('meteoalarm-spain.atom'))));

describe('worker: salud, CORS y método', () => {
  it('GET /api/health responde y no expone claves', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, service: 'routecast-api', aemet: true, ors: true });
    const leaky = await get('/api/health', env({ AEMET_API_KEY: 'SECRETO-AEMET-123', ORS_API_KEY: 'SECRETO-ORS-456' }));
    expect(await leaky.text()).not.toMatch(/SECRETO/);
  });

  it('CORS solo para orígenes permitidos', async () => {
    expect((await get('/api/health')).headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(
      (await get('/api/health', env(), { Origin: 'https://evil.example' })).headers.get('access-control-allow-origin'),
    ).toBeNull();
    const pre = await app().request(
      '/api/health',
      { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } },
      env(),
    );
    expect(pre.status).toBe(403);
  });

  it('solo GET; rutas desconocidas → 404 JSON', async () => {
    expect((await app().request('/api/health', { method: 'POST', headers: { Origin: ORIGIN } }, env())).status).toBe(
      405,
    );
    expect((await get('/nope')).status).toBe(404);
  });

  it('rate limiting: 429 con Retry-After cuando el limitador lo indica', async () => {
    const res = await get(
      '/api/warnings?bbox=2,39,3,40',
      env({ RATE_LIMITER: { limit: async () => ({ success: false }) } }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
  });
});

describe('worker: /api/warnings', () => {
  it('fusiona AEMET y Meteoalarm (sin duplicados) y solo pide la comunidad necesaria', async () => {
    const calls = aemetOk();
    atomOk();
    const res = await get(`/api/warnings?${MALLORCA}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      warnings: { areaName: string; source: string; polygons: unknown[] }[];
      partial: boolean;
    };
    expect(body.partial).toBe(false);
    const norte = body.warnings.filter((w) => w.areaName === 'Norte y nordeste de Mallorca');
    expect(norte).toHaveLength(1);
    expect(norte[0]?.source).toBe('AEMET');
    expect(body.warnings.every((w) => w.polygons.length > 0)).toBe(true);
    expect(calls.meta).toBe(1);
  });

  it('cachea: una segunda consulta no vuelve a llamar a AEMET', async () => {
    const calls = aemetOk();
    atomOk();
    const a = app();
    await a.request(`/api/warnings?${MALLORCA}`, { headers: { Origin: ORIGIN } }, env());
    await a.request(`/api/warnings?${MALLORCA}`, { headers: { Origin: ORIGIN } }, env());
    expect(calls.meta).toBe(1);
  });

  it('AEMET caído → solo Meteoalarm con partial: true', async () => {
    server.use(http.get(META, () => new HttpResponse(null, { status: 503 })));
    atomOk();
    const res = await get(`/api/warnings?${MALLORCA}`);
    const body = (await res.json()) as {
      warnings: { source: string }[];
      partial: boolean;
      sources: Record<string, string>;
    };
    expect(res.status).toBe(200);
    expect(body.partial).toBe(true);
    expect(body.sources).toEqual({ aemet: 'error', meteoalarm: 'ok' });
    expect(body.warnings.length).toBeGreaterThan(0);
    expect(body.warnings.every((w) => w.source === 'Meteoalarm')).toBe(true);
  });

  it('sin clave de AEMET se usa Meteoalarm y se marca como parcial', async () => {
    atomOk();
    const body = (await (await get(`/api/warnings?${MALLORCA}`, env({ AEMET_API_KEY: undefined }))).json()) as {
      sources: Record<string, string>;
    };
    expect(body.sources.aemet).toBe('skipped');
  });

  it('ambas fuentes caídas → 503', async () => {
    server.use(
      http.get(META, () => new HttpResponse(null, { status: 503 })),
      http.get(ATOM, () => new HttpResponse(null, { status: 503 })),
    );
    expect((await get(`/api/warnings?${MALLORCA}`)).status).toBe(503);
  });

  it.each(['bbox=a,b,c,d', 'bbox=3,40,2,39', 'bbox=-30,10,10,50', 'bbox=20,50,21,51', `bbox=${'1,'.repeat(50)}1`])(
    'entrada no válida (%s) → 400 sin llamar a nadie',
    async (q) => {
      expect((await get(`/api/warnings?${q}`)).status).toBe(400);
    },
  );
});

describe('worker: /api/route (ORS)', () => {
  it('devuelve rutas normalizadas y cachea por coordenadas redondeadas', async () => {
    let calls = 0;
    server.use(
      http.post(ORS, ({ request }) => {
        calls++;
        expect(request.headers.get('authorization')).toBe('o');
        return HttpResponse.json(JSON.parse(raw('ors-malaga-granada.json').toString('utf8')));
      }),
    );
    const a = app();
    const q = '/api/route?from=36.72130,-4.42140&to=37.17730,-3.59860&alt=2';
    const res = await a.request(q, { headers: { Origin: ORIGIN } }, env());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { routes: { provider: string; cumDurationS: number[]; geometry: unknown[] }[] };
    expect(body.routes).toHaveLength(3);
    expect(body.routes[0]?.provider).toBe('ors');
    await a.request(q, { headers: { Origin: ORIGIN } }, env());
    expect(calls).toBe(1);
  });

  it('sin clave → 503; fuera de cobertura o mal formado → 400; sin ruta → 404', async () => {
    expect((await get('/api/route?from=36.7,-4.4&to=37.1,-3.6', env({ ORS_API_KEY: undefined }))).status).toBe(503);
    expect((await get('/api/route?from=48.8,2.3&to=37.1,-3.6')).status).toBe(400);
    expect((await get('/api/route?from=,&to=37.1,-3.6')).status).toBe(400);
    server.use(http.post(ORS, () => HttpResponse.json({ error: { code: 2009 } }, { status: 404 })));
    expect((await get('/api/route?from=36.7,-4.4&to=37.1,-3.6')).status).toBe(404);
  });
});

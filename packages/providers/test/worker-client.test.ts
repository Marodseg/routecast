import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { WorkerRouting, WorkerWarnings } from '../src/worker-client';
import { server, signal } from './setup';

const BASE = 'https://api.example.workers.dev';
const ring: [number, number][] = [
  [2, 39],
  [3, 39],
  [3, 40],
];

describe('WorkerWarnings', () => {
  it('pide la caja redondeada y valida la respuesta; un tipo desconocido se degrada a «other»', async () => {
    let url: URL | undefined;
    server.use(
      http.get(`${BASE}/api/warnings`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({
          partial: true,
          warnings: [
            {
              id: 'a',
              level: 'yellow',
              kind: 'tsunami',
              areaName: 'Menorca',
              polygons: [ring],
              fromMs: 1,
              toMs: 2,
              source: 'AEMET',
            },
          ],
        });
      }),
    );
    const r = await new WorkerWarnings({ baseUrl: BASE }).getWarnings([2.123, 39.456, 3.789, 40.012], [0, 10], {
      signal: signal(),
    });
    expect(url?.searchParams.get('bbox')).toBe('2.12,39.46,3.79,40.01');
    expect(r.ok && r.value.partial).toBe(true);
    expect(r.ok && r.value.warnings[0]?.kind).toBe('other');
  });

  it('respuesta manipulada (polígono absurdo) → bad_response; Worker caído → unavailable', async () => {
    server.use(
      http.get(`${BASE}/api/warnings`, () =>
        HttpResponse.json({
          partial: false,
          warnings: [
            {
              id: 'a',
              level: 'red',
              kind: 'wind',
              areaName: 'x',
              polygons: [[[999, 0]]],
              fromMs: 0,
              toMs: 1,
              source: 'AEMET',
            },
          ],
        }),
      ),
    );
    const bad = await new WorkerWarnings({ baseUrl: BASE }).getWarnings([2, 39, 3, 40], [0, 1], { signal: signal() });
    expect(bad.ok === false && bad.error.kind).toBe('bad_response');
    server.use(http.get(`${BASE}/api/warnings`, () => HttpResponse.json({ error: 'unavailable' }, { status: 503 })));
    const down = await new WorkerWarnings({ baseUrl: BASE }).getWarnings([2, 39, 3, 40], [0, 1], { signal: signal() });
    expect(down.ok === false && down.error.kind).toBe('unavailable');
  });
});

describe('WorkerRouting', () => {
  it('rutas válidas del Worker y «sin ruta» como respuesta', async () => {
    server.use(
      http.get(`${BASE}/api/route`, () =>
        HttpResponse.json({
          routes: [
            {
              id: 'ors-0',
              geometry: [
                { lat: 0, lng: 0 },
                { lat: 1, lng: 1 },
              ],
              distanceM: 1,
              durationS: 1,
              cumDurationS: [0, 1],
              provider: 'ors',
            },
          ],
        }),
      ),
    );
    const r = await new WorkerRouting({ baseUrl: BASE }).getRoutes(
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
      { alternatives: 2, signal: signal() },
    );
    expect(r.ok && r.value[0]?.provider).toBe('ors');
    server.use(http.get(`${BASE}/api/route`, () => HttpResponse.json({ error: 'no_route' }, { status: 404 })));
    expect(
      await new WorkerRouting({ baseUrl: BASE }).getRoutes(
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
        { alternatives: 0, signal: signal() },
      ),
    ).toEqual({
      ok: false,
      error: { kind: 'no_route' },
    });
  });
});

import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { OsrmRouting } from '../src/osrm';
import { decodePolyline } from '../src/polyline';
import { ValhallaRouting } from '../src/valhalla';
import { fixture, server, signal } from './setup';

const MALAGA = { lat: 36.7213, lng: -4.4214 };
const GRANADA = { lat: 37.1773, lng: -3.5986 };
const VALHALLA = 'https://valhalla1.openstreetmap.de/route';

describe('decodePolyline', () => {
  it('decodifica el ejemplo de referencia (precisión 5)', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });

  it('rechaza una cadena truncada', () => {
    expect(() => decodePolyline('_p~iF~ps|U_', 5)).toThrow(RangeError);
  });
});

describe('ValhallaRouting (fixture real Málaga → Granada)', () => {
  it('devuelve ruta principal y alternativa con nombre, distancia y tiempos acumulados coherentes', async () => {
    server.use(http.get(VALHALLA, () => HttpResponse.json(fixture('valhalla-malaga-granada.json'))));
    const r = await new ValhallaRouting().getRoutes(MALAGA, GRANADA, { alternatives: 2, signal: signal() });
    if (!r.ok) throw new Error(r.error.kind);
    expect(r.value.map((x) => x.name)).toEqual(['A-45 · A-92', 'A-7 · A-44']);
    expect(r.value.map((x) => Math.round(x.distanceM / 1000))).toEqual([126, 150]);
    for (const route of r.value) {
      expect(route.cumDurationS).toHaveLength(route.geometry.length);
      expect(route.cumDurationS[0]).toBe(0);
      expect(route.cumDurationS.every((v, i, a) => i === 0 || v >= (a[i - 1] ?? 0))).toBe(true);
      expect(Math.abs((route.cumDurationS.at(-1) ?? 0) - route.durationS)).toBeLessThan(2);
      expect(route.geometry[0]?.lat).toBeCloseTo(36.72, 1);
    }
  });

  it('error 442 (sin camino) → no_route', async () => {
    server.use(
      http.get(VALHALLA, () =>
        HttpResponse.json(
          { error_code: 442, error: 'No path could be found for input', status_code: 400 },
          { status: 400 },
        ),
      ),
    );
    expect(await new ValhallaRouting().getRoutes(MALAGA, GRANADA, { alternatives: 2, signal: signal() })).toEqual({
      ok: false,
      error: { kind: 'no_route' },
    });
  });

  it('polilínea corrupta → bad_response, sin excepción', async () => {
    const broken = structuredClone(fixture('valhalla-malaga-granada.json')) as { trip: { legs: { shape: string }[] } };
    const leg = broken.trip.legs[0];
    if (leg) leg.shape = '_p~iF~ps|U_';
    server.use(http.get(VALHALLA, () => HttpResponse.json(broken)));
    const r = await new ValhallaRouting().getRoutes(MALAGA, GRANADA, { alternatives: 0, signal: signal() });
    expect(r.ok === false && r.error.kind).toBe('bad_response');
  });
});

describe('OsrmRouting (fixture real)', () => {
  const osrm = new OsrmRouting({ id: 'osrm-fossgis', baseUrl: 'https://routing.openstreetmap.de/routed-car' });
  const url = 'https://routing.openstreetmap.de/routed-car/route/v1/driving/:coords';

  it('una duración por par de coordenadas → cumDurationS exacto', async () => {
    server.use(http.get(url, () => HttpResponse.json(fixture('osrm-malaga-granada.json'))));
    const r = await osrm.getRoutes(MALAGA, GRANADA, { alternatives: 2, signal: signal() });
    if (!r.ok) throw new Error(r.error.kind);
    const route = r.value[0];
    expect(route?.cumDurationS).toHaveLength(route?.geometry.length ?? -1);
    expect(Math.abs((route?.cumDurationS.at(-1) ?? 0) - (route?.durationS ?? 0))).toBeLessThan(2);
  });

  it('NoRoute → no_route', async () => {
    server.use(
      http.get(url, () => HttpResponse.json({ code: 'NoRoute', message: 'Impossible route' }, { status: 400 })),
    );
    expect(await osrm.getRoutes(MALAGA, GRANADA, { alternatives: 0, signal: signal() })).toEqual({
      ok: false,
      error: { kind: 'no_route' },
    });
  });

  it('anotaciones que no casan con la geometría → bad_response', async () => {
    const f = structuredClone(fixture('osrm-malaga-granada.json')) as {
      routes: { legs: { annotation: { duration: number[] } }[] }[];
    };
    f.routes[0]?.legs[0]?.annotation.duration.pop();
    server.use(http.get(url, () => HttpResponse.json(f)));
    const r = await osrm.getRoutes(MALAGA, GRANADA, { alternatives: 0, signal: signal() });
    expect(r.ok === false && r.error.kind).toBe('bad_response');
  });
});

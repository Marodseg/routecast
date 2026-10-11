import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Clock } from '../src/fallback';
import { OpenMeteoWeather } from '../src/openmeteo';
import { PhotonGeocoding } from '../src/photon';
import { fixture, server, signal } from './setup';

const OM = 'https://api.open-meteo.com/v1/forecast';
const cells = [
  { key: '36.7:-4.4', at: { lat: 36.7, lng: -4.4 } },
  { key: '37.0:-4.5', at: { lat: 37.0, lng: -4.5 } },
  { key: '37.2:-3.6', at: { lat: 37.2, lng: -3.6 } },
];
const c0 = { key: '36.7:-4.4', at: { lat: 36.7, lng: -4.4 } };
const c2 = { key: '37.2:-3.6', at: { lat: 37.2, lng: -3.6 } };

const fakeClock = (): Clock & { slept: number[] } => {
  const slept: number[] = [];
  return { slept, now: () => 1_000, sleep: async (ms) => void slept.push(ms) };
};

describe('OpenMeteoWeather (fixtures reales)', () => {
  it('pide UTC, unixtime y km/h, y asocia por orden (no por coordenada)', async () => {
    let url: URL | undefined;
    server.use(
      http.get(OM, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json(fixture('open-meteo-multi.json'));
      }),
    );
    const r = await new OpenMeteoWeather().getHourly(cells, { signal: signal(), forecastDays: 2 });
    if (!r.ok) throw new Error(r.error.kind);
    expect(url?.searchParams.get('timezone')).toBe('UTC');
    expect(url?.searchParams.get('timeformat')).toBe('unixtime');
    expect(url?.searchParams.get('wind_speed_unit')).toBe('kmh');
    expect(url?.searchParams.get('latitude')).toBe('36.70,37.00,37.20');
    expect(r.value.map((h) => h.cell)).toEqual(cells.map((c) => c.key));
    const first = r.value[0];
    expect((first?.timesMs[1] ?? 0) - (first?.timesMs[0] ?? 0)).toBe(3_600_000);
    expect(first?.lightningPotential.every((v) => v === null)).toBe(true);
    expect(first?.gustsKmH.length).toBe(first?.timesMs.length);
  });

  it('una sola ubicación responde objeto, no array', async () => {
    server.use(http.get(OM, () => HttpResponse.json(fixture('open-meteo-single.json'))));
    const r = await new OpenMeteoWeather().getHourly([c2], { signal: signal() });
    expect(r.ok && r.value).toHaveLength(1);
  });

  it('una variable ausente se degrada a nulls, no rompe', async () => {
    const f = structuredClone(fixture('open-meteo-single.json')) as { hourly: Record<string, unknown> };
    delete f.hourly.visibility;
    f.hourly.cape = [1, 2];
    server.use(http.get(OM, () => HttpResponse.json(f)));
    const r = await new OpenMeteoWeather().getHourly([c0], { signal: signal() });
    if (!r.ok) throw new Error(r.error.kind);
    expect(r.value[0]?.visibilityM.every((v) => v === null)).toBe(true);
    expect(r.value[0]?.cape.every((v) => v === null)).toBe(true);
    expect(r.value[0]?.tempC.some((v) => v !== null)).toBe(true);
  });

  it('número de ubicaciones distinto del pedido → bad_response', async () => {
    server.use(http.get(OM, () => HttpResponse.json(fixture('open-meteo-multi.json'))));
    const r = await new OpenMeteoWeather().getHourly(cells.slice(0, 2), { signal: signal() });
    expect(r.ok === false && r.error.kind).toBe('bad_response');
  });

  it('429 es un estado normal: espera Retry-After (con tope) y reintenta', async () => {
    let calls = 0;
    server.use(
      http.get(OM, () => {
        calls++;
        return calls === 1
          ? new HttpResponse(null, { status: 429, headers: { 'Retry-After': '30' } })
          : HttpResponse.json(fixture('open-meteo-single.json'));
      }),
    );
    const clock = fakeClock();
    const r = await new OpenMeteoWeather({ clock }).getHourly([c0], { signal: signal() });
    expect(r.ok).toBe(true);
    expect(clock.slept).toEqual([10_000]);
  });

  it('agota los reintentos y devuelve rate_limited', async () => {
    server.use(http.get(OM, () => new HttpResponse(null, { status: 429 })));
    const r = await new OpenMeteoWeather({ clock: fakeClock(), maxRetries: 1 }).getHourly([c0], {
      signal: signal(),
    });
    expect(r.ok === false && r.error.kind).toBe('rate_limited');
  });

  it('si falla el segundo lote, devuelve lo ya descargado (parcial) en vez de nada', async () => {
    const single = fixture('open-meteo-single.json');
    let requests = 0;
    server.use(
      http.get(OM, ({ request }) => {
        requests++;
        if (requests > 1) return new HttpResponse(null, { status: 503 });
        const n = new URL(request.url).searchParams.get('latitude')?.split(',').length ?? 0;
        return HttpResponse.json(Array.from({ length: n }, () => single));
      }),
    );
    const many = Array.from({ length: 60 }, (_, i) => ({ key: `k${i}`, at: { lat: 37 + i * 0.1, lng: -4 } }));
    const r = await new OpenMeteoWeather({ clock: fakeClock() }).getHourly(many, { signal: signal() });
    expect(r.ok && r.value).toHaveLength(50);
  });

  it('trocea en lotes de 50 celdas', async () => {
    const single = fixture('open-meteo-single.json');
    let requests = 0;
    server.use(
      http.get(OM, ({ request }) => {
        requests++;
        const n = new URL(request.url).searchParams.get('latitude')?.split(',').length ?? 0;
        return HttpResponse.json(n === 1 ? single : Array.from({ length: n }, () => single));
      }),
    );
    const many = Array.from({ length: 51 }, (_, i) => ({ key: `k${i}`, at: { lat: 37 + i * 0.1, lng: -4 } }));
    const r = await new OpenMeteoWeather().getHourly(many, { signal: signal() });
    expect(requests).toBe(2);
    expect(r.ok && r.value.map((h) => h.cell)).toEqual(many.map((c) => c.key));
  });
});

describe('PhotonGeocoding (fixture real)', () => {
  const PH = 'https://photon.komoot.io/api/';

  it('convierte resultados en lugares con detalle y sin duplicados', async () => {
    let url: URL | undefined;
    server.use(
      http.get(PH, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json(fixture('photon-granada.json'));
      }),
    );
    const r = await new PhotonGeocoding().suggest('Granada', { signal: signal() });
    if (!r.ok) throw new Error(r.error.kind);
    expect(r.value[0]).toMatchObject({ name: 'Granada', detail: expect.stringContaining('Andalucía') });
    expect(r.value[0]?.at.lat).toBeCloseTo(37.17, 1);
    expect(new Set(r.value.map((p) => `${p.name}|${p.detail}`)).size).toBe(r.value.length);
    expect(url?.searchParams.get('lat')).toBe('40.200');
  });

  it('descarta un resultado mal formado sin tumbar la lista', async () => {
    const f = structuredClone(fixture('photon-granada.json')) as { features: unknown[] };
    f.features.unshift({ type: 'Feature', geometry: { type: 'Point', coordinates: ['x', 1] }, properties: {} });
    server.use(http.get(PH, () => HttpResponse.json(f)));
    const r = await new PhotonGeocoding().suggest('Granada', { signal: signal() });
    expect(r.ok && r.value[0]?.name).toBe('Granada');
  });

  it('consultas de menos de 2 caracteres no llegan a la red', async () => {
    expect(await new PhotonGeocoding().suggest(' g ', { signal: signal() })).toEqual({ ok: true, value: [] });
  });
});

import { resample, uniqueCells } from '@routecast/core';
import type { HourlyWeather, Place, Route } from '@routecast/shared';
import type { Result, WeatherCell } from '@routecast/shared/providers';
import { createRoot } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import type { Services as AppServices } from './services';
import { createAppStore } from './store';
import { seriesEndMs } from './time';
import { WeatherCache } from './weatherCache';

const A: Place = { id: 'a', name: 'A', at: { lat: 37, lng: -4.5 } };
const B: Place = { id: 'b', name: 'B', at: { lat: 37.5, lng: -4.5 } };

function route(): Route {
  const geometry = [A.at, { lat: 37.25, lng: -4.5 }, B.at];
  return { id: 'r', geometry, distanceM: 55_000, durationS: 3000, cumDurationS: [0, 1500, 3000], provider: 'fake' };
}

function services(getRoutes: AppServices['routing']['getRoutes']): AppServices {
  return {
    routing: { id: 'fake', getRoutes },
    weather: { id: 'w', getHourly: async () => ({ ok: true, value: [] }) },
    geocoding: { id: 'g', suggest: async () => ({ ok: true, value: [] }) },
    providerLabel: (id) => id,
    isFallback: () => false,
    warnings: null,
  };
}

const NOW = Date.UTC(2026, 9, 10, 14, 41);

/** Serie horaria tranquila de `hours` horas desde una hora antes de NOW (no llega al horizonte de 7 días). */
function shortSeries(cell: string, hours = 48): HourlyWeather {
  const t0 = Math.floor(NOW / 3_600_000) * 3_600_000 - 3_600_000;
  const n = hours;
  const fill = (v: number) => new Array<number | null>(n).fill(v);
  return {
    cell,
    timesMs: Array.from({ length: n }, (_, i) => t0 + i * 3_600_000),
    precipitationMmH: fill(0),
    gustsKmH: fill(10),
    windKmH: fill(5),
    windFromDeg: fill(0),
    weatherCode: fill(0),
    tempC: fill(15),
    visibilityM: fill(20_000),
    cape: fill(0),
    lightningPotential: new Array<number | null>(n).fill(null),
    snowfallCmH: fill(0),
    fetchedAtMs: NOW,
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('store', () => {
  it('una respuesta antigua no pisa a la nueva al cambiar rápido de destino', async () => {
    const resolvers: ((r: Result<Route[]>) => void)[] = [];
    const getRoutes = vi.fn(
      (_a: Place['at'], _b: Place['at'], o: { signal: AbortSignal }) =>
        new Promise<Result<Route[]>>((res) => {
          resolvers.push(res);
          o.signal.addEventListener('abort', () => res({ ok: false, error: { kind: 'aborted' } }));
        }),
    );
    await createRoot(async (dispose) => {
      const s = createAppStore(services(getRoutes as AppServices['routing']['getRoutes']), {
        now: () => NOW,
        cache: new WeatherCache(() => NOW, 1, false),
      });
      s.setFrom(A);
      s.setTo(B);
      const first = s.load();
      s.setTo({ ...B, id: 'b2' });
      const second = s.load();
      resolvers[1]?.({ ok: true, value: [{ ...route(), id: 'nueva' }] });
      resolvers[0]?.({ ok: true, value: [{ ...route(), id: 'vieja' }] });
      await Promise.all([first, second]);
      await tick();
      expect(s.views().map((v) => v.route.id)).toEqual(['nueva']);
      dispose();
    });
  });

  it('la hora de salida se acota al horizonte (URL manipulada) y nunca queda en el pasado', () => {
    createRoot((dispose) => {
      let now = NOW;
      const s = createAppStore(
        services(async () => ({ ok: true, value: [] })),
        {
          now: () => now,
          cache: new WeatherCache(() => now, 1, false),
        },
      );
      s.setDepartureMs(NOW + 30 * 24 * 3_600_000);
      expect(s.departureMinutes()).toBe(s.pickerMax());
      s.setDepartureMs(NOW - 3_600_000);
      expect(s.departureMinutes()).toBe(s.pickerMin());
      now += 2 * 3_600_000;
      expect(now).toBeGreaterThan(NOW);
      dispose();
    });
  });

  it('cambiar de día conserva la hora y marca como orientativos los que cruzan las 48 h', () => {
    createRoot((dispose) => {
      const s = createAppStore(
        services(async () => ({ ok: true, value: [] })),
        {
          now: () => NOW,
          cache: new WeatherCache(() => NOW, 1, false),
        },
      );
      expect(s.pickerMax() - s.pickerMin()).toBeGreaterThan(48 * 60);
      expect(s.days()[0]?.orientative).toBe(false);
      expect(s.days().some((d) => d.orientative)).toBe(true);
      const before = new Date(s.departureMs());
      const next = s.days()[1];
      if (!next) throw new Error('falta el día siguiente');
      s.setDepartureDay(next.startMs);
      const after = new Date(s.departureMs());
      expect(after.getHours()).toBe(before.getHours());
      expect(after.getMinutes()).toBe(before.getMinutes());
      expect(after.getDate()).not.toBe(before.getDate());
      dispose();
    });
  });

  it('una serie corta en caché no tapa el horizonte: se vuelve a pedir 7 días', async () => {
    const getHourly = vi.fn(
      async (_cells: readonly WeatherCell[], _opts: { signal: AbortSignal; forecastDays?: number }) => ({
        ok: true as const,
        value: [] as HourlyWeather[],
      }),
    );
    const cache = new WeatherCache(() => NOW, 60 * 60_000, false);
    const cells = uniqueCells(resample(route()).map((sample) => sample.at));
    const blank = (cell: string, last: number): HourlyWeather => ({
      cell,
      timesMs: [last],
      precipitationMmH: [0],
      gustsKmH: [0],
      windKmH: [0],
      windFromDeg: [0],
      weatherCode: [0],
      tempC: [10],
      visibilityM: [10_000],
      cape: [0],
      lightningPotential: [null],
      snowfallCmH: [0],
      fetchedAtMs: NOW,
    });
    await cache.putMany(cells.map((c) => blank(c.key, NOW + 2 * 24 * 3_600_000)));
    await createRoot(async (dispose) => {
      const base = services(async () => ({ ok: true, value: [route()] }));
      const s = createAppStore({ ...base, weather: { id: 'w', getHourly } }, { now: () => NOW, cache });
      s.setFrom(A);
      s.setTo(B);
      await s.load();
      await tick();
      expect(getHourly).toHaveBeenCalledOnce();
      expect(getHourly.mock.calls[0]?.[1].forecastDays).toBe(7);
      dispose();
    });

    getHourly.mockClear();
    await cache.putMany(cells.map((c) => blank(c.key, seriesEndMs(NOW))));
    await createRoot(async (dispose) => {
      const base = services(async () => ({ ok: true, value: [route()] }));
      const s = createAppStore({ ...base, weather: { id: 'w', getHourly } }, { now: () => NOW, cache });
      s.setFrom(A);
      s.setTo(B);
      await s.load();
      await tick();
      expect(getHourly).not.toHaveBeenCalled();
      dispose();
    });
  });
});

describe('store: serie corta en caché como respaldo', () => {
  const cells = () => uniqueCells(resample(route()).map((sample) => sample.at));

  it('si la previsión falla, usa la serie corta y avisa de datos parciales (no de previsión caída)', async () => {
    const cache = new WeatherCache(() => NOW, 60 * 60_000, false);
    await cache.putMany(cells().map((c) => shortSeries(c.key)));
    await createRoot(async (dispose) => {
      const base = services(async () => ({ ok: true, value: [route()] }));
      const s = createAppStore(
        { ...base, weather: { id: 'w', getHourly: async () => ({ ok: false, error: { kind: 'unavailable' } }) } },
        { now: () => NOW, cache },
      );
      s.setFrom(A);
      s.setTo(B);
      await s.load();
      await tick();
      expect(s.weatherError()).toBeNull();
      expect(s.weatherPartial()).toBe(true);
      expect(s.evaluated()[0]?.ev.risk.worstLevel).not.toBe('unknown');
      dispose();
    });
  });

  it('si la previsión llega a medias, las celdas que faltan usan la serie corta', async () => {
    const cache = new WeatherCache(() => NOW, 60 * 60_000, false);
    const all = cells();
    await cache.putMany(all.map((c) => shortSeries(c.key)));
    await createRoot(async (dispose) => {
      const base = services(async () => ({ ok: true, value: [route()] }));
      const getHourly = async (cs: readonly WeatherCell[]) => ({
        ok: true as const,
        value: cs.slice(0, 1).map((c) => shortSeries(c.key, 24 * 7)),
      });
      const s = createAppStore({ ...base, weather: { id: 'w', getHourly } }, { now: () => NOW, cache });
      s.setFrom(A);
      s.setTo(B);
      await s.load();
      await tick();
      expect(s.weatherPartial()).toBe(all.length > 1);
      expect(s.evaluated()[0]?.ev.points.every((p) => p.risk.level !== 'unknown')).toBe(true);
      dispose();
    });
  });
});

describe('store: día de salida y cambio de hora', () => {
  it('cambiar al 25 de octubre (día de 25 h) conserva la hora de reloj', () => {
    const now = new Date(2026, 9, 24, 10, 0).getTime();
    createRoot((dispose) => {
      const s = createAppStore(
        services(async () => ({ ok: true, value: [] })),
        { now: () => now, cache: new WeatherCache(() => now, 1, false) },
      );
      s.setDepartureMs(new Date(2026, 9, 24, 18, 0).getTime());
      const d25 = s.days().find((d) => new Date(d.startMs).getDate() === 25);
      if (!d25) throw new Error('falta el 25');
      s.setDepartureDay(d25.startMs);
      const after = new Date(s.departureMs());
      expect([after.getDate(), after.getHours(), after.getMinutes()]).toEqual([25, 18, 0]);
      expect(s.days().every((d) => new Date(d.startMs).getHours() === 0)).toBe(true);
      dispose();
    });
  });

  it('el array de días no cambia de identidad con el tic del reloj (no se pierde el foco)', () => {
    let now = new Date(2026, 9, 24, 10, 1).getTime();
    vi.useFakeTimers();
    createRoot((dispose) => {
      const s = createAppStore(
        services(async () => ({ ok: true, value: [] })),
        { now: () => now, cache: new WeatherCache(() => now, 1, false) },
      );
      const first = s.days();
      now += 60_000;
      vi.advanceTimersByTime(60_000);
      expect(s.nowMs()).toBe(now);
      expect(s.days()).toBe(first);
      dispose();
    });
    vi.useRealTimers();
  });
});

import type { Place, Route } from '@routecast/shared';
import type { Result } from '@routecast/shared/providers';
import { createRoot } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import type { Services as AppServices } from './services';
import { createAppStore } from './store';
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
});

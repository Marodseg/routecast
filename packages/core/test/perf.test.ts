import type { LatLng, Route } from '@routecast/shared';
import { describe, expect, it } from 'vitest';
import { cumulativeDistancesM } from '../src/geo';
import { resample } from '../src/resample';
import { simplifyRoute } from '../src/simplify';

/** Geometría densa como la de Valhalla (≈ 67 vértices/km): 900 km ≈ 60.000 vértices, con curvas. */
function denseRoute(km: number, perKm = 67): Route {
  const g: LatLng[] = [];
  const n = km * perKm;
  for (let i = 0; i <= n; i++) {
    const t = i / perKm;
    g.push({ lat: 37 + t / 111.32, lng: -3.6 + Math.sin(t / 7) * 0.05 });
  }
  const cum = cumulativeDistancesM(g);
  return {
    id: 'd',
    geometry: g,
    distanceM: cum.at(-1) ?? 0,
    durationS: 30_000,
    cumDurationS: cum.map((d) => d / 30),
    provider: 'test',
  };
}

describe('rendimiento', () => {
  it('lo que hace la app (simplificar + muestrear) con 900 km y 60.000 vértices tarda < 1 s', () => {
    const r = denseRoute(900);
    const t = Date.now();
    const s = resample(simplifyRoute(r, 15));
    expect(s.length).toBeGreaterThan(30);
    expect(Date.now() - t).toBeLessThan(1000);
  });

  it('muestrear sin simplificar sigue siendo casi lineal (antes, O(n²): minutos)', () => {
    const t = Date.now();
    expect(resample(denseRoute(900)).length).toBeGreaterThan(30);
    expect(Date.now() - t).toBeLessThan(3000);
  });
});

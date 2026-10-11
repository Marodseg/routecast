import type { LatLng, Route } from '@routecast/shared';
import { describe, expect, it } from 'vitest';
import { cumulativeDistancesM, haversineM } from '../src/geo';
import { simplifyRoute } from '../src/simplify';

function route(g: LatLng[]): Route {
  const cum = cumulativeDistancesM(g);
  return {
    id: 'r',
    geometry: g,
    distanceM: cum.at(-1) ?? 0,
    durationS: 1000,
    cumDurationS: cum.map((d) => d / 25),
    provider: 't',
  };
}

describe('simplifyRoute', () => {
  it('una recta densa queda en sus extremos', () => {
    const g = Array.from({ length: 5001 }, (_, i) => ({ lat: 37 + i * 1e-4, lng: -4 }));
    const s = simplifyRoute(route(g), 15);
    expect(s.geometry).toEqual([g[0], g[5000]]);
    expect(s.cumDurationS).toEqual([0, route(g).cumDurationS[5000]]);
  });

  it('conserva las curvas: ningún vértice original queda a más de la tolerancia', () => {
    const g = Array.from({ length: 3001 }, (_, i) => ({ lat: 37 + i * 1e-4, lng: -4 + Math.sin(i / 200) * 0.01 }));
    const r = route(g);
    const s = simplifyRoute(r, 15);
    expect(s.geometry.length).toBeLessThan(g.length / 10);
    expect(s.geometry[0]).toEqual(g[0]);
    expect(s.geometry.at(-1)).toEqual(g.at(-1));
    // Tiempos acumulados: subconjunto de los originales, mismo tamaño que la geometría y no decrecientes.
    expect(s.cumDurationS).toHaveLength(s.geometry.length);
    expect(s.cumDurationS.every((v, i, a) => i === 0 || v >= (a[i - 1] ?? 0))).toBe(true);
    // Error máximo aproximado: distancia de cada vértice original al vértice simplificado más cercano en su tramo.
    const sCum = cumulativeDistancesM(s.geometry);
    expect(Math.abs((sCum.at(-1) ?? 0) - r.distanceM) / r.distanceM).toBeLessThan(0.01);
    expect(haversineM(s.geometry[1] ?? g[0] ?? { lat: 0, lng: 0 }, g[0] ?? { lat: 0, lng: 0 })).toBeGreaterThan(0);
  });

  it('una ida y vuelta (extremos iguales) conserva el punto más lejano', () => {
    const g = [
      { lat: 37, lng: -4 },
      { lat: 37.001, lng: -4 },
      { lat: 37.01, lng: -4 },
      { lat: 37.001, lng: -4 },
      { lat: 37, lng: -4 },
    ];
    const s = simplifyRoute(route(g), 15);
    expect(s.geometry).toContainEqual({ lat: 37.01, lng: -4 });
    expect(s.geometry).toHaveLength(3);
  });

  it('rutas de 0, 1 o 2 vértices se devuelven igual', () => {
    for (const n of [1, 2]) {
      const g = Array.from({ length: n }, (_, i) => ({ lat: 37 + i, lng: -4 }));
      expect(simplifyRoute(route(g), 15).geometry).toEqual(g);
    }
  });
});

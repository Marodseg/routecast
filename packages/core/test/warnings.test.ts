import type { SamplePoint } from '@routecast/shared';
import { describe, expect, it } from 'vitest';
import { pointInPolygons, warningsOnRoute } from '../src/warnings';

const H = 3_600_000;
const square: [number, number][] = [
  [-4.6, 36.9],
  [-4.4, 36.9],
  [-4.4, 37.1],
  [-4.6, 37.1],
];

const sample = (i: number, lat: number, etaMs: number): SamplePoint => ({
  index: i,
  at: { lat, lng: -4.5 },
  kmFromStart: i * 10,
  etaMs,
  headingDeg: 0,
});

// Ruta hacia el norte: muestras 1 y 2 (km 10 y 20) dentro del cuadrado.
const route = [sample(0, 36.8, 0), sample(1, 36.95, H), sample(2, 37.05, 2 * H), sample(3, 37.2, 3 * H)];

describe('pointInPolygons', () => {
  it('dentro, fuera y en un segundo polígono', () => {
    expect(pointInPolygons({ lat: 37, lng: -4.5 }, [square])).toBe(true);
    expect(pointInPolygons({ lat: 38, lng: -4.5 }, [square])).toBe(false);
    const far: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    expect(pointInPolygons({ lat: 37, lng: -4.5 }, [far, square])).toBe(true);
    expect(pointInPolygons({ lat: 37, lng: -4.5 }, [])).toBe(false);
  });
});

describe('warningsOnRoute', () => {
  const w = { id: 'w', polygons: [square], fromMs: H, toMs: 2 * H };

  it('marca los tramos afectados cuando se pasa por la zona dentro de la ventana', () => {
    const [hit] = warningsOnRoute(route, [w]);
    expect(hit?.warning.id).toBe('w');
    // Como en el riesgo, un tramo hereda de sus extremos: se extiende a las muestras vecinas.
    expect(hit?.fromKm).toBe(0);
    expect(hit?.toKm).toBe(30);
    expect(hit?.firstEtaMs).toBe(H);
  });

  it('no afecta si se pasa por la zona fuera de la ventana (±30 min de margen)', () => {
    expect(warningsOnRoute(route, [{ ...w, fromMs: 5 * H, toMs: 6 * H }])).toEqual([]);
    expect(warningsOnRoute(route, [{ ...w, fromMs: 2.4 * H, toMs: 3 * H }])).toHaveLength(1);
  });

  it('no afecta si la ruta no cruza la zona', () => {
    const away = route.map((s) => ({ ...s, at: { lat: s.at.lat, lng: -3 } }));
    expect(warningsOnRoute(away, [w])).toEqual([]);
  });

  it('un aviso sin polígono no se puede situar: se ignora (la UI lo lista aparte)', () => {
    expect(warningsOnRoute(route, [{ ...w, polygons: [] }])).toEqual([]);
  });
});

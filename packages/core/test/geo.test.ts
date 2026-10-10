import type { LatLng } from '@routecast/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  angularDiffDeg,
  bearingDeg,
  circularMeanDeg,
  cumulativeDistancesM,
  haversineM,
  pointAtDistance,
  smoothedHeadingAt,
} from '../src/geo';

const ll = (lat: number, lng: number): LatLng => ({ lat, lng });
const latLng = fc.record({
  lat: fc.double({ min: -85, max: 85, noNaN: true }),
  lng: fc.double({ min: -180, max: 180, noNaN: true }),
});

describe('haversineM', () => {
  it('devuelve 0 para el mismo punto', () => {
    expect(haversineM(ll(40.4, -3.7), ll(40.4, -3.7))).toBe(0);
  });

  it('mide Madrid–Barcelona en ~505 km', () => {
    expect(haversineM(ll(40.4168, -3.7038), ll(41.3874, 2.1686)) / 1000).toBeCloseTo(505, 0);
  });

  it('es simétrica y no negativa', () => {
    fc.assert(
      fc.property(
        latLng,
        latLng,
        (a, b) => Math.abs(haversineM(a, b) - haversineM(b, a)) < 1e-6 && haversineM(a, b) >= 0,
      ),
    );
  });
});

describe('bearingDeg', () => {
  it.each([
    [ll(0, 0), ll(1, 0), 0],
    [ll(0, 0), ll(0, 1), 90],
    [ll(0, 0), ll(-1, 0), 180],
    [ll(0, 0), ll(0, -1), 270],
  ])('%o → %o = %d°', (a, b, expected) => {
    expect(bearingDeg(a, b)).toBeCloseTo(expected, 6);
  });

  it('cruza el antimeridiano por el camino corto (hacia el este)', () => {
    expect(bearingDeg(ll(0, 179.9), ll(0, -179.9))).toBeCloseTo(90, 3);
  });

  it('funciona en el hemisferio sur', () => {
    expect(bearingDeg(ll(-33.9, 18.4), ll(-34.9, 18.4))).toBeCloseTo(180, 3);
  });

  it('siempre está en [0, 360)', () => {
    fc.assert(
      fc.property(latLng, latLng, (a, b) => {
        const h = bearingDeg(a, b);
        return h >= 0 && h < 360;
      }),
    );
  });
});

describe('angularDiffDeg', () => {
  it.each([
    [10, 20, 10],
    [359, 1, 2],
    [1, 359, 2],
    [0, 180, 180],
    [90, 270, 180],
  ])('|%d° − %d°| = %d°', (a, b, d) => {
    expect(angularDiffDeg(a, b)).toBeCloseTo(d, 9);
  });
});

describe('circularMeanDeg', () => {
  it('promedia 359° y 1° como 0°, no 180°', () => {
    expect(circularMeanDeg([359, 1])).toBeCloseTo(0, 6);
  });

  it('respeta los pesos', () => {
    expect(circularMeanDeg([0, 90], [3, 1])).toBeCloseTo((Math.atan2(1, 3) * 180) / Math.PI, 6);
  });

  it('devuelve null si los rumbos se anulan o no hay datos', () => {
    expect(circularMeanDeg([0, 180])).toBeNull();
    expect(circularMeanDeg([])).toBeNull();
  });
});

describe('cumulativeDistancesM / pointAtDistance', () => {
  const line = [ll(0, 0), ll(0, 1), ll(0, 1), ll(1, 1)];

  it('acumula distancias y admite segmentos de longitud 0', () => {
    const cum = cumulativeDistancesM(line);
    expect(cum).toHaveLength(4);
    expect(cum[0]).toBe(0);
    expect(cum[2]).toBe(cum[1]);
    expect(cum[3]).toBeGreaterThan(cum[2] ?? 0);
  });

  it('interpola dentro del segmento correcto y se acota a los extremos', () => {
    const cum = cumulativeDistancesM(line);
    const half = (cum[1] ?? 0) / 2;
    const p = pointAtDistance(line, cum, half);
    expect(p.at.lat).toBeCloseTo(0, 9);
    expect(p.at.lng).toBeCloseTo(0.5, 6);
    expect(pointAtDistance(line, cum, -10).at).toEqual(ll(0, 0));
    expect(pointAtDistance(line, cum, 1e12).at).toEqual(ll(1, 1));
  });

  it('interpola a través del antimeridiano sin dar la vuelta al mundo', () => {
    const l = [ll(0, 179.5), ll(0, -179.5)];
    const cum = cumulativeDistancesM(l);
    expect((cum[1] ?? 0) / 1000).toBeLessThan(120);
    const mid = pointAtDistance(l, cum, (cum[1] ?? 0) / 2).at;
    expect(Math.abs(mid.lng)).toBeCloseTo(180, 6);
  });
});

describe('smoothedHeadingAt', () => {
  it('en una recta coincide con el rumbo de la recta', () => {
    const l = [ll(37, -4), ll(37, -3.9), ll(37, -3.8)];
    const cum = cumulativeDistancesM(l);
    expect(smoothedHeadingAt(l, cum, (cum[2] ?? 0) / 2, 2000)).toBeCloseTo(90, 1);
  });

  it('suaviza un zigzag corto hacia el rumbo medio', () => {
    // Zigzag de ~100 m alrededor de un rumbo general norte.
    const l: LatLng[] = [];
    for (let i = 0; i <= 40; i++) l.push(ll(37 + i * 0.001, -4 + (i % 2) * 0.0008));
    const cum = cumulativeDistancesM(l);
    const h = smoothedHeadingAt(l, cum, (cum[20] ?? 0) + 1, 2000);
    expect(angularDiffDeg(h, 0)).toBeLessThan(5);
  });

  it('ignora segmentos de longitud 0 y no devuelve NaN', () => {
    const l = [ll(37, -4), ll(37, -4), ll(37.01, -4)];
    const cum = cumulativeDistancesM(l);
    const h = smoothedHeadingAt(l, cum, 0, 2000);
    expect(Number.isNaN(h)).toBe(false);
    expect(h).toBeCloseTo(0, 3);
  });

  it('una ruta degenerada (un solo punto) devuelve 0', () => {
    expect(smoothedHeadingAt([ll(37, -4)], [0], 0, 2000)).toBe(0);
  });
});

describe('casos límite de geometría', () => {
  it('pointAtDistance rechaza una geometría vacía', () => {
    expect(() => pointAtDistance([], [], 0)).toThrow(RangeError);
  });

  it('interpola hacia el oeste a través del antimeridiano', () => {
    const l = [ll(10, -179.5), ll(10, 179.5)];
    const cum = cumulativeDistancesM(l);
    const p = pointAtDistance(l, cum, (cum[1] ?? 0) * 0.75).at;
    expect(p.lng).toBeGreaterThan(179);
    expect(p.lng).toBeLessThanOrEqual(180);
  });

  it('un punto antes del primer segmento con longitud usa el rumbo más cercano', () => {
    const l = [ll(37, -4), ll(37, -4), ll(37, -4), ll(37.5, -4)];
    const cum = cumulativeDistancesM(l);
    expect(smoothedHeadingAt(l, cum, -50_000, 10)).toBeCloseTo(0, 3);
    expect(smoothedHeadingAt(l, cum, 1e9, 10)).toBeCloseTo(0, 3);
  });
});

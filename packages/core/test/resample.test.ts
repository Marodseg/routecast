import type { LatLng, Route } from '@routecast/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { angularDiffDeg, cumulativeDistancesM } from '../src/geo';
import { resample } from '../src/resample';

const ll = (lat: number, lng: number): LatLng => ({ lat, lng });

/** Ruta sintética a 90 km/h constantes. */
function route(geometry: LatLng[], kmh = 90): Route {
  const cum = cumulativeDistancesM(geometry);
  const total = cum[cum.length - 1] ?? 0;
  return {
    id: 'r',
    geometry,
    distanceM: total,
    durationS: total / (kmh / 3.6),
    cumDurationS: cum.map((d) => d / (kmh / 3.6)),
    provider: 'test',
  };
}

/** Recta hacia el este en el paralelo 40 con `km` kilómetros y un vértice cada `stepKm`. */
function straightEast(km: number, stepKm = 1): LatLng[] {
  const degPerKm = 1 / (111.32 * Math.cos((40 * Math.PI) / 180));
  const pts: LatLng[] = [];
  for (let k = 0; k <= km; k += stepKm) pts.push(ll(40, -4 + k * degPerKm));
  return pts;
}

describe('resample', () => {
  it('ruta de 5 km: solo origen y destino', () => {
    const r = route(straightEast(5));
    const s = resample(r);
    expect(s).toHaveLength(2);
    expect(s[0]?.kmFromStart).toBe(0);
    expect(s[1]?.kmFromStart).toBeCloseTo(5, 1);
    expect(s[0]?.at).toEqual(r.geometry[0]);
    expect(s[1]?.at).toEqual(r.geometry.at(-1));
  });

  it('ruta de 1.500 km: una muestra cada ~25 km', () => {
    const s = resample(route(straightEast(1500, 5)));
    expect(s.length).toBeGreaterThanOrEqual(60);
    expect(s.length).toBeLessThanOrEqual(62);
    for (let i = 1; i < s.length; i++) {
      const gap = (s[i]?.kmFromStart ?? 0) - (s[i - 1]?.kmFromStart ?? 0);
      expect(gap).toBeLessThanOrEqual(25.0001);
      expect(gap).toBeGreaterThan(0);
    }
  });

  it('añade una muestra en un cambio de rumbo de más de 45°', () => {
    // 10 km al este y luego 10 km al norte: el giro de 90° debe muestrearse aunque no toque por distancia.
    const east = straightEast(10);
    const last = east.at(-1) ?? ll(40, -4);
    const north: LatLng[] = [];
    for (let k = 1; k <= 10; k++) north.push(ll(last.lat + k / 111.32, last.lng));
    const s = resample(route([...east, ...north]));
    expect(s.length).toBeGreaterThanOrEqual(3);
    const turn = s.find((p) => p.kmFromStart > 7 && p.kmFromStart < 14);
    expect(turn).toBeDefined();
  });

  it('no muestrea giros pequeños (< 45°)', () => {
    const east = straightEast(10);
    const last = east.at(-1) ?? ll(40, -4);
    const ne: LatLng[] = [];
    for (let k = 1; k <= 10; k++)
      ne.push(ll(last.lat + (k * 0.3) / 111.32, last.lng + k / (111.32 * Math.cos((40 * Math.PI) / 180))));
    expect(resample(route([...east, ...ne]))).toHaveLength(2);
  });

  it('el rumbo de cada muestra es el suavizado de la carretera', () => {
    const s = resample(route(straightEast(60)));
    for (const p of s) expect(angularDiffDeg(p.headingDeg, 90)).toBeLessThan(1);
  });

  it('interpola el tiempo acumulado por distancia', () => {
    const s = resample(route(straightEast(100), 100));
    const p25 = s.find((p) => Math.abs(p.kmFromStart - 25) < 0.01);
    expect(p25?.offsetS).toBeCloseTo(25 * 36, 0);
  });

  it('tolera segmentos de longitud 0 y rutas de un solo punto', () => {
    const g = straightEast(30);
    const dup = [g[0], g[0], ...g.slice(1)].filter((p): p is LatLng => !!p);
    const s = resample(route(dup));
    expect(s.every((p) => Number.isFinite(p.headingDeg))).toBe(true);
    const single = resample(route([ll(40, -4)]));
    expect(single).toHaveLength(1);
    expect(single[0]?.kmFromStart).toBe(0);
  });

  it('índices consecutivos, km crecientes y rumbo en [0, 360)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 400 }), fc.integer({ min: 0, max: 359 }), (km, dir) => {
        const rad = (dir * Math.PI) / 180;
        const pts: LatLng[] = [];
        for (let k = 0; k <= km; k += 2) {
          pts.push(
            ll(40 + (k * Math.cos(rad)) / 111.32, -4 + (k * Math.sin(rad)) / (111.32 * Math.cos((40 * Math.PI) / 180))),
          );
        }
        const s = resample(route(pts));
        return s.every(
          (p, i) =>
            p.index === i &&
            p.headingDeg >= 0 &&
            p.headingDeg < 360 &&
            (i === 0 || p.kmFromStart > (s[i - 1]?.kmFromStart ?? 0)),
        );
      }),
      { numRuns: 60 },
    );
  });

  it('rechaza cumDurationS incoherente con la geometría', () => {
    const r = route(straightEast(10));
    expect(() => resample({ ...r, cumDurationS: [0, 1] })).toThrow(RangeError);
  });
});

describe('resample: validación de entrada', () => {
  it('rechaza geometría vacía y cumDurationS decreciente o no finita', () => {
    const r = route(straightEast(10));
    expect(() => resample({ ...r, geometry: [], cumDurationS: [] })).toThrow(RangeError);
    const bad = [...r.cumDurationS];
    bad[3] = (bad[2] ?? 0) - 1;
    expect(() => resample({ ...r, cumDurationS: bad })).toThrow(RangeError);
    const nan = [...r.cumDurationS];
    nan[4] = Number.NaN;
    expect(() => resample({ ...r, cumDurationS: nan })).toThrow(RangeError);
  });

  it('admite opciones propias (paso de 10 km)', () => {
    const s = resample(route(straightEast(50)), { stepKm: 10 });
    expect(s).toHaveLength(6);
  });
});

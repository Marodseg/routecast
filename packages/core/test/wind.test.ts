import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizeDeg, relativeWind } from '../src/wind';

describe('normalizeDeg', () => {
  it.each([
    [0, 0],
    [360, 0],
    [-1, 359],
    [721, 1],
    [359.5, 359.5],
  ])('%d° → %d°', (input, expected) => {
    expect(normalizeDeg(input)).toBeCloseTo(expected, 9);
  });

  it('siempre devuelve un valor en [0, 360)', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (d) => {
        const n = normalizeDeg(d);
        return n >= 0 && n < 360;
      }),
    );
  });
});

describe('relativeWind', () => {
  it('viento de cara: todo frontal, nada cruzado', () => {
    const w = relativeWind(90, 90, 50);
    expect(w.headKmH).toBeCloseTo(50, 9);
    expect(w.crossKmH).toBeCloseTo(0, 9);
    expect(w.fromSide).toBe('none');
  });

  it('viento de cola: frontal negativo', () => {
    const w = relativeWind(0, 180, 40);
    expect(w.headKmH).toBeCloseTo(-40, 9);
    expect(w.crossKmH).toBeCloseTo(0, 9);
  });

  it('viento desde la derecha: todo cruzado', () => {
    const w = relativeWind(0, 90, 60);
    expect(w.crossKmH).toBeCloseTo(60, 9);
    expect(w.headKmH).toBeCloseTo(0, 9);
    expect(w.fromSide).toBe('right');
  });

  it('viento desde la izquierda', () => {
    expect(relativeWind(0, 270, 60).fromSide).toBe('left');
  });

  it('cruza 359°→1° sin saltos: rumbo 359 y viento de 1° es casi de cara', () => {
    const w = relativeWind(359, 1, 100);
    expect(w.headKmH).toBeCloseTo(100 * Math.cos((2 * Math.PI) / 180), 9);
    expect(w.crossKmH).toBeCloseTo(100 * Math.sin((2 * Math.PI) / 180), 9);
    expect(w.fromSide).toBe('right');
  });

  it('caso estrella: A-92 a 52°, racha de 82 km/h del 281° → ~62 km/h cruzados', () => {
    expect(relativeWind(52, 281, 82).crossKmH).toBeCloseTo(62, 0);
  });

  it('viento calmo: componentes 0 (sin -0)', () => {
    const w = relativeWind(123, 45, 0);
    expect(Object.is(w.headKmH, 0)).toBe(true);
    expect(Object.is(w.crossKmH, 0)).toBe(true);
    expect(w.fromSide).toBe('none');
  });

  it('propiedad: cruzado ∈ [0, v], frontal ∈ [-v, v] y head² + cross² = v²', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -720, max: 720, noNaN: true }),
        fc.double({ min: -720, max: 720, noNaN: true }),
        fc.double({ min: 0, max: 250, noNaN: true }),
        (h, d, v) => {
          const w = relativeWind(h, d, v);
          const eps = 1e-9 * Math.max(1, v);
          return (
            w.crossKmH >= 0 &&
            w.crossKmH <= v + eps &&
            Math.abs(w.headKmH) <= v + eps &&
            Math.abs(w.headKmH ** 2 + w.crossKmH ** 2 - v * v) <= 1e-6 * Math.max(1, v * v)
          );
        },
      ),
    );
  });

  it('rechaza velocidades negativas o no finitas', () => {
    expect(() => relativeWind(0, 0, -1)).toThrow(RangeError);
    expect(() => relativeWind(0, Number.NaN, 10)).toThrow(RangeError);
  });
});

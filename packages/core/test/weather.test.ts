import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cellCenter, cellKey, hoursAround, uniqueCells } from '../src/weather';
import { H, hourly, T0 } from './fixtures';

describe('cellKey', () => {
  it.each([
    [{ lat: 36.721, lng: -4.421 }, '36.7:-4.4'],
    [{ lat: 36.75, lng: -4.45 }, '36.8:-4.5'],
    [{ lat: -0.04, lng: 0.04 }, '0.0:0.0'],
    [{ lat: -33.86, lng: 151.21 }, '-33.9:151.2'],
  ])('%o → %s', (p, key) => {
    expect(cellKey(p)).toBe(key);
  });

  it('el centro de la celda está a ≤ 0,05° del punto', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -85, max: 85, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        (lat, lng) => {
          const c = cellCenter(cellKey({ lat, lng }));
          return Math.abs(c.lat - lat) <= 0.05 + 1e-9 && Math.abs(c.lng - lng) <= 0.05 + 1e-9;
        },
      ),
    );
  });

  it('cellCenter rechaza claves mal formadas', () => {
    expect(() => cellCenter('abc')).toThrow(RangeError);
  });
});

describe('uniqueCells', () => {
  it('deduplica conservando el orden de aparición', () => {
    const cells = uniqueCells([
      { lat: 36.72, lng: -4.42 },
      { lat: 36.71, lng: -4.43 },
      { lat: 37.18, lng: -3.6 },
      { lat: 36.74, lng: -4.41 },
    ]);
    expect(cells.map((c) => c.key)).toEqual(['36.7:-4.4', '37.2:-3.6']);
    expect(cells[0]?.at).toEqual({ lat: 36.7, lng: -4.4 });
  });
});

describe('hoursAround (ventana ±30 min)', () => {
  const hw = hourly(6);

  it('ETA en punto: solo esa hora', () => {
    expect(hoursAround(hw, T0 + 2 * H).map((h) => h.timeMs)).toEqual([T0 + 2 * H]);
  });

  it('ETA a la media: las dos horas vecinas (bordes inclusivos)', () => {
    expect(hoursAround(hw, T0 + 2.5 * H).map((h) => h.timeMs)).toEqual([T0 + 2 * H, T0 + 3 * H]);
  });

  it('ETA a :10 → la hora en punto más cercana', () => {
    expect(hoursAround(hw, T0 + 2 * H + 10 * 60_000).map((h) => h.timeMs)).toEqual([T0 + 2 * H]);
  });

  it('fuera del horizonte → vacío (no se inventan datos)', () => {
    expect(hoursAround(hw, T0 + 10 * H)).toEqual([]);
    expect(hoursAround(hw, T0 - 2 * H)).toEqual([]);
  });

  it('conserva los null tal cual', () => {
    const withNull = hourly(3, { 1: { gustsKmH: null } });
    expect(hoursAround(withNull, T0 + H)[0]?.gustsKmH).toBeNull();
  });
});

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
    [{ lat: 0, lng: -180 }, '0.0:180.0'],
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
          const dLng = Math.abs(((c.lng - lng + 540) % 360) - 180);
          return Math.abs(c.lat - lat) <= 0.05 + 1e-9 && dLng <= 0.05 + 1e-9;
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

describe('hoursAround: semántica horaria de Open-Meteo', () => {
  const MIN = 60_000;
  // Precipitación y rachas: agregado de la hora ANTERIOR al sello (t−1 h, t]. Resto: instantáneo en t.
  const hw = hourly(8, {
    2: { precipitationMmH: 1, gustsKmH: 20, windFromDeg: 10, visibilityM: 5000 },
    3: { precipitationMmH: 9, gustsKmH: 90, windFromDeg: 30, visibilityM: 8000 },
    4: { precipitationMmH: 0, gustsKmH: 15, windFromDeg: 40, visibilityM: 9000 },
  });

  it('ETA 2:15 → instantáneos del sello 2:00; acumulados de 2:00 (1-2 h) y 3:00 (2-3 h)', () => {
    const r = hoursAround(hw, T0 + 2 * H + 15 * MIN);
    expect(r.map((x) => x.timeMs)).toEqual([T0 + 2 * H, T0 + 3 * H]);
    // El sello 3:00 aporta la lluvia/racha de 2-3 h, que cubre la ETA; su dirección es la del instante más cercano (2:00).
    expect(r[1]).toMatchObject({ precipitationMmH: 9, gustsKmH: 90, windFromDeg: 10, visibilityM: 5000 });
  });

  it('ETA 2:45 → instantáneo 3:00; acumulados 3:00 (2-3 h) y 4:00 (3-4 h, solapa hasta 3:15)', () => {
    const r = hoursAround(hw, T0 + 2 * H + 45 * MIN);
    expect(r.map((x) => x.timeMs)).toEqual([T0 + 3 * H, T0 + 4 * H]);
    expect(r[0]).toMatchObject({ precipitationMmH: 9, windFromDeg: 30 });
  });

  it('ETA en punto (2:00) → acumulados de 2:00 y 3:00, instantáneo 2:00', () => {
    const r = hoursAround(hw, T0 + 2 * H);
    expect(r.map((x) => x.timeMs)).toEqual([T0 + 2 * H, T0 + 3 * H]);
    expect(r.every((x) => x.visibilityM === 5000)).toBe(true);
  });

  it('ETA a la media (2:30) → los dos instantáneos y el acumulado 3:00', () => {
    const r = hoursAround(hw, T0 + 2.5 * H);
    expect(r.map((x) => x.timeMs)).toEqual([T0 + 2 * H, T0 + 3 * H]);
    // El sello 2:00 solo aporta instantáneos (su acumulado es de 1-2 h, fuera de la ventana).
    expect(r[0]).toMatchObject({ precipitationMmH: null, gustsKmH: null, visibilityM: 5000 });
    expect(r[1]).toMatchObject({ precipitationMmH: 9, visibilityM: 8000 });
  });

  it('fuera del horizonte → vacío (no se inventan datos)', () => {
    expect(hoursAround(hw, T0 + 20 * H)).toEqual([]);
    expect(hoursAround(hw, T0 - 2 * H)).toEqual([]);
  });

  it('conserva los null tal cual', () => {
    const withNull = hourly(4, { 1: { gustsKmH: null } });
    expect(hoursAround(withNull, T0 + 30 * MIN).find((x) => x.timeMs === T0 + H)?.gustsKmH).toBeNull();
  });
});

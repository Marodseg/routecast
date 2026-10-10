import { describe, expect, it } from 'vitest';
import { attachEta } from '../src/eta';
import type { RouteSample } from '../src/resample';

const samples: RouteSample[] = [
  { index: 0, at: { lat: 40, lng: -4 }, kmFromStart: 0, offsetS: 0, headingDeg: 90 },
  { index: 1, at: { lat: 40, lng: -3.7 }, kmFromStart: 25, offsetS: 900, headingDeg: 90 },
  { index: 2, at: { lat: 40, lng: -3.4 }, kmFromStart: 50, offsetS: 1830.4, headingDeg: 90 },
];

describe('attachEta', () => {
  it('suma la duración acumulada a la hora de salida inyectada', () => {
    const dep = Date.UTC(2026, 9, 10, 15, 0);
    const out = attachEta(samples, dep);
    expect(out.map((p) => p.etaMs)).toEqual([dep, dep + 900_000, dep + 1_830_400]);
  });

  it('no muta la entrada y conserva el resto de campos', () => {
    const out = attachEta(samples, 0);
    expect(samples[0]).not.toHaveProperty('etaMs');
    expect(out[1]).toMatchObject({ index: 1, kmFromStart: 25, headingDeg: 90 });
  });

  it('mover la salida desplaza todas las ETA por igual', () => {
    const a = attachEta(samples, 1_000_000);
    const b = attachEta(samples, 1_000_000 + 3_600_000);
    a.forEach((p, i) => {
      expect((b[i]?.etaMs ?? 0) - p.etaMs).toBe(3_600_000);
    });
  });

  it('rechaza una hora de salida no finita', () => {
    expect(() => attachEta(samples, Number.NaN)).toThrow(RangeError);
  });
});

import { describe, expect, it } from 'vitest';
import { readUrl, writeUrl } from './url';

const malaga = { id: 'm', name: 'Málaga', at: { lat: 36.7213, lng: -4.4214 } };
const granada = { id: 'g', name: 'Granada, Andalucía', at: { lat: 37.1735, lng: -3.5995 } };

describe('estado en la URL', () => {
  it('ida y vuelta conserva lugares, hora y ruta (nombres con coma incluidos)', () => {
    const q = writeUrl({ from: malaga, to: granada, departureMs: 1_791_600_000_000, route: 'B' });
    const back = readUrl(q);
    expect(back.from?.name).toBe('Málaga');
    expect(back.to?.name).toBe('Granada, Andalucía');
    expect(back.to?.at.lat).toBeCloseTo(37.1735, 4);
    expect(back.departureMs).toBe(1_791_600_000_000);
    expect(back.route).toBe('B');
  });

  it('ignora valores manipulados o fuera de rango', () => {
    const s = readUrl('?from=999,0,X&to=abc&t=-5&r=Z');
    expect(s).toEqual({});
  });

  it('rechaza coordenadas vacías o no numéricas (no se convierten en 0,0)', () => {
    expect(readUrl('?from=,,x&to=%20,%20,y')).toEqual({});
    expect(readUrl('?from=1e2,3,x')).toEqual({});
  });

  it('acota nombres larguísimos', () => {
    const s = readUrl(`?from=37,-4,${'x'.repeat(500)}`);
    expect(s.from?.name.length).toBe(120);
  });
});

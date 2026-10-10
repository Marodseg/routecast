import { describe, expect, it } from 'vitest';
import { haversineM } from '../src/geo';

describe('haversineM', () => {
  it('devuelve 0 para el mismo punto', () => {
    expect(haversineM({ lat: 40.4, lng: -3.7 }, { lat: 40.4, lng: -3.7 })).toBe(0);
  });

  it('mide Madrid–Barcelona en ~505 km', () => {
    const d = haversineM({ lat: 40.4168, lng: -3.7038 }, { lat: 41.3874, lng: 2.1686 });
    expect(d / 1000).toBeCloseTo(505, 0);
  });
});

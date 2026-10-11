import type { EvaluatedPoint } from '@routecast/core';
import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { causeOf } from './explain';

const point = (risk: Partial<EvaluatedPoint['risk']>): EvaluatedPoint =>
  ({ risk: { level: 2, values: {}, hailRisk: false, ...risk } }) as unknown as EvaluatedPoint;

describe('causeOf', () => {
  it('nombra el factor dominante en palabras sencillas', () => {
    expect(causeOf(point({ dominant: 'visibility' }), es)).toEqual({ factor: 'visibility', label: 'Poca visibilidad' });
    expect(causeOf(point({ dominant: 'crosswind' }), en)?.label).toBe('Crosswind');
  });

  it('el granizo se nombra como posibilidad, nunca como certeza', () => {
    expect(causeOf(point({ dominant: 'storm', hailRisk: true }), es)?.label).toBe('Tormenta (posible granizo)');
    expect(causeOf(point({ dominant: 'storm' }), es)?.label).toBe('Tormenta');
  });

  it('sin riesgo o sin datos no hay causa', () => {
    expect(causeOf(point({ level: 0, dominant: 'rain' }), es)).toBeNull();
    expect(causeOf(point({ level: 'unknown' }), es)).toBeNull();
    expect(causeOf(point({ level: 2 }), es)).toBeNull();
  });
});

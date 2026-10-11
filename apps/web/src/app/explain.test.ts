import type { EvaluatedPoint } from '@routecast/core';
import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { causeOf, horizonNote, partialNote } from './explain';

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

describe('notas de datos', () => {
  const pt = (km: number, out: boolean, unknown: string[] = []) =>
    ({
      sample: { kmFromStart: km },
      outOfHorizon: out,
      risk: { level: out ? 'unknown' : 0, values: {}, hailRisk: false, unknownFactors: unknown },
    }) as unknown as EvaluatedPoint;

  it('más allá del final de la previsión: una nota con el km, no la lista de «sin datos de…»', () => {
    const points = [pt(0, false), pt(400, false), pt(812.4, true, ['rain', 'gust']), pt(850, true, ['rain'])];
    expect(horizonNote(points, es)).toContain('km 812');
    expect(partialNote(points, es)).toBeNull();
  });

  it('dentro de la previsión no hay nota de horizonte; los huecos reales sí se listan', () => {
    const points = [pt(0, false, ['visibility']), pt(10, false)];
    expect(horizonNote(points, es)).toBeNull();
    expect(partialNote(points, es)).toContain('visibilidad');
  });
});

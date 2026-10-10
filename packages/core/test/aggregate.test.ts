import type { RiskLevelOrUnknown, SamplePoint } from '@routecast/shared';
import { describe, expect, it } from 'vitest';
import { aggregateRoute, rankRoutes } from '../src/aggregate';
import type { PointAssessment } from '../src/scoring/score';

const MIN = 60_000;

function pts(
  levels: RiskLevelOrUnknown[],
  kmStep = 10,
  minStep = 8,
): { samples: SamplePoint[]; risks: PointAssessment[] } {
  const samples = levels.map((_, i) => ({
    index: i,
    at: { lat: 37, lng: -4 + i * 0.1 },
    kmFromStart: i * kmStep,
    etaMs: i * minStep * MIN,
    headingDeg: 90,
  }));
  const risks = levels.map(
    (level): PointAssessment => ({
      level,
      ...(level !== 'unknown' && level > 0 ? { dominant: 'rain' as const } : {}),
      values: {},
      factors: { rain: level, crosswind: 0, gust: 0, snow: 0, ice: 0, visibility: 0, storm: 0 },
      unknownFactors: level === 'unknown' ? ['rain'] : [],
      hailRisk: false,
      partial: false,
    }),
  );
  return { samples, risks };
}

describe('aggregateRoute (SPEC §6.4)', () => {
  it('cada tramo hereda el máximo de sus extremos', () => {
    const { samples, risks } = pts([0, 2, 0, 0]);
    const r = aggregateRoute(samples, risks);
    expect(r.segments.map((s) => s.level)).toEqual([2, 2, 0]);
    expect(r.segments[0]).toMatchObject({ fromKm: 0, toKm: 10 });
  });

  it('cuenta km y minutos en nivel ≥ 2', () => {
    const { samples, risks } = pts([0, 2, 3, 1, 0]);
    const r = aggregateRoute(samples, risks);
    expect(r.kmAtLevel2Plus).toBe(30); // tramos 0-1, 1-2, 2-3
    expect(r.minutesAtLevel2Plus).toBe(24);
  });

  it('peor nivel, peor punto (el primero) y factor dominante', () => {
    const { samples, risks } = pts([1, 3, 2, 3]);
    const r = aggregateRoute(samples, risks);
    expect(r.worstLevel).toBe(3);
    expect(r.worstPoint).toBe(1);
    expect(r.dominantFactor).toBe('rain');
  });

  it('un tramo con un extremo desconocido toma el nivel conocido; con ambos, unknown', () => {
    const { samples, risks } = pts(['unknown', 1, 'unknown', 'unknown']);
    const r = aggregateRoute(samples, risks);
    expect(r.segments.map((s) => s.level)).toEqual([1, 1, 'unknown']);
    expect(r.unknownKm).toBe(10);
  });

  it('un extremo en 0 y otro desconocido no es «sin riesgo»: el tramo queda unknown (M1)', () => {
    const { samples, risks } = pts([0, 'unknown', 0]);
    const r = aggregateRoute(samples, risks);
    expect(r.segments.map((s) => s.level)).toEqual(['unknown', 'unknown']);
    expect(r.unknownKm).toBe(20);
  });

  it('toda la ruta sin datos → unknown sin peor punto', () => {
    const { samples, risks } = pts(['unknown', 'unknown']);
    const r = aggregateRoute(samples, risks);
    expect(r.worstLevel).toBe('unknown');
    expect(r.worstPoint).toBeNull();
  });

  it('una sola muestra no produce tramos', () => {
    const { samples, risks } = pts([2]);
    const r = aggregateRoute(samples, risks);
    expect(r.segments).toEqual([]);
    expect(r.worstLevel).toBe(2);
    expect(r.kmAtLevel2Plus).toBe(0);
  });

  it('rechaza listas de distinta longitud', () => {
    const { samples, risks } = pts([0, 1]);
    expect(() => aggregateRoute(samples, risks.slice(1))).toThrow(RangeError);
  });
});

describe('rankRoutes', () => {
  const base = { worstPoint: null, dominantFactor: undefined, segments: [], minutesAtLevel2Plus: 0, unknownKm: 0 };
  it('ordena por peor nivel, luego km en riesgo alto, luego duración; unknown al final', () => {
    const ranked = rankRoutes([
      { id: 'A', durationS: 5000, risk: { ...base, worstLevel: 3, kmAtLevel2Plus: 40 } },
      { id: 'B', durationS: 6000, risk: { ...base, worstLevel: 1, kmAtLevel2Plus: 0 } },
      { id: 'C', durationS: 4000, risk: { ...base, worstLevel: 1, kmAtLevel2Plus: 0 } },
      { id: 'D', durationS: 3000, risk: { ...base, worstLevel: 'unknown', kmAtLevel2Plus: 0 } },
      { id: 'E', durationS: 3000, risk: { ...base, worstLevel: 3, kmAtLevel2Plus: 10 } },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['C', 'B', 'E', 'A', 'D']);
  });

  it('a igual nivel y km en riesgo, gana la ruta con menos km sin datos', () => {
    const ranked = rankRoutes([
      { id: 'X', durationS: 1000, risk: { ...base, worstLevel: 1, kmAtLevel2Plus: 0, unknownKm: 80 } },
      { id: 'Y', durationS: 2000, risk: { ...base, worstLevel: 1, kmAtLevel2Plus: 0, unknownKm: 0 } },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['Y', 'X']);
  });
});

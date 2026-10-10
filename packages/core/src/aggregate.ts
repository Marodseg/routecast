import type { Factor, RiskLevelOrUnknown, SamplePoint } from '@routecast/shared';
import type { PointAssessment } from './scoring/score';

export interface RiskSegment {
  fromKm: number;
  toKm: number;
  level: RiskLevelOrUnknown;
}

export interface RouteRisk {
  worstLevel: RiskLevelOrUnknown;
  /** Índice de la primera muestra con el peor nivel; null si no hay ningún dato. */
  worstPoint: number | null;
  dominantFactor: Factor | undefined;
  kmAtLevel2Plus: number;
  minutesAtLevel2Plus: number;
  /** Km de tramos sin ningún dato. */
  unknownKm: number;
  segments: RiskSegment[];
}

/**
 * Máximo entre niveles. Un riesgo conocido (≥ 1) manda aunque el otro extremo no tenga datos; pero «0 y sin datos»
 * no permite afirmar «sin riesgo»: es desconocido.
 */
export function maxLevel(a: RiskLevelOrUnknown, b: RiskLevelOrUnknown): RiskLevelOrUnknown {
  if (a === 'unknown') return b === 0 ? 'unknown' : b;
  if (b === 'unknown') return a === 0 ? 'unknown' : a;
  return a > b ? a : b;
}

const isHigh = (l: RiskLevelOrUnknown) => l === 2 || l === 3;

/** Agregación por tramo y por ruta (SPEC §6.4). */
export function aggregateRoute(samples: readonly SamplePoint[], risks: readonly PointAssessment[]): RouteRisk {
  if (samples.length !== risks.length) throw new RangeError('aggregateRoute: muestras y riesgos no casan');

  const segments: RiskSegment[] = [];
  let kmHigh = 0;
  let msHigh = 0;
  let unknownKm = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const ra = risks[i - 1];
    const rb = risks[i];
    if (!a || !b || !ra || !rb) continue;
    const level = maxLevel(ra.level, rb.level);
    segments.push({ fromKm: a.kmFromStart, toKm: b.kmFromStart, level });
    const km = b.kmFromStart - a.kmFromStart;
    if (isHigh(level)) {
      kmHigh += km;
      msHigh += b.etaMs - a.etaMs;
    }
    if (level === 'unknown') unknownKm += km;
  }

  let worstLevel: RiskLevelOrUnknown = 'unknown';
  let worstPoint: number | null = null;
  risks.forEach((r, i) => {
    if (r.level === 'unknown') return;
    if (worstLevel === 'unknown' || r.level > worstLevel) {
      worstLevel = r.level;
      worstPoint = i;
    }
  });

  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    worstLevel,
    worstPoint,
    dominantFactor: worstPoint === null ? undefined : risks[worstPoint]?.dominant,
    kmAtLevel2Plus: round1(kmHigh),
    minutesAtLevel2Plus: Math.round(msHigh / 60_000),
    unknownKm: round1(unknownKm),
    segments,
  };
}

export interface RankInput {
  id: string;
  durationS: number;
  risk: Pick<RouteRisk, 'worstLevel' | 'kmAtLevel2Plus'> & Partial<Pick<RouteRisk, 'unknownKm'>>;
}

/** Comparador: peor nivel ↑, km en riesgo alto ↑, km sin datos ↑, duración ↑. Rutas sin datos al final (SPEC §6.4). */
export function rankRoutes<T extends RankInput>(routes: readonly T[]): T[] {
  const lv = (l: RiskLevelOrUnknown) => (l === 'unknown' ? 4 : l);
  return [...routes].sort(
    (a, b) =>
      lv(a.risk.worstLevel) - lv(b.risk.worstLevel) ||
      a.risk.kmAtLevel2Plus - b.risk.kmAtLevel2Plus ||
      (a.risk.unknownKm ?? 0) - (b.risk.unknownKm ?? 0) ||
      a.durationS - b.durationS,
  );
}

import { FACTORS, type Factor, type PointRisk, type RiskLevel, type RiskLevelOrUnknown } from '@routecast/shared';
import type { HourSample } from '../weather';
import { relativeWind } from '../wind';
import type { Thresholds } from './thresholds';

export type FactorLevels = Record<Factor, RiskLevelOrUnknown>;

export interface PointAssessment extends PointRisk {
  factors: FactorLevels;
  /** Factores sin dato: la UI debe decirlo («sin datos de viento en este tramo»). */
  unknownFactors: Factor[];
  /** Códigos 96/99 o CAPE+rayos altos: «riesgo de tormenta con granizo», nunca «granizará». */
  hailRisk: boolean;
}

/** Desempate del factor dominante a igual nivel: lo más peligroso para conducir primero. */
const PRIORITY: readonly Factor[] = ['ice', 'snow', 'storm', 'crosswind', 'visibility', 'gust', 'rain'];

const atLeast = (v: number, [l1, l2, l3]: readonly [number, number, number]): RiskLevel =>
  v >= l3 ? 3 : v >= l2 ? 2 : v >= l1 ? 1 : 0;
const below = (v: number, [l1, l2, l3]: readonly [number, number, number]): RiskLevel =>
  v < l3 ? 3 : v < l2 ? 2 : v < l1 ? 1 : 0;

export interface HourScore {
  factors: FactorLevels;
  hailRisk: boolean;
  crossGustKmH: number | null;
}

/** Nivel de cada factor para una hora y el rumbo local de la carretera. */
export function scoreHour(h: HourSample, headingDeg: number, th: Thresholds): HourScore {
  const crossGustKmH =
    h.gustsKmH !== null && h.windFromDeg !== null
      ? relativeWind(headingDeg, h.windFromDeg, Math.max(0, h.gustsKmH)).crossKmH
      : null;

  let ice: RiskLevelOrUnknown;
  if (h.weatherCode !== null && th.ice.freezingCodes.includes(h.weatherCode)) ice = 2;
  else if (h.tempC === null || h.precipitationMmH === null) ice = 'unknown';
  else ice = h.tempC <= th.ice.maxTempC && h.precipitationMmH >= th.ice.minPrecipMmH ? 1 : 0;

  const convective =
    h.cape !== null &&
    h.lightningPotential !== null &&
    h.cape >= th.storm.capeHigh &&
    h.lightningPotential >= th.storm.lightningHigh;
  let storm: RiskLevelOrUnknown;
  if (convective || (h.weatherCode !== null && th.storm.hailCodes.includes(h.weatherCode))) storm = 2;
  else if (h.weatherCode === null) storm = 'unknown';
  else storm = th.storm.thunderCodes.includes(h.weatherCode) ? 1 : 0;

  let snow: RiskLevelOrUnknown = 'unknown';
  if (h.snowfallCmH !== null) {
    const s = h.snowfallCmH;
    snow = s >= th.snowCmH.level3 ? 3 : s >= th.snowCmH.level2 ? 2 : s > th.snowCmH.anyAbove ? 1 : 0;
  }

  return {
    factors: {
      rain: h.precipitationMmH === null ? 'unknown' : atLeast(h.precipitationMmH, th.rainMmH),
      crosswind: crossGustKmH === null ? 'unknown' : atLeast(crossGustKmH, th.crossGustKmH),
      gust: h.gustsKmH === null ? 'unknown' : atLeast(h.gustsKmH, th.gustKmH),
      snow,
      ice,
      visibility: h.visibilityM === null ? 'unknown' : below(h.visibilityM, th.visibilityM),
      storm,
    },
    hailRisk: storm === 2,
    crossGustKmH,
  };
}

const maxNullable = (a: number | null | undefined, b: number | null): number | null =>
  b === null ? (a ?? null) : a === null || a === undefined ? b : Math.max(a, b);
const minNullable = (a: number | null | undefined, b: number | null): number | null =>
  b === null ? (a ?? null) : a === null || a === undefined ? b : Math.min(a, b);

/**
 * Riesgo de un punto: peor caso por factor en las horas de la ventana, nivel = máximo de factores
 * (+1 si coinciden ≥ 2 factores en nivel ≥ 2, acotado a 3). Datos ausentes nunca cuentan como 0:
 * si lo conocido es 0 pero falta algún factor, el punto es `unknown`.
 */
export function scorePoint(hours: readonly HourSample[], headingDeg: number, th: Thresholds): PointAssessment {
  const factors = Object.fromEntries(FACTORS.map((f) => [f, 'unknown'])) as FactorLevels;
  if (hours.length === 0) {
    return { level: 'unknown', values: {}, factors, unknownFactors: [...FACTORS], hailRisk: false };
  }

  const values: Record<string, number | null> = {};
  let hailRisk = false;
  for (const h of hours) {
    const s = scoreHour(h, headingDeg, th);
    hailRisk ||= s.hailRisk;
    for (const f of FACTORS) {
      const cur = factors[f];
      const next = s.factors[f];
      if (next !== 'unknown' && (cur === 'unknown' || next > cur)) factors[f] = next;
    }
    values.precipitationMmH = maxNullable(values.precipitationMmH, h.precipitationMmH);
    values.gustsKmH = maxNullable(values.gustsKmH, h.gustsKmH);
    values.crossGustKmH = maxNullable(values.crossGustKmH, s.crossGustKmH);
    values.snowfallCmH = maxNullable(values.snowfallCmH, h.snowfallCmH);
    values.visibilityM = minNullable(values.visibilityM, h.visibilityM);
    values.tempC = minNullable(values.tempC, h.tempC);
    values.cape = maxNullable(values.cape, h.cape);
  }

  const unknownFactors = FACTORS.filter((f) => factors[f] === 'unknown');
  const known = FACTORS.filter((f) => factors[f] !== 'unknown');
  const levelOf = (f: Factor) => factors[f] as RiskLevel;
  const max = known.reduce<RiskLevel>((m, f) => (levelOf(f) > m ? levelOf(f) : m), 0);

  if (max === 0) {
    return unknownFactors.length
      ? { level: 'unknown', values, factors, unknownFactors, hailRisk }
      : { level: 0, values, factors, unknownFactors, hailRisk };
  }

  const severe = known.filter((f) => levelOf(f) >= 2).length;
  const level = Math.min(3, max + (severe >= th.coincidenceFactors ? 1 : 0)) as RiskLevel;
  const dominant = PRIORITY.filter((f) => factors[f] === max)[0];
  return { level, ...(dominant ? { dominant } : {}), values, factors, unknownFactors, hailRisk };
}

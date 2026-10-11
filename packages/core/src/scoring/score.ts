import { FACTORS, type Factor, type PointRisk, type RiskLevel, type RiskLevelOrUnknown } from '@routecast/shared';
import type { HourSample } from '../weather';
import { relativeWind } from '../wind';
import type { Thresholds } from './thresholds';

export type FactorLevels = Record<Factor, RiskLevelOrUnknown>;

export interface PointAssessment extends PointRisk {
  factors: FactorLevels;
  /** Factores sin dato: la UI debe decirlo («sin datos de viento en este tramo»). */
  unknownFactors: Factor[];
  /** Nivel calculado con algún factor secundario ausente. */
  partial: boolean;
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
  else if (h.tempC !== null && h.tempC > th.ice.maxTempC) ice = 0;
  else if (h.tempC === null || h.precipitationMmH === null) ice = 'unknown';
  else ice = h.precipitationMmH >= th.ice.minPrecipMmH ? 1 : 0;

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

/** Bonus de coincidencia dentro de UNA hora: grupos independientes en nivel ≥ 2. */
function hourLevel(f: FactorLevels, th: Thresholds): RiskLevel {
  let max: RiskLevel = 0;
  for (const k of FACTORS) {
    const v = f[k];
    if (v !== 'unknown' && v > max) max = v;
  }
  const severeGroups = th.coincidenceGroups.filter((g) => g.some((k) => f[k] === 2 || f[k] === 3)).length;
  return Math.min(3, max + (max >= 2 && severeGroups >= th.coincidenceFactors ? 1 : 0)) as RiskLevel;
}

/**
 * Riesgo de un punto (SPEC §6.3): cada hora de la ventana se puntúa por separado (bonus de coincidencia incluido)
 * y el punto toma la peor hora; por factor se guarda el peor caso para explicar. Datos ausentes nunca cuentan como 0:
 * si falta un factor esencial y lo conocido es 0, el punto es `unknown`; si falta uno secundario, es 0 «parcial».
 */
export function scorePoint(hours: readonly HourSample[], headingDeg: number, th: Thresholds): PointAssessment {
  const factors = Object.fromEntries(FACTORS.map((f) => [f, 'unknown'])) as FactorLevels;
  if (hours.length === 0) {
    return { level: 'unknown', values: {}, factors, unknownFactors: [...FACTORS], hailRisk: false, partial: false };
  }

  const values: Record<string, number | null> = {};
  let hailRisk = false;
  let level: RiskLevel = 0;
  for (const h of hours) {
    const s = scoreHour(h, headingDeg, th);
    hailRisk ||= s.hailRisk;
    const hl = hourLevel(s.factors, th);
    if (hl > level) level = hl;
    for (const f of FACTORS) {
      const cur = factors[f];
      const next = s.factors[f];
      if (next !== 'unknown' && (cur === 'unknown' || next > cur)) factors[f] = next;
    }
    values.precipitationMmH = maxNullable(values.precipitationMmH, h.precipitationMmH);
    values.gustsKmH = maxNullable(values.gustsKmH, h.gustsKmH);
    if (
      s.crossGustKmH !== null &&
      (values.crossGustKmH === undefined || values.crossGustKmH === null || s.crossGustKmH > values.crossGustKmH)
    ) {
      // Dirección de la hora con mayor racha cruzada, para dibujar el viento respecto a la carretera.
      values.windFromDeg = h.windFromDeg;
    }
    values.crossGustKmH = maxNullable(values.crossGustKmH, s.crossGustKmH);
    values.snowfallCmH = maxNullable(values.snowfallCmH, h.snowfallCmH);
    values.visibilityM = minNullable(values.visibilityM, h.visibilityM);
    values.tempC = minNullable(values.tempC, h.tempC);
    values.cape = maxNullable(values.cape, h.cape);
  }

  const unknownFactors = FACTORS.filter((f) => factors[f] === 'unknown');
  if (level === 0) {
    const missingEssential = unknownFactors.some((f) => th.essentialFactors.includes(f));
    if (missingEssential) return { level: 'unknown', values, factors, unknownFactors, hailRisk, partial: false };
    return { level: 0, values, factors, unknownFactors, hailRisk, partial: unknownFactors.length > 0 };
  }

  let maxFactor: RiskLevel = 0;
  for (const f of FACTORS) {
    const v = factors[f];
    if (v !== 'unknown' && v > maxFactor) maxFactor = v;
  }
  const dominant = PRIORITY.find((f) => factors[f] === maxFactor);
  return {
    level,
    ...(dominant ? { dominant } : {}),
    values,
    factors,
    unknownFactors,
    hailRisk,
    partial: unknownFactors.length > 0,
  };
}

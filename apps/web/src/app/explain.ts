import type { EvaluatedPoint } from '@routecast/core';
import type { Factor } from '@routecast/shared';
import type { Dict } from '../i18n';

const fmt1 = (n: number, locale: string) => n.toLocaleString(locale, { maximumFractionDigits: 1 });

/** Frase concreta del factor dominante de un punto (DESIGN §6.4: voz sobria, sin falsa precisión). */
export function explainFactor(p: EvaluatedPoint, t: Dict): string {
  const r = p.risk;
  if (r.level === 'unknown') return t.explain.unknown;
  const v = r.values;
  const round = (x: number | null | undefined) => Math.round(x ?? 0);
  const byFactor: Record<Factor, () => string> = {
    crosswind: () => t.explain.crosswind(round(v.crossGustKmH), round(v.gustsKmH)),
    gust: () => t.explain.gust(round(v.gustsKmH)),
    rain: () => t.explain.rain(fmt1(v.precipitationMmH ?? 0, t.locale)),
    snow: () => t.explain.snow(fmt1(v.snowfallCmH ?? 0, t.locale)),
    ice: () => (r.factors.ice === 2 ? t.explain.freezing : t.explain.ice(fmt1(v.tempC ?? 0, t.locale))),
    visibility: () => t.explain.visibility(Math.round((v.visibilityM ?? 0) / 10) * 10),
    storm: () => (r.hailRisk ? t.explain.hail : t.explain.storm),
  };
  return r.dominant ? byFactor[r.dominant]() : '';
}

/** Qué es el peligro de un punto, en pocas palabras («Poca visibilidad»), o null si no hay riesgo. */
export function causeOf(p: EvaluatedPoint, t: Dict): { factor: Factor; label: string } | null {
  const r = p.risk;
  if (r.level === 'unknown' || r.level === 0 || !r.dominant) return null;
  const label = r.dominant === 'storm' && r.hailRisk ? t.cause.hail : t.cause[r.dominant];
  return { factor: r.dominant, label };
}

/** Nota de datos parciales («Sin datos de visibilidad en algún tramo.»). */
export function partialNote(points: readonly EvaluatedPoint[], t: Dict): string | null {
  const missing = new Set<Factor>();
  for (const p of points) for (const f of p.risk.unknownFactors) missing.add(f);
  if (!missing.size) return null;
  return t.explain.partial([...missing].map((f) => t.factor[f].toLowerCase()).join(', '));
}

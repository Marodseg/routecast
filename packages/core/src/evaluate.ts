import type { HourlyWeather, SamplePoint, UnixMs } from '@routecast/shared';
import { aggregateRoute, type RouteRisk } from './aggregate';
import { attachEta } from './eta';
import type { RouteSample } from './resample';
import { type PointAssessment, scorePoint } from './scoring/score';
import { DEFAULT_THRESHOLDS, type Thresholds } from './scoring/thresholds';
import { cellKey, hoursAround } from './weather';

/** Más allá de esto la previsión se marca con confianza baja (SPEC §6.3). */
export const LOW_CONFIDENCE_AFTER_MS = 48 * 3_600_000;

export interface EvaluatedPoint {
  sample: SamplePoint;
  risk: PointAssessment;
  confidence: 'normal' | 'low';
  /** No había ninguna hora de previsión en la ventana de la ETA. */
  outOfHorizon: boolean;
}

export interface EvaluateInput {
  samples: readonly RouteSample[];
  /** Previsión por celda (`cellKey`). Se lee, nunca se pide: cambiar la salida no hace red. */
  weather: ReadonlyMap<string, HourlyWeather>;
  departureMs: UnixMs;
  /** Reloj inyectado (ADR-0005). */
  nowMs: UnixMs;
  thresholds?: Thresholds;
}

export interface Evaluation {
  points: EvaluatedPoint[];
  risk: RouteRisk;
}

/** Pipeline puro de ARCHITECTURE §5: ETA → ventana meteo → viento relativo → riesgo → agregación. */
export function evaluateRoute({
  samples,
  weather,
  departureMs,
  nowMs,
  thresholds = DEFAULT_THRESHOLDS,
}: EvaluateInput): Evaluation {
  const timed = attachEta(samples, departureMs);
  const points = timed.map((sample): EvaluatedPoint => {
    const hw = weather.get(cellKey(sample.at));
    const hours = hw ? hoursAround(hw, sample.etaMs) : [];
    return {
      sample,
      risk: scorePoint(hours, sample.headingDeg, thresholds),
      confidence: sample.etaMs - nowMs > LOW_CONFIDENCE_AFTER_MS ? 'low' : 'normal',
      outOfHorizon: hw !== undefined && hours.length === 0,
    };
  });
  return {
    points,
    risk: aggregateRoute(
      timed,
      points.map((p) => p.risk),
    ),
  };
}

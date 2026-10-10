import type { LatLng, Route } from '@routecast/shared';
import { angularDiffDeg, cumulativeDistancesM, pointAtDistance, smoothedHeadingAt } from './geo';

export interface ResampleOptions {
  /** Distancia máxima entre muestras (km). */
  stepKm: number;
  /** Cambio de rumbo que fuerza una muestra (grados). */
  turnDeg: number;
  /** Separación mínima entre muestras (km), evita ráfagas en rotondas y curvas encadenadas. */
  minGapKm: number;
  /** Semiventana del rumbo publicado en cada muestra (km), SPEC §6.2. */
  headingWindowKm: number;
  /** Semiventana para detectar giros (km); menor que la anterior para no diluir el giro. */
  turnWindowKm: number;
}

export const DEFAULT_RESAMPLE: ResampleOptions = {
  stepKm: 25,
  turnDeg: 45,
  minGapKm: 2,
  headingWindowKm: 2,
  turnWindowKm: 0.5,
};

/** Muestra sin hora: la ETA se añade después con `attachEta`, así cambiar la salida no remuestrea. */
export interface RouteSample {
  index: number;
  at: LatLng;
  kmFromStart: number;
  /** Segundos desde la salida hasta este punto (interpolados por distancia). */
  offsetS: number;
  headingDeg: number;
}

function validate(route: Route): void {
  const n = route.geometry.length;
  if (n === 0) throw new RangeError('resample: geometría vacía');
  if (route.cumDurationS.length !== n) throw new RangeError('resample: cumDurationS no casa con la geometría');
  for (let i = 1; i < n; i++) {
    if (!((route.cumDurationS[i] ?? Number.NaN) >= (route.cumDurationS[i - 1] ?? Number.NaN))) {
      throw new RangeError('resample: cumDurationS debe ser no decreciente');
    }
  }
}

/** Muestrea la ruta cada `stepKm`, en origen y destino, y donde el rumbo cambia más de `turnDeg` (SPEC F3). */
export function resample(route: Route, options: Partial<ResampleOptions> = {}): RouteSample[] {
  validate(route);
  const o = { ...DEFAULT_RESAMPLE, ...options };
  const g = route.geometry;
  const cum = cumulativeDistancesM(g);
  const total = cum[cum.length - 1] ?? 0;
  const step = o.stepKm * 1000;
  const minGap = o.minGapKm * 1000;

  const offsetAt = (d: number): number => {
    const p = pointAtDistance(g, cum, d);
    const a = route.cumDurationS[p.segment] ?? 0;
    const b = route.cumDurationS[p.segment + 1] ?? a;
    return a + (b - a) * p.t;
  };
  const sample = (d: number): RouteSample => ({
    index: 0,
    at: pointAtDistance(g, cum, d).at,
    kmFromStart: d / 1000,
    offsetS: offsetAt(d),
    headingDeg: smoothedHeadingAt(g, cum, d, o.headingWindowKm * 1000),
  });

  const out: RouteSample[] = [sample(0)];
  if (total === 0) return out;

  const turnHeading = (d: number) => smoothedHeadingAt(g, cum, d, o.turnWindowKm * 1000);
  let lastD = 0;
  let lastTurnHeading = turnHeading(0);
  let v = 1;
  while (true) {
    const next = lastD + step;
    // ¿Hay un giro antes de la siguiente muestra por distancia?
    let turnAt: number | null = null;
    for (; v < g.length && (cum[v] ?? 0) < Math.min(next, total); v++) {
      const d = cum[v] ?? 0;
      if (d - lastD < minGap || total - d < minGap) continue;
      if (angularDiffDeg(turnHeading(d), lastTurnHeading) > o.turnDeg) {
        turnAt = d;
        v++;
        break;
      }
    }
    const d = turnAt ?? next;
    if (d >= total - minGap / 2) break;
    out.push(sample(d));
    lastD = d;
    lastTurnHeading = turnHeading(d);
  }
  out.push(sample(total));
  return out.map((s, i) => ({ ...s, index: i }));
}

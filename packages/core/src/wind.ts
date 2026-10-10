const DEG = Math.PI / 180;
/** Por debajo de esto una componente se considera nula (evita «-0» y ruido de coma flotante). */
const EPS = 1e-9;

/** Normaliza un ángulo a [0, 360). */
export function normalizeDeg(deg: number): number {
  const n = ((deg % 360) + 360) % 360;
  return n === 360 ? 0 : n;
}

export interface RelativeWind {
  /** Componente frontal (km/h): positiva = de cara, negativa = de cola. */
  headKmH: number;
  /** Componente cruzada (km/h), siempre ≥ 0. */
  crossKmH: number;
  /** Lado desde el que entra el viento respecto al sentido de la marcha. */
  fromSide: 'left' | 'right' | 'none';
}

const clean = (n: number, scale: number): number => (Math.abs(n) <= EPS * Math.max(1, scale) ? 0 : n);

/**
 * Descompone el viento respecto a la carretera (SPEC §6.2).
 * @param headingDeg rumbo de la ruta: hacia dónde se circula (0 = norte, sentido horario).
 * @param windFromDeg dirección meteorológica: de dónde viene el viento.
 * @param speedKmH velocidad o racha (km/h), ≥ 0.
 */
export function relativeWind(headingDeg: number, windFromDeg: number, speedKmH: number): RelativeWind {
  if (!Number.isFinite(headingDeg) || !Number.isFinite(windFromDeg) || !Number.isFinite(speedKmH) || speedKmH < 0) {
    throw new RangeError('relativeWind: valores no válidos');
  }
  const theta = normalizeDeg(windFromDeg - headingDeg) * DEG;
  const sin = Math.sin(theta);
  const headKmH = clean(speedKmH * Math.cos(theta), speedKmH);
  const crossKmH = clean(speedKmH * Math.abs(sin), speedKmH);
  const fromSide = crossKmH === 0 ? 'none' : sin > 0 ? 'right' : 'left';
  return { headKmH: headKmH === 0 ? 0 : headKmH, crossKmH: crossKmH === 0 ? 0 : crossKmH, fromSide };
}

import type { SamplePoint, UnixMs } from '@routecast/shared';
import type { RouteSample } from './resample';

/** ETA de cada muestra = salida + tiempo acumulado (SPEC F4). La salida se inyecta: core no lee el reloj. */
export function attachEta(samples: readonly RouteSample[], departureMs: UnixMs): SamplePoint[] {
  if (!Number.isFinite(departureMs)) throw new RangeError('attachEta: hora de salida no válida');
  return samples.map(({ offsetS, ...s }) => ({ ...s, etaMs: departureMs + Math.round(offsetS * 1000) }));
}

import type { LatLng, Route } from '@routecast/shared';
import { describe, expect, it } from 'vitest';
import { evaluateRoute, LOW_CONFIDENCE_AFTER_MS } from '../src/evaluate';
import { cumulativeDistancesM } from '../src/geo';
import { resample } from '../src/resample';
import { cellKey } from '../src/weather';
import { H, hourly, T0 } from './fixtures';

const ll = (lat: number, lng: number): LatLng => ({ lat, lng });

/** 60 km hacia el norte a 60 km/h desde (37, -4.5). */
function northRoute(): Route {
  const g: LatLng[] = [];
  for (let k = 0; k <= 60; k += 2) g.push(ll(37 + k / 111.32, -4.5));
  const cum = cumulativeDistancesM(g);
  return {
    id: 'N',
    geometry: g,
    distanceM: cum.at(-1) ?? 0,
    durationS: (cum.at(-1) ?? 0) / (60 / 3.6),
    cumDurationS: cum.map((d) => d / (60 / 3.6)),
    provider: 'test',
  };
}

function weatherFor(route: Route, patch: Parameters<typeof hourly>[1] = {}) {
  const map = new Map<string, ReturnType<typeof hourly>>();
  for (const s of resample(route)) {
    const key = cellKey(s.at);
    map.set(key, hourly(48, patch, key));
  }
  return map;
}

describe('evaluateRoute', () => {
  const route = northRoute();
  const samples = resample(route);

  it('evalúa cada muestra con la hora de paso y agrega la ruta', () => {
    // Viento del este de 85 km/h entre las 14:00 y las 15:00: cruzado severo para quien va al norte.
    const weather = weatherFor(route, { 2: { gustsKmH: 85, windFromDeg: 90 }, 3: { gustsKmH: 85, windFromDeg: 90 } });
    const at14 = evaluateRoute({ samples, weather, departureMs: T0 + 2 * H, nowMs: T0 });
    expect(at14.risk.worstLevel).toBe(3);
    expect(at14.risk.dominantFactor).toBe('crosswind');
    const at18 = evaluateRoute({ samples, weather, departureMs: T0 + 6 * H, nowMs: T0 });
    expect(at18.risk.worstLevel).toBe(0);
  });

  it('cambiar la salida reutiliza muestras y datos: mismo resultado para la misma hora (determinista)', () => {
    const weather = weatherFor(route);
    const a = evaluateRoute({ samples, weather, departureMs: T0 + H, nowMs: T0 });
    const b = evaluateRoute({ samples, weather, departureMs: T0 + H, nowMs: T0 });
    expect(b).toEqual(a);
  });

  it('celda sin datos → puntos unknown, nunca «sin riesgo»', () => {
    const r = evaluateRoute({ samples, weather: new Map(), departureMs: T0, nowMs: T0 });
    expect(r.points.every((p) => p.risk.level === 'unknown')).toBe(true);
    expect(r.risk.worstLevel).toBe('unknown');
  });

  it('fuera del horizonte de previsión → unknown y marcado', () => {
    const weather = weatherFor(route);
    const r = evaluateRoute({ samples, weather, departureMs: T0 + 100 * H, nowMs: T0 });
    expect(r.points.every((p) => p.risk.level === 'unknown' && p.outOfHorizon)).toBe(true);
  });

  it('más allá de 48 h la confianza es baja', () => {
    const weather = new Map([...weatherFor(route)].map(([k, v]) => [k, { ...v, ...hourly(80, {}, k) }]));
    const near = evaluateRoute({ samples, weather, departureMs: T0 + H, nowMs: T0 });
    const far = evaluateRoute({ samples, weather, departureMs: T0 + LOW_CONFIDENCE_AFTER_MS + H, nowMs: T0 });
    expect(near.points.every((p) => p.confidence === 'normal')).toBe(true);
    expect(far.points.every((p) => p.confidence === 'low')).toBe(true);
  });

  it('la ETA de cada punto es salida + tiempo acumulado', () => {
    const r = evaluateRoute({ samples, weather: weatherFor(route), departureMs: T0, nowMs: T0 });
    const last = r.points.at(-1);
    expect(last?.sample.etaMs).toBeCloseTo(T0 + route.durationS * 1000, -3);
  });
});

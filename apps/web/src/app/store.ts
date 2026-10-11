import {
  cumulativeDistancesM,
  type Evaluation,
  evaluateRoute,
  type RouteSample,
  rankRoutes,
  resample,
  uniqueCells,
} from '@routecast/core';
import type { HourlyWeather, Place, RiskLevelOrUnknown, Route } from '@routecast/shared';
import type { ProviderError } from '@routecast/shared/providers';
import { batch, createMemo, createSignal, onCleanup } from 'solid-js';
import type { Services } from './services';
import { HORIZON_MIN, localMidnightMs, MIN_MS, nextStep, STEP_MIN } from './time';
import { WeatherCache } from './weatherCache';

export const LETTERS = ['A', 'B', 'C'] as const;
export const MAX_ROUTES = 3;

export interface RouteView {
  letter: string;
  route: Route;
  samples: RouteSample[];
  /** Distancias acumuladas de la geometría (m), para cortar tramos al pintar. */
  cumM: number[];
}

export type Phase = 'idle' | 'routing' | 'weather' | 'ready' | 'error';

export interface Evaluated {
  view: RouteView;
  ev: Evaluation;
}

export interface StoreOptions {
  now?: () => number;
  cache?: WeatherCache;
}

/**
 * Estado de la app y orquestación de red. Regla clave (SPEC F10): mover la hora de salida solo re-evalúa en `core`
 * con los datos ya en memoria; la red solo se toca al cambiar origen o destino.
 */
export function createAppStore(services: Services, opts: StoreOptions = {}) {
  const clock = opts.now ?? Date.now;
  const cache = opts.cache ?? new WeatherCache(clock);

  const [nowMs, setNowMs] = createSignal(clock());
  const [from, setFrom] = createSignal<Place | null>(null);
  const [to, setTo] = createSignal<Place | null>(null);
  const [departureMs, setDepartureMs] = createSignal(nextStep(clock()));
  const [views, setViews] = createSignal<RouteView[]>([]);
  const [selected, setSelected] = createSignal<string | null>(null);
  const [phase, setPhase] = createSignal<Phase>('idle');
  const [routeError, setRouteError] = createSignal<ProviderError | null>(null);
  const [weatherError, setWeatherError] = createSignal<ProviderError | null>(null);
  const [weatherVersion, setWeatherVersion] = createSignal(0);
  const [usedProvider, setUsedProvider] = createSignal<string | null>(null);
  const weather = new Map<string, HourlyWeather>();

  const tick = setInterval(() => setNowMs(clock()), 60_000);
  onCleanup(() => clearInterval(tick));

  let ctrl: AbortController | undefined;
  onCleanup(() => ctrl?.abort());

  /** Pide rutas y previsión para el par origen/destino actual. Cancela lo anterior. */
  async function load(): Promise<void> {
    ctrl?.abort();
    const a = from();
    const b = to();
    if (!a || !b) {
      batch(() => {
        setViews([]);
        setPhase('idle');
        setRouteError(null);
      });
      return;
    }
    const c = new AbortController();
    ctrl = c;
    batch(() => {
      setPhase('routing');
      setRouteError(null);
      setWeatherError(null);
    });

    const res = await services.routing.getRoutes(a.at, b.at, { alternatives: MAX_ROUTES - 1, signal: c.signal });
    if (c.signal.aborted) return;
    if (!res.ok) {
      batch(() => {
        setViews([]);
        setRouteError(res.error);
        setPhase('error');
      });
      return;
    }

    const next: RouteView[] = res.value.slice(0, MAX_ROUTES).map((route, i) => ({
      letter: LETTERS[i] ?? String(i + 1),
      route,
      samples: resample(route),
      cumM: cumulativeDistancesM(route.geometry),
    }));
    batch(() => {
      setViews(next);
      setUsedProvider(res.value[0]?.provider ?? null);
      setSelected((s) => (s && next.some((v) => v.letter === s) ? s : (next[0]?.letter ?? null)));
      setPhase('weather');
    });

    // Celdas únicas de todas las rutas: una sola tanda de peticiones (ARCHITECTURE §4.2).
    const cells = uniqueCells(next.flatMap((v) => v.samples.map((s) => s.at)));
    const cached = await cache.getMany(cells.map((x) => x.key));
    if (c.signal.aborted) return;
    for (const [k, h] of cached) weather.set(k, h);
    const missing = cells.filter((x) => !cached.has(x.key));
    if (missing.length) {
      const w = await services.weather.getHourly(missing, { signal: c.signal, forecastDays: 3 });
      if (c.signal.aborted) return;
      if (w.ok) {
        for (const h of w.value) weather.set(h.cell, h);
        void cache.putMany(w.value);
      } else {
        setWeatherError(w.error);
      }
    }
    batch(() => {
      setWeatherVersion((n) => n + 1);
      setPhase('ready');
    });
  }

  // --- Evaluación pura (sin red) ---
  const evaluated = createMemo<Evaluated[]>(() => {
    weatherVersion();
    const dep = departureMs();
    const now = nowMs();
    return views().map((view) => ({
      view,
      ev: evaluateRoute({ samples: view.samples, weather, departureMs: dep, nowMs: now }),
    }));
  });

  const ranked = createMemo(() =>
    rankRoutes(
      evaluated().map((e) => ({ id: e.view.letter, durationS: e.view.route.durationS, risk: e.ev.risk, e })),
    ).map((x) => x.e),
  );

  const selectedEval = createMemo(() => evaluated().find((e) => e.view.letter === selected()) ?? evaluated()[0]);

  // --- Dial: minutos desde la medianoche local de hoy ---
  const dayStart = createMemo(() => localMidnightMs(nowMs()));
  const pickerMin = createMemo(() => Math.round((nextStep(nowMs()) - dayStart()) / MIN_MS));
  const pickerMax = createMemo(() => pickerMin() + HORIZON_MIN);

  /** Peor nivel por hora de salida para cada ruta (banda del dial). Solo depende de rutas y datos, no de la hora elegida. */
  const bands = createMemo(() => {
    weatherVersion();
    const startHour = Math.floor(pickerMin() / 60) * 60;
    const hours = Math.ceil((pickerMax() - startHour) / 60) + 1;
    const now = nowMs();
    return views().map((view) => ({
      id: view.letter,
      levels: Array.from({ length: hours }, (_, h): RiskLevelOrUnknown => {
        const dep = dayStart() + (startHour + h * 60 + 30) * MIN_MS;
        return evaluateRoute({ samples: view.samples, weather, departureMs: dep, nowMs: now }).risk.worstLevel;
      }),
    }));
  });

  const setDepartureMinutes = (m: number) => {
    const clamped = Math.min(pickerMax(), Math.max(pickerMin(), Math.round(m / STEP_MIN) * STEP_MIN));
    setDepartureMs(dayStart() + clamped * MIN_MS);
  };
  const departureMinutes = () => Math.round((departureMs() - dayStart()) / MIN_MS);

  return {
    // estado
    nowMs,
    from,
    to,
    departureMs,
    views,
    selected,
    phase,
    routeError,
    weatherError,
    usedProvider,
    // derivados
    evaluated,
    ranked,
    selectedEval,
    bands,
    dayStart,
    pickerMin,
    pickerMax,
    departureMinutes,
    // acciones
    setFrom,
    setTo,
    setSelected,
    setDepartureMs,
    setDepartureMinutes,
    load,
    swap: () => {
      const a = from();
      batch(() => {
        setFrom(to());
        setTo(a);
      });
    },
  };
}

export type AppStore = ReturnType<typeof createAppStore>;

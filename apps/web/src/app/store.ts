import {
  cumulativeDistancesM,
  type Evaluation,
  evaluateRoute,
  LOW_CONFIDENCE_AFTER_MS,
  type RouteSample,
  type RouteWarningHit,
  rankRoutes,
  resample,
  simplifyRoute,
  uniqueCells,
  warningsOnRoute,
} from '@routecast/core';
import type { HourlyWeather, Place, RiskLevelOrUnknown, Route } from '@routecast/shared';
import type { ProviderError, Warning } from '@routecast/shared/providers';
import { batch, createEffect, createMemo, createSignal, onCleanup, untrack } from 'solid-js';
import type { Services } from './services';
import {
  FORECAST_DAYS,
  horizonEndMs,
  localMidnightMs,
  localMidnightPlus,
  MIN_MS,
  nextStep,
  STEP_MIN,
  seriesCoversHorizon,
} from './time';
import { loadLast, saveLast, WeatherCache } from './weatherCache';

export const LETTERS = ['A', 'B', 'C'] as const;

interface PickerDayLite {
  startMs: number;
  orientative: boolean;
}
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
  /** Avisos oficiales que cruzan la ruta a la hora de paso. */
  alerts: RouteWarningHit<Warning>[];
}

/** Estado de los avisos oficiales: «off» = no hay Worker configurado (distinto de «no hay avisos»). */
export type WarningsStatus = 'off' | 'idle' | 'loading' | 'ok' | 'partial' | 'down';

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
  const [departureMs, setDepartureRaw] = createSignal(nextStep(clock()));
  const [views, setViews] = createSignal<RouteView[]>([]);
  const [selected, setSelected] = createSignal<string | null>(null);
  const [phase, setPhase] = createSignal<Phase>('idle');
  const [routeError, setRouteError] = createSignal<ProviderError | null>(null);
  const [weatherError, setWeatherError] = createSignal<ProviderError | null>(null);
  /** Hay celdas sin previsión (lote fallido): esos tramos salen sin riesgo calculado. */
  const [weatherPartial, setWeatherPartial] = createSignal(false);
  const [weatherVersion, setWeatherVersion] = createSignal(0);
  /** Celdas con previsión ya resuelta durante la fase 'weather' (caché incluida); null fuera de ella. */
  const [weatherProgress, setWeatherProgress] = createSignal<{ done: number; total: number } | null>(null);
  const [usedProvider, setUsedProvider] = createSignal<string | null>(null);
  /** Se muestran rutas guardadas porque no hay conexión. */
  const [offline, setOffline] = createSignal(false);
  const queryKey = (a: Place, b: Place) =>
    `${a.at.lat.toFixed(4)},${a.at.lng.toFixed(4)};${b.at.lat.toFixed(4)},${b.at.lng.toFixed(4)}`;
  const weather = new Map<string, HourlyWeather>();
  const [warnings, setWarnings] = createSignal<Warning[]>([]);
  let warningsAt = 0;
  const [warningsStatus, setWarningsStatus] = createSignal<WarningsStatus>(services.warnings ? 'idle' : 'off');

  /** Avisos de la caja que cubre todas las rutas, para toda la ventana de salida ofrecida (una petición por consulta). */
  async function loadWarnings(views: RouteView[], signal: AbortSignal): Promise<void> {
    const provider = services.warnings;
    if (!provider || !views.length) return;
    let [w, s, e, n] = [180, 90, -180, -90];
    for (const v of views) {
      for (const p of v.route.geometry) {
        if (p.lng < w) w = p.lng;
        if (p.lng > e) e = p.lng;
        if (p.lat < s) s = p.lat;
        if (p.lat > n) n = p.lat;
      }
    }
    const longest = Math.max(...views.map((v) => v.route.durationS)) * 1000;
    const start = clock();
    warningsAt = start;
    setWarningsStatus('loading');
    const res = await provider.getWarnings(
      [w - 0.05, s - 0.05, e + 0.05, n + 0.05],
      [start, horizonEndMs(start) + longest],
      {
        signal,
      },
    );
    if (signal.aborted) return;
    batch(() => {
      if (res.ok) {
        setWarnings(res.value.warnings);
        setWarningsStatus(res.value.partial ? 'partial' : 'ok');
      } else {
        setWarnings([]);
        setWarningsStatus('down');
      }
    });
  }

  const tick = setInterval(() => setNowMs(clock()), 60_000);
  onCleanup(() => clearInterval(tick));

  let ctrl: AbortController | undefined;
  onCleanup(() => ctrl?.abort());

  // Con la pestaña abierta, los avisos se refrescan al caducar la caché del Worker (10 min).
  createEffect(() => {
    nowMs();
    const vs = views();
    if (!vs.length || !ctrl || ctrl.signal.aborted || warningsStatus() === 'loading' || warningsStatus() === 'off')
      return;
    if (clock() - warningsAt >= 10 * 60_000) void loadWarnings(vs, ctrl.signal);
  });

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
        setWeatherError(null);
        setWeatherPartial(false);
        setUsedProvider(null);
        setWarnings([]);
        if (services.warnings) setWarningsStatus('idle');
      });
      return;
    }
    const c = new AbortController();
    ctrl = c;
    batch(() => {
      setViews([]);
      setPhase('routing');
      setWeatherProgress(null);
      setRouteError(null);
      setWeatherError(null);
      setWeatherPartial(false);
    });

    let res = await services.routing.getRoutes(a.at, b.at, { alternatives: MAX_ROUTES - 1, signal: c.signal });
    if (c.signal.aborted) return;
    let usingSaved = false;
    if (!res.ok && (res.error.kind === 'unavailable' || res.error.kind === 'timeout')) {
      const last = await loadLast<Route>();
      if (c.signal.aborted) return;
      if (last && last.key === queryKey(a, b) && last.routes.length) {
        res = { ok: true, value: last.routes };
        usingSaved = true;
      }
    }
    setOffline(usingSaved);
    cache.allowStale(usingSaved);
    if (!res.ok) {
      batch(() => {
        setViews([]);
        setRouteError(res.error);
        setPhase('error');
      });
      return;
    }

    if (!usingSaved) void saveLast({ key: queryKey(a, b), routes: res.value.slice(0, MAX_ROUTES), savedAtMs: clock() });
    // Geometría simplificada (15 m): mismas rutas con ~10× menos vértices; muestreo y mapa fluidos en rutas largas.
    const next: RouteView[] = res.value
      .slice(0, MAX_ROUTES)
      .map((full) => simplifyRoute(full, 15))
      .map((route, i) => ({
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
      setWarnings([]);
    });
    // Los avisos van en paralelo: no retrasan la previsión ni la bloquean si el Worker no responde.
    void loadWarnings(next, c.signal);

    // Celdas únicas de todas las rutas: una sola tanda de peticiones (ARCHITECTURE §4.2).
    const cells = uniqueCells(next.flatMap((v) => v.samples.map((s) => s.at)));
    const cached = await cache.getMany(cells.map((x) => x.key));
    if (c.signal.aborted) return;
    const now = clock();
    // Una serie de 3 días, aún fresca, no puede tapar el día 5: si no llega al horizonte, se vuelve a pedir.
    const short = new Map<string, HourlyWeather>();
    for (const [k, h] of cached) {
      if (seriesCoversHorizon(h.timesMs[h.timesMs.length - 1], now)) weather.set(k, h);
      else short.set(k, h);
    }
    const missing = cells.filter((x) => {
      const h = weather.get(x.key);
      return !h || !seriesCoversHorizon(h.timesMs[h.timesMs.length - 1], now);
    });
    const have = cells.length - missing.length;
    setWeatherProgress({ done: have, total: cells.length });
    if (missing.length) {
      const w = await services.weather.getHourly(missing, {
        signal: c.signal,
        forecastDays: FORECAST_DAYS,
        onProgress: (done) => {
          if (!c.signal.aborted) setWeatherProgress({ done: have + done, total: cells.length });
        },
      });
      if (c.signal.aborted) return;
      if (w.ok) {
        for (const h of w.value) weather.set(h.cell, h);
        void cache.putMany(w.value);
        const got = new Set(w.value.map((h) => h.cell));
        for (const cell of missing) {
          if (got.has(cell.key)) continue;
          const fallback = short.get(cell.key);
          if (fallback) weather.set(cell.key, fallback);
        }
        if (w.value.length < missing.length) setWeatherPartial(true);
      } else if (short.size) {
        for (const [k, h] of short) weather.set(k, h);
        setWeatherPartial(true);
      } else {
        setWeatherError(w.error);
      }
    }
    batch(() => {
      setWeatherVersion((n) => n + 1);
      setWeatherProgress(null);
      setPhase('ready');
    });
  }

  // --- Evaluación pura (sin red) ---
  const evaluated = createMemo<Evaluated[]>(() => {
    weatherVersion();
    const dep = departureMs();
    const now = nowMs();
    const ws = warnings();
    return views().map((view) => {
      const ev = evaluateRoute({ samples: view.samples, weather, departureMs: dep, nowMs: now });
      return {
        view,
        ev,
        alerts: ws.length
          ? warningsOnRoute(
              ev.points.map((p) => p.sample),
              ws,
            )
          : [],
      };
    });
  });

  const ranked = createMemo(() =>
    rankRoutes(
      evaluated().map((e) => ({ id: e.view.letter, durationS: e.view.route.durationS, risk: e.ev.risk, e })),
    ).map((x) => x.e),
  );

  const selectedEval = createMemo(() => evaluated().find((e) => e.view.letter === selected()) ?? evaluated()[0]);

  // --- Dial: minutos desde la medianoche local de hoy. El día se elige aparte; el dial sigue siendo la hora. ---
  const dayStart = createMemo(() => localMidnightMs(nowMs()));
  const horizonEnd = createMemo(() => horizonEndMs(nowMs()));
  const pickerMin = createMemo(() => Math.round((nextStep(nowMs()) - dayStart()) / MIN_MS));
  const pickerMax = createMemo(() => Math.round((horizonEnd() - dayStart()) / MIN_MS));

  /**
   * Hoy y los seis días siguientes que aún caben en la serie. Orientativo si el día cruza las 48 h. Mismo array
   * mientras no cambie nada: si no, el tic del reloj recrearía los botones de día y el foco de teclado se perdería.
   */
  const sameDays = (a: readonly PickerDayLite[], b: readonly PickerDayLite[]) =>
    a.length === b.length && a.every((d, i) => d.startMs === b[i]?.startMs && d.orientative === b[i]?.orientative);
  const days = createMemo<PickerDayLite[]>(
    () => {
      const start = dayStart();
      const now = nowMs();
      const hi = horizonEnd();
      const lo = start + pickerMin() * MIN_MS;
      const limit = now + LOW_CONFIDENCE_AFTER_MS;
      const out: { startMs: number; orientative: boolean }[] = [];
      for (let i = 0; i < FORECAST_DAYS; i++) {
        const day0 = localMidnightPlus(start, i);
        if (day0 > hi) break;
        const dayLo = Math.max(lo, day0);
        const dayHi = Math.min(hi, localMidnightPlus(start, i + 1) - STEP_MIN * MIN_MS);
        if (dayHi < dayLo) continue;
        out.push({ startMs: day0, orientative: dayHi > limit });
      }
      return out;
    },
    [],
    { equals: sameDays },
  );

  /**
   * Peor nivel por hora de salida para cada ruta (banda del dial). Son ~170 horas × rutas evaluaciones completas:
   * se calculan a trozos de ~12 ms (primero las horas alrededor de la salida elegida, que son las visibles en el dial)
   * para no bloquear el hilo principal. No depende del tic del reloj ni de la hora elegida, solo de rutas y datos.
   */
  const [bands, setBands] = createSignal<{ id: string; levels: RiskLevelOrUnknown[] }[]>([]);
  let bandsJob = 0;
  onCleanup(() => {
    bandsJob++;
  });
  createEffect(() => {
    weatherVersion();
    const vs = views();
    const day0 = dayStart();
    const startHour = Math.floor(pickerMin() / 60) * 60;
    const hours = Math.max(0, Math.ceil((pickerMax() - startHour) / 60) + 1);
    const now = untrack(nowMs);
    const current = untrack(() => Math.floor(((departureMs() - day0) / MIN_MS - startHour) / 60));
    const job = ++bandsJob;
    const levels = vs.map(() => new Array<RiskLevelOrUnknown>(hours).fill('unknown'));
    const order = Array.from({ length: hours }, (_, h) => h).sort(
      (a, b) => Math.abs(a - current) - Math.abs(b - current),
    );
    let k = 0;
    const step = () => {
      if (job !== bandsJob) return;
      const t0 = performance.now();
      while (k < order.length && performance.now() - t0 < 12) {
        const h = order[k++] as number;
        const dep = day0 + (startHour + h * 60 + 30) * MIN_MS;
        vs.forEach((view, i) => {
          (levels[i] as RiskLevelOrUnknown[])[h] = evaluateRoute({
            samples: view.samples,
            weather,
            departureMs: dep,
            nowMs: now,
          }).risk.worstLevel;
        });
      }
      setBands(vs.map((view, i) => ({ id: view.letter, levels: [...(levels[i] as RiskLevelOrUnknown[])] })));
      if (k < order.length) setTimeout(step, 0);
    };
    step();
  });

  /** Toda hora de salida (dial, URL) se acota al horizonte ofrecido. */
  const setDepartureMs = (ms: number) => {
    const lo = dayStart() + pickerMin() * MIN_MS;
    const hi = dayStart() + pickerMax() * MIN_MS;
    setDepartureRaw(Math.min(hi, Math.max(lo, Math.round(ms / (STEP_MIN * MIN_MS)) * STEP_MIN * MIN_MS)));
  };

  // Con la pestaña abierta el tiempo avanza: una salida que queda en el pasado sube a «ahora».
  createEffect(() => {
    const lo = dayStart() + pickerMin() * MIN_MS;
    if (departureMs() < lo) setDepartureRaw(lo);
  });

  const setDepartureMinutes = (m: number) => {
    const clamped = Math.min(pickerMax(), Math.max(pickerMin(), Math.round(m / STEP_MIN) * STEP_MIN));
    setDepartureMs(dayStart() + clamped * MIN_MS);
  };
  /** Cambia de día y conserva la hora del reloj. Si cae en el pasado o fuera de la serie, se acota. */
  const setDepartureDay = (startMs: number) => {
    const cur = new Date(departureMs());
    const next = new Date(startMs);
    next.setHours(cur.getHours(), cur.getMinutes(), 0, 0);
    setDepartureMs(next.getTime());
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
    weatherProgress,
    routeError,
    weatherError,
    weatherPartial,
    offline,
    warningsStatus,
    usedProvider,
    // derivados
    evaluated,
    ranked,
    selectedEval,
    bands,
    dayStart,
    days,
    pickerMin,
    pickerMax,
    departureMinutes,
    // acciones
    setFrom,
    setTo,
    setSelected,
    setDepartureMs,
    setDepartureMinutes,
    setDepartureDay,
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

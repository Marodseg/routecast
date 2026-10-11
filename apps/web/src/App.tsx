import { LOW_CONFIDENCE_AFTER_MS } from '@routecast/core';
import type { Place } from '@routecast/shared';
import { batch, createEffect, createMemo, createSignal, Match, on, onCleanup, onMount, Show, Switch } from 'solid-js';
import s from './App.module.css';
import { causeOf, explainFactor, partialNote } from './app/explain';
import { loadGazetteer, mergePlaces, searchGazetteer } from './app/gazetteer';
import { createServices, type Services } from './app/services';
import { createAppStore } from './app/store';
import { MIN_MS } from './app/time';
import { readUrl, writeUrl } from './app/url';
import { t } from './i18n';
import { localWhen } from './lib/format';
import { effectiveTheme } from './lib/theme';
import { MapPlaceholder } from './map/MapPlaceholder';
import { RouteMap } from './map/RouteMap';
import { AlertsStrip, type StripWarning } from './ui/AlertsStrip/AlertsStrip';
import { BottomSheet, type Snap } from './ui/BottomSheet/BottomSheet';
import { CommandSearch } from './ui/CommandSearch/CommandSearch';
import { DeparturePicker } from './ui/DeparturePicker/DeparturePicker';
import { EmptyState, Skeleton, Toaster } from './ui/Feedback/Feedback';
import { Icon } from './ui/Icon/Icon';
import { Legend } from './ui/Legend/Legend';
import { RiskChip } from './ui/RiskChip/RiskChip';
import { RiskProfile } from './ui/RiskProfile/RiskProfile';
import { RoadWind } from './ui/RoadWind/RoadWind';
import { type CompareRoute, RouteCompare } from './ui/RouteCompare/RouteCompare';
import { LangToggle, ThemeToggle } from './ui/Toggles/Toggles';

const RECENT_KEY = 'routecast:recent';
/** localStorage es entrada no confiable (otras versiones, extensiones): solo lugares bien formados. */
function isPlace(v: unknown): v is Place {
  const p = v as Partial<Place> | null;
  return (
    !!p &&
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    p.name.length > 0 &&
    !!p.at &&
    Number.isFinite(p.at.lat) &&
    Number.isFinite(p.at.lng) &&
    Math.abs(p.at.lat) <= 90 &&
    Math.abs(p.at.lng) <= 180
  );
}

function loadRecent(): Place[] {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter(isPlace).slice(0, 5) : [];
  } catch {
    return [];
  }
}
function saveRecent(p: Place, list: Place[]): Place[] {
  const next = [p, ...list.filter((x) => x.id !== p.id)].slice(0, 5);
  try {
    globalThis.localStorage?.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Sin persistencia: no pasa nada.
  }
  return next;
}

export function App(props: { services?: Services }) {
  const services = props.services ?? createServices();
  const store = createAppStore(services);
  const [recent, setRecent] = createSignal(loadRecent());
  const [snap, setSnap] = createSignal<Snap>('half');
  const mq = globalThis.matchMedia?.('(min-width: 1024px)');
  const [desktop, setDesktop] = createSignal(mq?.matches ?? true);
  onMount(() => {
    const onChange = (e: MediaQueryListEvent) => setDesktop(e.matches);
    mq?.addEventListener('change', onChange);
    onCleanup(() => mq?.removeEventListener('change', onChange));
  });
  let mapEl: HTMLDivElement | undefined;
  /** MapLibre solo cuando aporta algo (hay consulta) o se toca el mapa: la portada carga ligera. */
  const [mapWanted, setMapWanted] = createSignal(false);
  const showMap = () => mapWanted() || (!!store.from() && !!store.to());

  // --- Estado inicial desde la URL (SPEC F14) ---
  const url = readUrl(globalThis.location?.search ?? '');
  batch(() => {
    if (url.from) store.setFrom(url.from);
    if (url.to) store.setTo(url.to);
    if (url.departureMs) store.setDepartureMs(url.departureMs);
    if (url.route) store.setSelected(url.route);
  });

  createEffect(on([store.from, store.to], () => void store.load()));

  createEffect(() => {
    const q = writeUrl({
      ...(store.from() ? { from: store.from() as Place } : {}),
      ...(store.to() ? { to: store.to() as Place } : {}),
      departureMs: store.departureMs(),
      ...(store.selected() ? { route: store.selected() as string } : {}),
    });
    try {
      globalThis.history?.replaceState(null, '', `${globalThis.location.pathname}${q}`);
    } catch {
      // Entornos sin historial (tests): se ignora.
    }
  });

  const choose = (setter: (p: Place | null) => void) => (p: Place | null) => {
    setter(p);
    if (p) setRecent((list) => saveRecent(p, list));
  };
  /**
   * Nomenclátor propio primero (nombres en castellano y cooficiales, exónimos como «Hendaya») y Photon para pueblos
   * pequeños y direcciones. Si Photon falla pero el nomenclátor encuentra algo, se muestra eso.
   */
  const search = async (q: string, signal: AbortSignal) => {
    const [index, photon] = await Promise.all([loadGazetteer(), services.geocoding.suggest(q, { signal })]);
    const local = /\d/.test(q) ? [] : searchGazetteer(index, q, 5);
    if (!photon.ok) {
      if (local.length) return local;
      throw new Error(photon.error.kind);
    }
    return mergePlaces(local, photon.value, q);
  };

  // --- Vistas derivadas ---
  const compare = createMemo<CompareRoute[]>(() =>
    store.ranked().map(({ view, ev, alerts }) => {
      const worst = ev.risk.worstPoint === null ? undefined : ev.points[ev.risk.worstPoint];
      const level = ev.risk.worstLevel;
      const cause = worst ? causeOf(worst, t()) : null;
      return {
        id: view.letter,
        name: view.route.name || t().route.unnamed,
        via: services.providerLabel(view.route.provider),
        distanceKm: Math.round(view.route.distanceM / 1000),
        durationMin: Math.round(view.route.durationS / 60),
        arrival: localWhen(store.departureMs() + view.route.durationS * 1000, store.departureMs(), t().locale),
        worst: level,
        ...(cause ? { cause } : {}),
        kmHigh: Math.round(ev.risk.kmAtLevel2Plus),
        profile: ev.risk.segments,
        alerts: alerts.length,
        ...(worst && level !== 'unknown' && level > 0
          ? {
              worstText: `${explainFactor(worst, t())} · ${t().explain.at(
                localWhen(worst.sample.etaMs, store.departureMs(), t().locale),
                Math.round(worst.sample.kmFromStart),
              )}`,
            }
          : {}),
      };
    }),
  );

  const worstPoint = createMemo(() => {
    const e = store.selectedEval();
    if (!e || e.ev.risk.worstPoint === null) return null;
    const lvl = e.ev.risk.worstLevel;
    if (lvl === 'unknown' || lvl === 0) return null;
    return e.ev.points[e.ev.risk.worstPoint] ?? null;
  });

  const mapRoutes = createMemo(() =>
    store.evaluated().map(({ view, ev }) => {
      const ticks: { at: Place['at']; label: string }[] = [];
      const cum = view.route.cumDurationS;
      // Marcas de hora legibles en cualquier longitud: el paso «redondo» más corto que deja ≤ 8 marcas.
      const stepS = ([20, 30, 60, 90, 120, 180].find((m) => view.route.durationS / (m * 60) <= 8) ?? 240) * 60;
      for (let tS = stepS, i = 0; tS < view.route.durationS - stepS / 3; tS += stepS) {
        while (i < cum.length - 1 && (cum[i] ?? 0) < tS) i++;
        const at = view.route.geometry[i];
        if (at) ticks.push({ at, label: localWhen(store.departureMs() + tS * 1000, store.departureMs(), t().locale) });
      }
      return { letter: view.letter, geometry: view.route.geometry, cumM: view.cumM, segments: ev.risk.segments, ticks };
    }),
  );

  const valueText = (m: number) => {
    const e = store.selectedEval();
    const when = localWhen(store.dayStart() + m * MIN_MS, store.dayStart(), t().locale);
    if (!e) return t().picker.valueText(when, '—', '—');
    const lvl = e.ev.risk.worstLevel;
    return t().picker.valueText(
      when,
      e.view.letter,
      lvl === 'unknown' ? t().risk.unknown : (t().risk.levels[lvl] ?? ''),
    );
  };

  const stripWarnings = createMemo<StripWarning[]>(() =>
    (store.selectedEval()?.alerts ?? []).map((h) => ({
      id: h.warning.id,
      level: h.warning.level,
      phenomenon: t().alerts.kinds[h.warning.kind],
      area: `${h.warning.areaName} · ${t().alerts.stretch(
        Math.round(h.fromKm),
        Math.round(h.toKm),
        localWhen(h.firstEtaMs, store.departureMs(), t().locale),
      )}`,
      from: localWhen(h.warning.fromMs, store.departureMs(), t().locale),
      to: localWhen(h.warning.toMs, store.departureMs(), t().locale),
      source: h.warning.source,
    })),
  );

  const lowConfidence = () => store.selectedEval()?.ev.points.some((p) => p.confidence === 'low') ?? false;
  const partial = () => {
    // Mientras llega la previsión todo está «sin datos»: no es un hueco real, es que aún no ha llegado.
    const e = store.selectedEval();
    return e && store.phase() === 'ready' && !store.weatherPending() ? partialNote(e.ev.points, t()) : null;
  };

  const panel = () => (
    <div class={s.panelInner}>
      <header class={s.bar}>
        <span class={s.brand}>
          <i class={s.mark} aria-hidden="true" />
          <span>Routecast</span>
        </span>
        <span class={s.tools}>
          <LangToggle />
          <ThemeToggle />
        </span>
      </header>

      <div class={`${s.query} plate`}>
        <CommandSearch
          label={t().search.from}
          value={store.from()}
          onSelect={choose(store.setFrom)}
          search={search}
          recent={recent()}
        />
        <button
          type="button"
          class={s.swap}
          aria-label={t().search.swap}
          onClick={() => store.swap()}
          disabled={!store.from() && !store.to()}
        >
          <Icon name="swap" size={16} />
        </button>
        <CommandSearch
          label={t().search.to}
          value={store.to()}
          onSelect={choose(store.setTo)}
          search={search}
          recent={recent()}
        />
      </div>

      <Show when={store.views().length}>
        <DeparturePicker
          value={store.departureMinutes()}
          onChange={store.setDepartureMinutes}
          min={store.pickerMin()}
          max={store.pickerMax()}
          now={store.pickerMin()}
          epochMs={store.dayStart()}
          days={store.days()}
          onDay={store.setDepartureDay}
          bands={store.bands()}
          selected={store.selected() ?? undefined}
          valueText={valueText}
        />
      </Show>

      <div class={s.status} role="status" aria-live="polite">
        <Switch>
          <Match when={store.phase() === 'routing'}>{t().status.routing}</Match>
          <Match when={store.weatherPending()}>
            <div class={s.progress}>
              <span>{t().status.weather}</span>
              <Show when={store.weatherProgress()}>
                {(p) => (
                  <span class="mono" aria-hidden="true">
                    {t().status.points(p().done, p().total)}
                  </span>
                )}
              </Show>
              <span
                class={s.bar}
                classList={{ [s.indeterminate ?? '']: !store.weatherProgress() }}
                role="progressbar"
                aria-label={t().status.weather}
                aria-valuemin={0}
                aria-valuemax={store.weatherProgress()?.total}
                aria-valuenow={store.weatherProgress()?.done}
              >
                <span
                  style={{
                    transform: `scaleX(${(store.weatherProgress()?.done ?? 0) / Math.max(1, store.weatherProgress()?.total ?? 1)})`,
                  }}
                />
              </span>
            </div>
          </Match>
        </Switch>
        <Show when={store.weatherError()}>
          <p class={s.warn}>
            <Icon name="warning" size={14} />{' '}
            {store.weatherError()?.kind === 'rate_limited' ? t().status.rateLimited : t().status.weatherDown}
          </p>
        </Show>
        <Show when={store.offline()}>
          <p class={s.warn}>
            <Icon name="offline" size={14} /> {t().empty.offlineBody}
          </p>
        </Show>
        <Show when={store.weatherPartial()}>
          <p class={s.warn}>
            <Icon name="warning" size={14} /> {t().status.weatherPartial}
          </p>
        </Show>
        <Show when={store.usedProvider() && services.isFallback(store.usedProvider() ?? '')}>
          <p class={s.note}>{t().status.fallback}</p>
        </Show>
        <Show when={partial()}>{(n) => <p class={s.note}>{n()}</p>}</Show>
        <Show when={lowConfidence()}>
          <p class={s.note}>{t().confidence.low}</p>
        </Show>
      </div>

      <Switch>
        <Match when={store.phase() === 'error'}>
          <EmptyState
            icon="warning"
            tone="warning"
            title={store.routeError()?.kind === 'no_route' ? t().empty.noRouteTitle : t().status.routingDown}
            body={
              store.routeError()?.kind === 'no_route'
                ? t().empty.noRouteBody
                : store.routeError()?.kind === 'rate_limited'
                  ? t().status.rateLimited
                  : t().status.routingDownBody
            }
            action={{ label: t().status.retry, onClick: () => void store.load() }}
          />
        </Match>
        <Match when={store.phase() === 'routing'}>
          <Skeleton lines={4} />
        </Match>
        <Match when={!store.from() || !store.to()}>
          <EmptyState icon="route" title={t().empty.startTitle} body={t().empty.startBody} />
        </Match>
        <Match when={store.views().length}>
          <Show when={store.warningsStatus() !== 'idle'}>
            <AlertsStrip
              warnings={stripWarnings()}
              partial={store.warningsStatus() === 'partial'}
              unavailable={store.warningsStatus() === 'down' || store.warningsStatus() === 'off'}
              loading={store.warningsStatus() === 'loading'}
              distant={store.departureMs() - store.nowMs() > LOW_CONFIDENCE_AFTER_MS}
            />
          </Show>
          <RouteCompare
            routes={compare()}
            selected={store.selected() ?? undefined}
            onSelect={store.setSelected}
            loading={store.weatherPending()}
          />

          <Show when={worstPoint()}>
            {(p) => (
              <section
                class={`${s.readout} plate`}
                aria-label={t().route.worstPoint(
                  store.selected() ?? '',
                  localWhen(p().sample.etaMs, store.departureMs(), t().locale),
                )}
              >
                <div>
                  <span class="label">{t().route.worstShort(store.selected() ?? '')}</span>
                  <Show when={causeOf(p(), t())}>
                    {(c) => (
                      <p class={s.cause}>
                        <RiskChip level={p().risk.level} short />
                        <span>
                          <Icon name={c().factor} size={16} />
                          {c().label}
                        </span>
                      </p>
                    )}
                  </Show>
                  <p class={s.big}>{explainFactor(p(), t())}</p>
                  <p class={s.where}>
                    {t().explain.at(
                      localWhen(p().sample.etaMs, store.departureMs(), t().locale),
                      Math.round(p().sample.kmFromStart),
                    )}
                  </p>
                </div>
                <Show when={p().risk.values.windFromDeg !== undefined && p().risk.values.windFromDeg !== null}>
                  <RoadWind
                    headingDeg={p().sample.headingDeg}
                    windFromDeg={p().risk.values.windFromDeg ?? Number.NaN}
                    gustKmH={p().risk.values.gustsKmH ?? Number.NaN}
                    level={p().risk.factors.crosswind}
                    size={104}
                  />
                </Show>
              </section>
            )}
          </Show>

          <Show when={!store.weatherPending() && store.selectedEval()}>
            {(e) => (
              <RiskProfile
                segments={e().ev.risk.segments}
                totalKm={e().view.route.distanceM / 1000}
                routeId={e().view.letter}
                variant="full"
              />
            )}
          </Show>
        </Match>
      </Switch>

      <Legend open={desktop()} />
      <footer class={s.footer}>
        <p>{t().attribution}</p>
        <p>
          <a href="./dev/gallery/">{t().app.gallery}</a>
        </p>
      </footer>
    </div>
  );

  return (
    <main class={s.app}>
      <h1 class="visually-hidden">Routecast</h1>
      <div class={s.mapArea} ref={mapEl}>
        <Show when={showMap()} fallback={<MapPlaceholder onActivate={() => setMapWanted(true)} />}>
          <RouteMap
            routes={mapRoutes()}
            selected={store.selected()}
            onSelect={store.setSelected}
            worst={worstPoint()?.sample.at ?? null}
            dark={effectiveTheme() === 'dark'}
            padding={() =>
              desktop() ? { top: 48, right: 48, bottom: 48, left: 468 } : { top: 40, right: 32, bottom: 320, left: 32 }
            }
            label={t().app.tagline}
          />
        </Show>
      </div>
      <Show
        when={desktop()}
        fallback={
          <BottomSheet snap={snap()} onSnap={setSnap} inertTarget={() => mapEl}>
            {panel()}
          </BottomSheet>
        }
      >
        <aside class={s.panel} aria-label={t().compare.caption}>
          {panel()}
        </aside>
      </Show>
      <Toaster />
    </main>
  );
}

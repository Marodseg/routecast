import { lightColors } from '@routecast/shared/design';
import { createMemo, createSignal, For, type JSX } from 'solid-js';
import { t } from '../i18n';
import { localWhen } from '../lib/format';
import { AlertsStrip } from '../ui/AlertsStrip/AlertsStrip';
import { BottomSheet, type Snap } from '../ui/BottomSheet/BottomSheet';
import { CommandSearch } from '../ui/CommandSearch/CommandSearch';
import { DeparturePicker } from '../ui/DeparturePicker/DeparturePicker';
import { EmptyState, Skeleton, Toaster, toast } from '../ui/Feedback/Feedback';
import { Icon, type IconName } from '../ui/Icon/Icon';
import { Legend } from '../ui/Legend/Legend';
import { RiskChip } from '../ui/RiskChip/RiskChip';
import { RiskProfile } from '../ui/RiskProfile/RiskProfile';
import { RoadWind } from '../ui/RoadWind/RoadWind';
import { RouteCompare } from '../ui/RouteCompare/RouteCompare';
import { RouteRibbon } from '../ui/RouteRibbon/RouteRibbon';
import { LangToggle, ThemeToggle } from '../ui/Toggles/Toggles';
import * as fx from './fixtures';
import s from './Gallery.module.css';

function Section(props: { id: string; title: string; note?: string; children: JSX.Element }) {
  return (
    <section class={s.section} id={props.id} aria-labelledby={`${props.id}-h`}>
      <header class={s.sectionHead}>
        <h2 id={`${props.id}-h`}>{props.title}</h2>
        {props.note && <p class={s.note}>{props.note}</p>}
      </header>
      {props.children}
    </section>
  );
}

const SECTIONS = [
  ['tokens', 'Tokens'],
  ['picker', 'DeparturePicker'],
  ['roadwind', 'RoadWind'],
  ['compare', 'RouteCompare'],
  ['profile', 'RiskProfile'],
  ['ribbon', 'RouteRibbon'],
  ['search', 'CommandSearch'],
  ['sheet', 'BottomSheet'],
  ['alerts', 'AlertsStrip'],
  ['risk', 'RiskChip · Legend'],
  ['feedback', 'Estados y avisos'],
  ['icons', 'Iconos'],
] as const;

const ICONS: IconName[] = [
  'rain',
  'crosswind',
  'gust',
  'snow',
  'ice',
  'visibility',
  'storm',
  'l0',
  'l1',
  'l2',
  'l3',
  'unknown',
  'search',
  'swap',
  'clock',
  'pin',
  'route',
  'warning',
  'offline',
  'sun',
  'moon',
];

export function Gallery() {
  const [dep, setDep] = createSignal(17 * 60);
  const [sel, setSel] = createSignal('A');
  const [snap, setSnap] = createSignal<Snap>('half');
  const [cursor, setCursor] = createSignal<number | null>(null);
  let phoneMap: HTMLDivElement | undefined;

  const selRoute = createMemo(() => fx.routes.find((r) => r.id === sel()) ?? fx.routes[0]);
  const compare = createMemo(() => fx.compareRoutes(dep()));
  const selLevel = () => (selRoute() ? fx.worstAt(selRoute() as fx.FixtureRoute, dep()) : 0);
  const valueText = (v: number) =>
    t().picker.valueText(
      localWhen(fx.EPOCH + v * 60_000, fx.EPOCH, t().locale),
      sel(),
      t().risk.levels[selRoute() ? fx.worstAt(selRoute() as fx.FixtureRoute, v) : 0] ?? '',
    );
  const pickDay = (startMs: number) => {
    const cur = new Date(fx.EPOCH + dep() * 60_000);
    const next = new Date(startMs);
    next.setHours(cur.getHours(), cur.getMinutes(), 0, 0);
    const minutes = Math.round((next.getTime() - fx.EPOCH) / 60_000);
    setDep(Math.min(fx.DAY_MAX, Math.max(fx.MIN, minutes)));
  };

  const swatches = Object.keys(lightColors).filter((k) => !k.startsWith('risk')) as (keyof typeof lightColors)[];
  const kebab = (x: string) => x.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();

  return (
    <div class={s.page}>
      <header class={s.top}>
        <div class={s.brand}>
          <i class={s.mark} aria-hidden="true" />
          <span>Routecast</span>
          <span class={s.crumb}>/ {t().app.gallery}</span>
        </div>
        <div class={s.tools}>
          <LangToggle />
          <ThemeToggle />
        </div>
      </header>

      <nav class={s.nav} aria-label={t().app.gallery}>
        <ol>
          <For each={SECTIONS}>
            {([id, label]) => (
              <li>
                <a href={`#${id}`}>{label}</a>
              </li>
            )}
          </For>
        </ol>
      </nav>

      <main class={s.main}>
        <h1 class={s.h1}>{t().app.gallery}</h1>
        <p class={s.lede}>
          Componentes de Routecast en sus estados, con datos ficticios (Málaga → Granada). Mueve el dial: el comparador,
          los perfiles y la cinta se recalculan sin red.
        </p>

        <Section
          id="tokens"
          title="Tokens"
          note="Fuente única en packages/shared/src/design/tokens.ts. Contraste AA y daltonismo verificados en tests."
        >
          <div class={s.swatches}>
            <For each={swatches}>
              {(k) => (
                <figure class={s.swatch}>
                  <span style={{ background: `var(--${kebab(k)})` }} />
                  <figcaption class="mono">--{kebab(k)}</figcaption>
                </figure>
              )}
            </For>
          </div>
          <div class={s.riskScale}>
            <For each={[0, 1, 2, 3] as const}>
              {(l) => (
                <div class={s.riskStep}>
                  <span class={`risk-fill-${l}`} />
                  <RiskChip level={l} />
                </div>
              )}
            </For>
          </div>
          <div class={s.typeScale}>
            <span style={{ 'font-size': 'var(--text-4xl)', 'font-family': 'var(--font-display)', 'font-weight': 600 }}>
              Málaga
            </span>
            <span
              style={{ 'font-size': 'var(--text-2xl)', 'font-family': 'var(--font-display)', 'font-style': 'italic' }}
            >
              Alhama de Granada
            </span>
            <span class="mono" style={{ 'font-size': 'var(--text-3xl)', 'font-weight': 600 }}>
              17:24 · 62 km/h
            </span>
            <span>Racha cruzada de 62 km/h a las 17:10 cerca de Antequera.</span>
          </div>
        </Section>

        <Section
          id="picker"
          title="DeparturePicker"
          note="Elemento firma. La fila elige el día; el dial, la hora. Arrastra (con inercia), rueda, ← → (10 min), Re Pág / Av Pág (1 h), Inicio = ahora."
        >
          <div class={s.pickerGrid}>
            <DeparturePicker
              value={dep()}
              onChange={setDep}
              min={fx.MIN}
              max={fx.DAY_MAX}
              now={fx.NOW}
              epochMs={fx.EPOCH}
              days={fx.days}
              onDay={pickDay}
              bands={fx.bands}
              selected={sel()}
              valueText={valueText}
            />
            <div class={s.narrow}>
              <DeparturePicker
                value={dep()}
                onChange={setDep}
                min={fx.MIN}
                max={fx.DAY_MAX}
                now={fx.NOW}
                epochMs={fx.EPOCH}
                days={fx.days}
                onDay={pickDay}
                bands={fx.bands}
                selected={sel()}
                valueText={valueText}
              />
              <DeparturePicker
                value={fx.NOW}
                onChange={() => {}}
                min={fx.MIN}
                max={fx.MAX}
                now={fx.NOW}
                epochMs={fx.EPOCH}
                days={fx.days}
                disabled
              />
            </div>
          </div>
        </Section>

        <Section
          id="roadwind"
          title="RoadWind"
          note="Elemento firma. La carretera, el viento y —resaltada— la componente cruzada."
        >
          <div class={s.row}>
            <RoadWind
              headingDeg={selRoute()?.wind.heading ?? 0}
              windFromDeg={selRoute()?.wind.from ?? 0}
              gustKmH={fx.gustAt(selLevel())}
              level={selLevel()}
              readout
            />
            <RoadWind headingDeg={90} windFromDeg={90} gustKmH={50} level={0} readout />
            <RoadWind headingDeg={0} windFromDeg={270} gustKmH={70} level={2} readout />
            <RoadWind headingDeg={359} windFromDeg={1} gustKmH={40} level={0} readout />
            <RoadWind headingDeg={200} windFromDeg={0} gustKmH={0} readout />
          </div>
        </Section>

        <Section
          id="compare"
          title="RouteCompare"
          note="Ordenado por peor nivel, km en riesgo alto y duración (SPEC §6.4). Tres cifras, sin nota opaca."
        >
          <div class={s.twoCol}>
            <RouteCompare routes={compare()} selected={sel()} onSelect={setSel} />
            <div class="plate" style={{ padding: 'var(--space-4)', 'background-color': 'var(--surface)' }}>
              <p class="label" style={{ 'margin-bottom': 'var(--space-3)' }}>
                Estado de carga (Skeleton)
              </p>
              <Skeleton lines={4} />
            </div>
          </div>
        </Section>

        <Section
          id="profile"
          title="RiskProfile"
          note="Relieve de riesgo a lo largo del km. Cursor con ratón o teclado (← →), sincronizable con el mapa."
        >
          <RiskProfile
            segments={fx.profile(selRoute() as fx.FixtureRoute, dep())}
            totalKm={selRoute()?.km ?? 0}
            routeId={sel()}
            variant="full"
            cursorKm={cursor()}
            onCursor={setCursor}
          />
        </Section>

        <Section
          id="ribbon"
          title="RouteRibbon"
          note="La ruta como cinta cartográfica: borde de tinta, riesgo con patrón, marcas de hora."
        >
          <div class={`${s.ribbonFrame} plate`}>
            <RouteRibbon
              path={selRoute()?.path ?? []}
              levels={fx.segmentLevels(selRoute() as fx.FixtureRoute, dep())}
              ticks={fx.ribbonTicks(selRoute() as fx.FixtureRoute, dep())}
              places={fx.places}
              alternatives={fx.routes.filter((r) => r.id !== sel()).map((r) => r.path)}
              label={`Ruta ${sel()} de Málaga a Granada`}
            />
          </div>
        </Section>

        <Section
          id="search"
          title="CommandSearch"
          note="Combobox ARIA 1.2. Debounce ≥ 300 ms y cancelación de peticiones obsoletas. Prueba «ala» o «gra»."
        >
          <div class={s.searchGrid}>
            <CommandSearch label={t().search.from} search={fx.fakeSearch()} recent={fx.recent} onSelect={() => {}} />
            <CommandSearch label={`${t().search.to} (error)`} search={fx.fakeSearch('error')} onSelect={() => {}} />
            <CommandSearch
              label={`${t().search.to} (sin resultados)`}
              search={fx.fakeSearch('empty')}
              onSelect={() => {}}
            />
          </div>
        </Section>

        <Section
          id="sheet"
          title="BottomSheet"
          note="Móvil: tres anclajes con gesto e inercia; con la hoja completa, el mapa queda inert."
        >
          <div class={s.phone}>
            <div class={s.phoneMap} ref={phoneMap}>
              <RouteRibbon
                path={selRoute()?.path ?? []}
                levels={fx.segmentLevels(selRoute() as fx.FixtureRoute, dep())}
                places={fx.places.filter((p) => p.major)}
                label="Mapa"
                height={520}
              />
            </div>
            <BottomSheet snap={snap()} onSnap={setSnap} inertTarget={() => phoneMap}>
              <RouteCompare routes={compare()} selected={sel()} onSelect={setSel} />
            </BottomSheet>
          </div>
        </Section>

        <Section
          id="alerts"
          title="AlertsStrip"
          note="Avisos AEMET / Meteoalarm que cruzan la ruta en su ventana temporal."
        >
          <div class={s.stack}>
            <AlertsStrip
              warnings={[
                {
                  id: '1',
                  level: 'orange',
                  phenomenon: 'Viento',
                  area: 'Vega de Granada y Antequera',
                  from: '15:00',
                  to: '21:00',
                  source: 'AEMET',
                },
                {
                  id: '2',
                  level: 'yellow',
                  phenomenon: 'Lluvias',
                  area: 'Costa granadina',
                  from: '18:00',
                  to: '23:59',
                  source: 'Meteoalarm',
                },
              ]}
            />
            <AlertsStrip warnings={[]} partial />
            <AlertsStrip warnings={[]} distant />
          </div>
        </Section>

        <Section id="risk" title="RiskChip · Legend" note="Color + patrón + forma + texto. Nunca solo color.">
          <div class={s.row}>
            <For each={[0, 1, 2, 3, 'unknown'] as const}>{(l) => <RiskChip level={l} />}</For>
          </div>
          <div class={s.row}>
            <For each={[0, 1, 2, 3, 'unknown'] as const}>{(l) => <RiskChip level={l} compact />}</For>
          </div>
          <Legend open />
        </Section>

        <Section
          id="feedback"
          title="Estados y avisos"
          note="Vacío, sin ruta, fuera de horizonte, sin conexión; avisos breves."
        >
          <div class={s.emptyGrid}>
            <EmptyState icon="route" title={t().empty.startTitle} body={t().empty.startBody} />
            <EmptyState
              icon="warning"
              tone="warning"
              title={t().empty.noRouteTitle}
              body={t().empty.noRouteBody}
              action={{ label: t().empty.retry, onClick: () => {} }}
            />
            <EmptyState icon="clock" title={t().empty.horizonTitle} body={t().empty.horizonBody} />
            <EmptyState icon="offline" title={t().empty.offlineTitle} body={t().empty.offlineBody} />
          </div>
          <div class={s.row}>
            <button type="button" class={s.btn} onClick={() => toast(t().toast.copied)}>
              Toast info
            </button>
            <button type="button" class={s.btn} onClick={() => toast(t().toast.rateLimited, 'warning')}>
              Toast 429
            </button>
            <button type="button" class={s.btn} onClick={() => toast(t().toast.weatherDown, 'error')}>
              Toast error
            </button>
          </div>
        </Section>

        <Section id="icons" title="Iconos" note="Trazo 1,5 sobre rejilla de 20. Los de nivel cambian de forma.">
          <div class={s.icons}>
            <For each={ICONS}>
              {(n) => (
                <figure>
                  <Icon name={n} size={24} />
                  <figcaption class="mono">{n}</figcaption>
                </figure>
              )}
            </For>
          </div>
        </Section>

        <footer class={s.footer}>{t().attribution}</footer>
      </main>
      <Toaster />
    </div>
  );
}

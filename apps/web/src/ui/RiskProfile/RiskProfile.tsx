import type { RiskLevelOrUnknown } from '@routecast/shared';
import { createEffect, createMemo, createSignal, createUniqueId, For, onCleanup, onMount, Show } from 'solid-js';
import { t } from '../../i18n';
import s from './RiskProfile.module.css';

export interface ProfileSegment {
  fromKm: number;
  toKm: number;
  level: RiskLevelOrUnknown;
}

export interface RiskProfileProps {
  segments: ProfileSegment[];
  totalKm: number;
  routeId: string;
  /** 'mini': tira compacta para el comparador. 'full': relieve con eje y cursor. */
  variant?: 'mini' | 'full';
  /** Cursor sincronizado con el mapa (km), controlado desde fuera. */
  cursorKm?: number | null;
  onCursor?: (km: number | null) => void;
}

const H = 64;
/** Espacio mínimo por etiqueta del eje (≈ «2000» en mono pequeño + aire). */
const AXIS_LABEL_PX = 48;
const AXIS_STEPS_KM = [10, 25, 50, 100, 200, 250, 500, 1000, 2000];

/** Une tramos contiguos del mismo nivel: una ruta larga trae cientos y, sin unir, la tira mini desborda. */
export function mergeSegments(segments: readonly ProfileSegment[]): ProfileSegment[] {
  const out: ProfileSegment[] = [];
  for (const sg of segments) {
    const last = out[out.length - 1];
    if (last && last.level === sg.level && sg.fromKm <= last.toKm + 1e-6) last.toKm = Math.max(last.toKm, sg.toKm);
    else out.push({ ...sg });
  }
  return out;
}
const levelHeight = (l: RiskLevelOrUnknown) => (l === 'unknown' ? 0.35 : ([0.12, 0.42, 0.72, 1][l] ?? 0));

/** Perfil de riesgo a lo largo del kilómetro, como un perfil de altitud (DESIGN §4). */
export function RiskProfile(props: RiskProfileProps) {
  const uid = createUniqueId();
  const segments = createMemo(() => mergeSegments(props.segments));
  const levelAtKm = (km: number) => props.segments.find((sg) => km >= sg.fromKm && km <= sg.toKm)?.level ?? 'unknown';
  const levelText = (l: RiskLevelOrUnknown) => (l === 'unknown' ? t().risk.unknown : (t().risk.levels[l] ?? ''));

  // Resumen textual: tramos contiguos en nivel ≥ 2.
  const summary = createMemo(() => {
    const ranges: string[] = [];
    let open: [number, number] | null = null;
    const close = () => {
      if (open) ranges.push(t().profile.range(Math.round(open[0]), Math.round(open[1])));
      open = null;
    };
    for (const sg of props.segments) {
      if (sg.level === 2 || sg.level === 3) open = open ? [open[0], sg.toKm] : [sg.fromKm, sg.toKm];
      else close();
    }
    close();
    return ranges.length ? t().profile.high(ranges.join(', ')) : `${t().compare.noRisk}.`;
  });

  const [localCursor, setLocalCursor] = createSignal<number | null>(null);
  const cursor = () => (props.cursorKm !== undefined ? props.cursorKm : localCursor());
  const setCursor = (km: number | null) => {
    setLocalCursor(km);
    props.onCursor?.(km);
  };

  // Se dibuja en píxeles reales: así los patrones (canal no cromático) no se deforman.
  let track: HTMLDivElement | undefined;
  const [width, setWidth] = createSignal(600);
  onMount(() => {
    if (!track || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      if (e && e.contentRect.width > 0) setWidth(e.contentRect.width);
    });
    ro.observe(track);
    onCleanup(() => ro.disconnect());
  });
  const x = (km: number) => (km / Math.max(1, props.totalKm)) * width();

  const axis = createMemo(() => {
    // El paso «redondo» más corto que cabe en el ancho real; nada pegado a la unidad del final.
    const fit = Math.max(1, Math.floor(width() / AXIS_LABEL_PX));
    const stepKm =
      AXIS_STEPS_KM.find((st) => props.totalKm / st <= fit) ?? AXIS_STEPS_KM[AXIS_STEPS_KM.length - 1] ?? 1000;
    const out: number[] = [];
    for (let k = 0; k <= props.totalKm; k += stepKm) if (x(k) <= width() - AXIS_LABEL_PX) out.push(k);
    return out;
  });

  const cursorText = () => {
    const c = cursor();
    return c === null ? undefined : t().profile.at(Math.round(c), levelText(levelAtKm(c)));
  };

  // Etiqueta del cursor centrada sobre él pero sin salirse del gráfico (el panel la recortaría en los extremos).
  let tip: HTMLOutputElement | undefined;
  const [tipW, setTipW] = createSignal(0);
  createEffect(() => {
    cursorText();
    setTipW(tip?.offsetWidth ?? 0);
  });
  const tipLeft = () => Math.max(0, Math.min(width() - tipW(), x(cursor() ?? 0) - tipW() / 2));

  const fromPointer = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCursor(Math.max(0, Math.min(props.totalKm, ((e.clientX - r.left) / Math.max(1, r.width)) * props.totalKm)));
  };

  return (
    <Show
      when={props.variant === 'full'}
      fallback={
        <span class={s.mini} role="img" aria-label={`${t().profile.label(props.routeId)}. ${summary()}`}>
          <For each={segments()}>
            {(sg) => (
              <i class={`risk-fill-${sg.level}`} style={{ 'flex-grow': Math.max(0.001, sg.toKm - sg.fromKm) }} />
            )}
          </For>
        </span>
      }
    >
      <div class={s.full}>
        <div
          ref={track}
          class={s.track}
          role="slider"
          tabIndex={0}
          aria-label={t().profile.label(props.routeId)}
          aria-describedby={`${uid}-summary`}
          aria-valuemin={0}
          aria-valuemax={Math.round(props.totalKm)}
          // Sin cursor el valor es 0, pero lo que se anuncia es el texto, que no finge una posición.
          aria-valuenow={Math.round(cursor() ?? 0)}
          aria-valuetext={cursorText() ?? t().profile.idle}
          onPointerDown={(e) => {
            if (e.pointerType !== 'mouse') e.currentTarget.setPointerCapture?.(e.pointerId);
            fromPointer(e);
          }}
          onPointerMove={fromPointer}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setCursor(null);
          }}
          onBlur={() => setCursor(null)}
          onKeyDown={(e) => {
            const stepKm = Math.max(1, Math.round(props.totalKm / 50));
            const cur = cursor() ?? 0;
            const map: Record<string, number> = {
              ArrowRight: stepKm,
              ArrowUp: stepKm,
              ArrowLeft: -stepKm,
              ArrowDown: -stepKm,
              PageUp: stepKm * 5,
              PageDown: -stepKm * 5,
            };
            if (e.key in map) setCursor(Math.max(0, Math.min(props.totalKm, cur + (map[e.key] ?? 0))));
            else if (e.key === 'Home') setCursor(0);
            else if (e.key === 'End') setCursor(props.totalKm);
            else if (e.key === 'Escape') setCursor(null);
            else return;
            e.preventDefault();
          }}
        >
          <svg class={s.svg} viewBox={`0 0 ${width()} ${H}`} aria-hidden="true">
            <defs>
              <pattern id={`${uid}-p1`} width="5" height="5" patternUnits="userSpaceOnUse">
                <circle cx="2.5" cy="2.5" r="0.9" class={s.pat} />
              </pattern>
              <pattern
                id={`${uid}-p2`}
                width="5"
                height="5"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="1.6" height="5" class={s.pat} />
              </pattern>
              <pattern
                id={`${uid}-p3`}
                width="5"
                height="5"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="1.6" height="5" class={s.pat} />
                <rect width="5" height="1.6" class={s.pat} />
              </pattern>
            </defs>
            <For each={segments()}>
              {(sg) => {
                const h = () => levelHeight(sg.level) * (H - 4);
                const w = () => Math.max(0, x(sg.toKm) - x(sg.fromKm));
                return (
                  <>
                    <rect class={s.bar} data-level={sg.level} x={x(sg.fromKm)} width={w()} y={H - h()} height={h()} />
                    <Show when={sg.level === 1 || sg.level === 2 || sg.level === 3}>
                      <rect fill={`url(#${uid}-p${sg.level})`} x={x(sg.fromKm)} width={w()} y={H - h()} height={h()} />
                    </Show>
                    <line class={s.crest} x1={x(sg.fromKm)} x2={x(sg.toKm)} y1={H - h()} y2={H - h()} />
                  </>
                );
              }}
            </For>
            <line class={s.base} x1="0" x2={width()} y1={H - 0.5} y2={H - 0.5} />
            <Show when={cursor() !== null}>
              <line class={s.cursor} x1={x(cursor() ?? 0)} x2={x(cursor() ?? 0)} y1="0" y2={H} />
            </Show>
          </svg>
        </div>
        <p id={`${uid}-summary`} class="visually-hidden">
          {summary()}
        </p>
        <div class={s.axis} aria-hidden="true">
          <For each={axis()}>
            {(k) => (
              <span style={{ left: `${(k / Math.max(1, props.totalKm)) * 100}%` }} class="mono">
                {k}
              </span>
            )}
          </For>
          <span class={`${s.unit} mono`} style={{ left: 'auto' }}>
            {t().units.km}
          </span>
        </div>
        <Show when={cursorText()}>
          {(text) => (
            <output ref={tip} class={s.tip} style={{ left: `${tipLeft()}px` }}>
              {text()}
            </output>
          )}
        </Show>
      </div>
    </Show>
  );
}

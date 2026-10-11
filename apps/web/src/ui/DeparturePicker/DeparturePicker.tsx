import type { RiskLevelOrUnknown } from '@routecast/shared';
import { createEffect, createMemo, createSignal, createUniqueId, For, onCleanup, onMount, Show } from 'solid-js';
import { t } from '../../i18n';
import { ahead, hhmm, sameLocalDay, shortDay } from '../../lib/format';
import { prefersReducedMotion, tick } from '../../lib/motion';
import { Odometer } from '../Odometer/Odometer';
import s from './DeparturePicker.module.css';

export interface DialBand {
  id: string;
  /** Peor nivel por hora; levels[i] cubre [hora de `min` + i h, +1 h). */
  levels: RiskLevelOrUnknown[];
}

export interface PickerDay {
  /** Medianoche local de ese día. */
  startMs: number;
  /** El día cruza las 48 h: la previsión de esa jornada es orientativa. */
  orientative: boolean;
}

export interface DeparturePickerProps {
  /** Minutos desde la medianoche local del día de salida (puede pasar de 1440). */
  value: number;
  onChange: (minutes: number) => void;
  min: number;
  max: number;
  /** Medianoche local de hoy, origen de `value`. Hace falta si hay `days`. */
  epochMs?: number;
  /** Hoy y los días siguientes dentro del horizonte. El dial sigue eligiendo la hora. */
  days?: PickerDay[];
  /** Elige ese día conservando la hora (lo aplica quien tiene el reloj). */
  onDay?: (startMs: number) => void;
  /** Minuto actual: marca «ahora» y destino de la tecla Inicio. */
  now: number;
  step?: number;
  bands?: DialBand[];
  selected?: string;
  /** Texto accesible del valor (incluye el riesgo de la ruta seleccionada). */
  valueText?: (minutes: number) => string;
  disabled?: boolean;
}

const DEG_PER_MIN = 0.5; // 30° por hora
const FACE_H = 168;
const BAND_W = 7;
const BAND_GAP = 9;

const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => [
  cx + r * Math.sin((deg * Math.PI) / 180),
  cy - r * Math.cos((deg * Math.PI) / 180),
];

const arcPath = (cx: number, cy: number, r: number, a0: number, a1: number): string => {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r},${r} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
};

/**
 * Selector de hora de salida en forma de dial (DESIGN §6.1, ADR-0006). La aguja es fija y el dial gira.
 * Detrás de las marcas, una banda por ruta muestra el peor riesgo de salir a cada hora.
 */
export function DeparturePicker(props: DeparturePickerProps) {
  const uid = createUniqueId();
  const step = () => props.step ?? 10;
  const clamp = (v: number) => Math.min(props.max, Math.max(props.min, v));
  const snap = (v: number) => clamp(Math.round(v / step()) * step());

  let face!: HTMLDivElement;
  const [width, setWidth] = createSignal(360);
  /** Valor continuo mientras se arrastra o hay inercia; null = seguir a props.value. */
  const [raw, setRaw] = createSignal<number | null>(null);
  const [dragging, setDragging] = createSignal(false);

  onMount(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    ro.observe(face);
    onCleanup(() => ro.disconnect());
  });

  const shown = () => raw() ?? props.value;

  const geo = createMemo(() => {
    const w = width();
    const R = Math.max(150, w * 0.62);
    return { w, R, cx: w / 2, cy: 40 + R };
  });

  /** Ventana visible: el dial (30°/h) da varias vueltas en 48 h; fuera de ±5 h no se dibuja nada. */
  const VISIBLE_MIN = 5 * 60;
  const windowStart = createMemo(() => Math.floor((shown() - VISIBLE_MIN) / 60) * 60);
  const windowEnd = createMemo(() => Math.ceil((shown() + VISIBLE_MIN) / 60) * 60);

  const ticks = createMemo(() => {
    const { cx, cy, R } = geo();
    const out: {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      kind: 'major' | 'half' | 'minor';
      label?: [number, number, number, string];
    }[] = [];
    for (
      let m = Math.max(Math.ceil(props.min / 10) * 10, windowStart());
      m <= Math.min(props.max, windowEnd());
      m += 10
    ) {
      const a = (m - props.min) * DEG_PER_MIN;
      const kind = m % 60 === 0 ? 'major' : m % 30 === 0 ? 'half' : 'minor';
      const [x1, y1] = polar(cx, cy, R, a);
      const [x2, y2] = polar(cx, cy, R + (kind === 'major' ? 14 : kind === 'half' ? 9 : 5), a);
      const tickOut: (typeof out)[number] = { x1, y1, x2, y2, kind };
      if (kind === 'major') {
        const [lx, ly] = polar(cx, cy, R + 24, a);
        tickOut.label = [lx, ly, a, hhmm(m)];
      }
      out.push(tickOut);
    }
    return out;
  });

  const bandArcs = createMemo(() => {
    const { cx, cy, R } = geo();
    const startHour = Math.floor(props.min / 60) * 60;
    return (props.bands ?? []).map((band, i) => {
      const r = R - 14 - i * BAND_GAP;
      const segs = band.levels.flatMap((level, h) => {
        const from = Math.max(startHour + h * 60, props.min, windowStart());
        const to = Math.min(startHour + (h + 1) * 60, props.max + step(), windowEnd());
        if (to <= from) return [];
        return [
          {
            d: arcPath(cx, cy, r, (from - props.min) * DEG_PER_MIN + 0.4, (to - props.min) * DEG_PER_MIN - 0.4),
            level,
          },
        ];
      });
      const [kx, ky] = polar(cx, cy, r, -Math.min(64, (geo().w / 2 / R) * 57));
      return { id: band.id, segs, key: [kx + 6, ky + 3] as const };
    });
  });

  const rotation = () => -(shown() - props.min) * DEG_PER_MIN;
  const nowMark = createMemo(() => {
    const { cx, cy, R } = geo();
    return polar(cx, cy, R + 4, (props.now - props.min) * DEG_PER_MIN);
  });
  const pxPerMin = () => (geo().R * DEG_PER_MIN * Math.PI) / 180;

  const commit = (v: number) => {
    const n = snap(v);
    if (n !== props.value) {
      tick();
      props.onChange(n);
    }
  };

  // --- Arrastre con inercia ---
  let start = { x: 0, value: 0 };
  let last = { x: 0, t: 0, v: 0 };
  let raf = 0;
  onCleanup(() => cancelAnimationFrame(raf));

  const onPointerDown = (e: PointerEvent) => {
    if (props.disabled || e.button !== 0) return;
    cancelAnimationFrame(raf);
    face.setPointerCapture?.(e.pointerId);
    start = { x: e.clientX, value: shown() };
    last = { x: e.clientX, t: e.timeStamp, v: 0 };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging()) return;
    const v = clamp(start.value - (e.clientX - start.x) / pxPerMin());
    const dt = Math.max(1, e.timeStamp - last.t);
    last = { x: e.clientX, t: e.timeStamp, v: 0.8 * ((e.clientX - last.x) / dt) + 0.2 * last.v };
    setRaw(v);
    commit(v);
  };
  const settle = () => {
    setRaw(null);
    setDragging(false);
  };
  const onPointerUp = () => {
    if (!dragging()) return;
    let velocity = -last.v / pxPerMin(); // min/ms
    if (prefersReducedMotion() || Math.abs(velocity) < 0.02) {
      commit(shown());
      settle();
      return;
    }
    let value = shown();
    let prev = performance.now();
    const DECEL = 0.00012; // min/ms²
    const frame = (now: number) => {
      const dt = now - prev;
      prev = now;
      value = clamp(value + velocity * dt);
      velocity -= Math.sign(velocity) * DECEL * dt;
      setRaw(value);
      commit(value);
      if (Math.abs(velocity) > 0.004 && value > props.min && value < props.max) raf = requestAnimationFrame(frame);
      else settle();
    };
    setDragging(false);
    raf = requestAnimationFrame(frame);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (props.disabled) return;
    const deltas: Record<string, number> = {
      ArrowRight: step(),
      ArrowUp: step(),
      ArrowLeft: -step(),
      ArrowDown: -step(),
      PageUp: 60,
      PageDown: -60,
    };
    let next: number | null = null;
    if (e.key in deltas) next = props.value + (deltas[e.key] ?? 0);
    else if (e.key === 'Home') next = props.now;
    else if (e.key === 'End') next = props.max;
    if (next === null) return;
    e.preventDefault();
    cancelAnimationFrame(raf);
    setRaw(null);
    commit(next);
  };

  const onWheel = (e: WheelEvent) => {
    if (props.disabled) return;
    // Solo desplazamiento horizontal (trackpad o Mayús+rueda): el vertical sigue desplazando la página.
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    if (d === 0) return;
    e.preventDefault();
    cancelAnimationFrame(raf);
    setRaw(null);
    commit(props.value + Math.sign(d) * step());
  };

  const delta = () => props.value - props.now;

  const dayButtons: HTMLLabelElement[] = [];
  const activeDay = createMemo(() => {
    const days = props.days;
    const epoch = props.epochMs;
    if (!days?.length || epoch === undefined) return undefined;
    const v = snap(shown());
    let found = days[0];
    for (const day of days) {
      if (v >= Math.round((day.startMs - epoch) / 60_000)) found = day;
      else break;
    }
    return found;
  });
  const dayCaption = () => {
    const day = activeDay();
    const epoch = props.epochMs;
    if (!day || epoch === undefined || sameLocalDay(day.startMs, epoch)) return null;
    return shortDay(day.startMs, t().locale);
  };
  const reveal = (el: HTMLLabelElement) => {
    const row = el.parentElement;
    if (!row) return;
    const left = el.offsetLeft - (row.clientWidth - el.clientWidth) / 2;
    row.scrollTo?.({ left: Math.max(0, left), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
  createEffect(() => {
    const days = props.days;
    const day = activeDay();
    if (!days || !day) return;
    const el = dayButtons[days.indexOf(day)];
    if (el) reveal(el);
  });

  return (
    <div class={`${s.dial} plate`} classList={{ [s.disabled ?? '']: !!props.disabled }}>
      <div class={s.top}>
        <span class="label" id={`${uid}-label`}>
          {t().picker.label}
        </span>
        <button
          type="button"
          class={s.now}
          onClick={() => commit(props.now)}
          disabled={props.disabled || props.value === props.now}
        >
          {t().picker.now}
        </button>
      </div>
      <Show when={props.days?.length}>
        <div class={s.days} role="radiogroup" aria-label={t().picker.days}>
          <For each={props.days}>
            {(day, i) => {
              const label = () => {
                const epoch = props.epochMs;
                if (epoch !== undefined && sameLocalDay(day.startMs, epoch)) return t().picker.today;
                if (epoch !== undefined) {
                  const next = new Date(epoch);
                  next.setDate(next.getDate() + 1);
                  if (sameLocalDay(day.startMs, next.getTime())) return t().picker.tomorrow;
                }
                return shortDay(day.startMs, t().locale);
              };
              const checked = () => activeDay()?.startMs === day.startMs;
              return (
                <label
                  ref={(el) => {
                    dayButtons[i()] = el;
                  }}
                  class={s.day}
                  classList={{ [s.orientative ?? '']: day.orientative }}
                >
                  <input
                    type="radio"
                    name={`${uid}-day`}
                    checked={checked()}
                    disabled={props.disabled}
                    onChange={() => props.onDay?.(day.startMs)}
                    onKeyDown={(e) => {
                      const days = props.days ?? [];
                      let dir = 0;
                      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') dir = 1;
                      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') dir = -1;
                      if (!dir || props.disabled) return;
                      const nextIndex = i() + dir;
                      if (nextIndex < 0 || nextIndex >= days.length) return;
                      e.preventDefault();
                      const next = days[nextIndex];
                      if (!next) return;
                      props.onDay?.(next.startMs);
                      queueMicrotask(() => dayButtons[days.indexOf(next)]?.querySelector('input')?.focus());
                    }}
                  />
                  <Show when={day.orientative}>
                    <span class={s.approx} aria-hidden="true">
                      ≈
                    </span>
                  </Show>
                  {label()}
                  <Show when={day.orientative}>
                    <span class="visually-hidden">, {t().picker.orientative}</span>
                  </Show>
                </label>
              );
            }}
          </For>
        </div>
        <p class={s.dayNote} aria-live="polite">
          <Show when={activeDay()?.orientative}>≈ {t().picker.orientativeNote}</Show>
        </p>
      </Show>
      {/* biome-ignore lint/a11y/useFocusableInteractive: tabindex dinámico (0, o -1 si está deshabilitado) */}
      <div
        ref={face}
        class={s.face}
        classList={{ [s.dragging ?? '']: dragging() }}
        style={{ height: `${FACE_H}px` }}
        tabindex={props.disabled ? -1 : 0}
        role="slider"
        aria-labelledby={`${uid}-label`}
        aria-describedby={`${uid}-hint`}
        aria-valuemin={props.min}
        aria-valuemax={props.max}
        aria-valuenow={props.value}
        aria-valuetext={props.valueText?.(props.value) ?? hhmm(props.value)}
        aria-disabled={props.disabled ? 'true' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onWheel={onWheel}
      >
        <svg class={s.svg} viewBox={`0 0 ${geo().w} ${FACE_H}`} aria-hidden="true">
          <defs>
            <pattern id={`${uid}-p1`} width="4" height="4" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="0.8" class={s.pat} />
            </pattern>
            <pattern id={`${uid}-p2`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="1.4" height="4" class={s.pat} />
            </pattern>
            <pattern id={`${uid}-p3`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="1.4" height="4" class={s.pat} />
              <rect width="4" height="1.4" class={s.pat} />
            </pattern>
          </defs>
          <g
            class={s.rotor}
            classList={{ [s.free ?? '']: raw() !== null }}
            style={{ transform: `rotate(${rotation()}deg)`, 'transform-origin': `${geo().cx}px ${geo().cy}px` }}
          >
            <For each={bandArcs()}>
              {(band) => (
                <g class={s.band} classList={{ [s.bandSelected ?? '']: band.id === props.selected }}>
                  <For each={band.segs}>
                    {(seg) => (
                      <>
                        <path
                          class={s.bandSeg}
                          data-level={seg.level}
                          d={seg.d}
                          style={{ 'stroke-width': `${BAND_W}px` }}
                        />
                        <Show when={seg.level === 1 || seg.level === 2 || seg.level === 3}>
                          <path
                            class={s.bandPattern}
                            d={seg.d}
                            stroke={`url(#${uid}-p${seg.level})`}
                            style={{ 'stroke-width': `${BAND_W}px` }}
                          />
                        </Show>
                      </>
                    )}
                  </For>
                </g>
              )}
            </For>
            <For each={ticks()}>
              {(tk) => (
                <>
                  <line class={s[tk.kind]} x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2} />
                  <Show when={tk.label}>
                    {(l) => (
                      <text
                        class={s.hour}
                        x={l()[0]}
                        y={l()[1] + 4}
                        text-anchor="middle"
                        transform={`rotate(${l()[2]} ${l()[0]} ${l()[1]})`}
                      >
                        {l()[3]}
                      </text>
                    )}
                  </Show>
                </>
              )}
            </For>
            <circle class={s.nowDot} cx={nowMark()[0]} cy={nowMark()[1]} r="3" />
          </g>
          <For each={bandArcs()}>
            {(band) => (
              <text
                class={s.key}
                classList={{ [s.keySelected ?? '']: band.id === props.selected }}
                x={band.key[0]}
                y={band.key[1]}
              >
                {band.id}
              </text>
            )}
          </For>
          <line
            class={s.needle}
            x1={geo().cx}
            y1={geo().cy - geo().R + 34}
            x2={geo().cx}
            y2={geo().cy - geo().R - 16}
          />
          <path
            class={s.needleHead}
            d={`M${geo().cx - 6},${geo().cy - geo().R - 22}L${geo().cx + 6},${geo().cy - geo().R - 22}L${geo().cx},${geo().cy - geo().R - 13}Z`}
          />
        </svg>
        <div class={s.fade} aria-hidden="true" />
        <div class={s.readout} aria-hidden="true">
          <div class={s.time}>
            <Odometer value={hhmm(snap(shown()))} />
          </div>
          <div class={s.delta}>
            <Show when={dayCaption()}>{(c) => <span class={s.when}>{c()} · </span>}</Show>
            {delta() <= 0 ? t().picker.nowMark : t().picker.later(ahead(delta()))}
          </div>
        </div>
      </div>
      <p id={`${uid}-hint`} class="visually-hidden">
        {t().picker.hint}
      </p>
    </div>
  );
}

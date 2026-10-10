import { normalizeDeg, relativeWind } from '@routecast/core';
import type { RiskLevelOrUnknown } from '@routecast/shared';
import { createMemo, createUniqueId, For, Show } from 'solid-js';
import { t } from '../../i18n';
import s from './RoadWind.module.css';

export interface RoadWindProps {
  /** Rumbo de la carretera (hacia dónde se circula). */
  headingDeg: number;
  /** Dirección meteorológica: de dónde viene el viento. */
  windFromDeg: number;
  /** Racha (km/h). */
  gustKmH: number;
  /** Nivel de riesgo del viento cruzado, para el color del vector (lo calcula core). */
  level?: RiskLevelOrUnknown;
  size?: number;
  /** Muestra las cifras bajo la brújula. */
  readout?: boolean;
}

const C = 60;
const MAX_LEN = 42;
/** Escala del vector: 100 km/h llena el radio útil. */
const SCALE_KMH = 100;

const polar = (deg: number, r: number): [number, number] => [
  C + r * Math.sin((deg * Math.PI) / 180),
  C - r * Math.cos((deg * Math.PI) / 180),
];

/**
 * Brújula que relaciona rumbo de carretera y viento (DESIGN §6.2). La componente cruzada se dibuja
 * perpendicular a la carretera, hacia el lado al que empuja, con longitud proporcional.
 */
export function RoadWind(props: RoadWindProps) {
  const markerId = `rw-head-${createUniqueId()}`;
  const w = createMemo(() => relativeWind(props.headingDeg, props.windFromDeg, props.gustKmH));
  const heading = () => normalizeDeg(props.headingDeg);
  const len = (kmh: number) => Math.min(MAX_LEN, (kmh / SCALE_KMH) * MAX_LEN);
  // Empuja hacia el lado contrario del que viene: viento desde la derecha → vector hacia la izquierda (-90°).
  const crossEnd = () => polar(heading() + (w().fromSide === 'right' ? -90 : 90), len(w().crossKmH));
  const windTail = () => polar(props.windFromDeg, 14 + len(props.gustKmH) * 0.75);
  const windHead = () => polar(props.windFromDeg + 180, 8);
  const summary = () =>
    props.gustKmH === 0
      ? t().roadwind.calm
      : t().roadwind.summary(
          Math.round(heading()),
          Math.round(normalizeDeg(props.windFromDeg)),
          Math.round(props.gustKmH),
          Math.round(w().crossKmH),
        );

  return (
    <figure class={s.figure} data-level={props.level ?? 'none'}>
      <svg
        class={s.svg}
        viewBox="0 0 120 120"
        width={props.size ?? 120}
        height={props.size ?? 120}
        role="img"
        aria-label={`${t().roadwind.title}. ${summary()}`}
      >
        <circle class={s.ring} cx={C} cy={C} r={54} />
        <For each={Array.from({ length: 24 }, (_, i) => i * 15)}>
          {(d) => {
            const [x1, y1] = polar(d, 54);
            const [x2, y2] = polar(d, d % 90 === 0 ? 47 : 51);
            return <line class={s.tick} x1={x1} y1={y1} x2={x2} y2={y2} />;
          }}
        </For>
        <text class={s.north} x={C} y={14} text-anchor="middle">
          N
        </text>
        <g class={s.road} style={{ transform: `rotate(${heading()}deg)` }}>
          <line class={s.roadBand} x1={C} y1={C + 46} x2={C} y2={C - 46} />
          <line class={s.roadCenter} x1={C} y1={C + 46} x2={C} y2={C - 46} />
          <path class={s.roadArrow} d={`M${C - 5},${C - 30} L${C},${C - 38} L${C + 5},${C - 30}`} />
        </g>
        <Show when={w().crossKmH > 0}>
          <line class={s.cross} x1={C} y1={C} x2={crossEnd()[0]} y2={crossEnd()[1]} />
          <circle class={s.crossEnd} cx={crossEnd()[0]} cy={crossEnd()[1]} r={3.2} />
        </Show>
        <Show when={props.gustKmH > 0}>
          <line
            class={s.wind}
            x1={windTail()[0]}
            y1={windTail()[1]}
            x2={windHead()[0]}
            y2={windHead()[1]}
            marker-end={`url(#${markerId})`}
          />
        </Show>
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0L10,5L0,10z" class={s.windHead} />
          </marker>
        </defs>
      </svg>
      <Show when={props.readout}>
        <figcaption class={s.readout}>
          <span>
            <b class="mono">{Math.round(w().crossKmH)}</b> km/h {t().roadwind.cross}
          </span>
          <span class={s.secondary}>
            <span class="mono">{Math.abs(Math.round(w().headKmH))}</span> km/h{' '}
            {w().headKmH >= 0 ? t().roadwind.head : t().roadwind.tail}
          </span>
        </figcaption>
      </Show>
    </figure>
  );
}

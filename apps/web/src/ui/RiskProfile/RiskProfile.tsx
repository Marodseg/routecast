import type { RiskLevelOrUnknown } from '@routecast/shared';
import { createMemo, createSignal, createUniqueId, For, Show } from 'solid-js';
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
const levelHeight = (l: RiskLevelOrUnknown) => (l === 'unknown' ? 0.35 : ([0.12, 0.42, 0.72, 1][l] ?? 0));

/** Perfil de riesgo a lo largo del kilómetro, como un perfil de altitud (DESIGN §4). */
export function RiskProfile(props: RiskProfileProps) {
  const uid = createUniqueId();
  const levelAtKm = (km: number) => props.segments.find((sg) => km >= sg.fromKm && km <= sg.toKm)?.level ?? 'unknown';
  const levelText = (l: RiskLevelOrUnknown) => (l === 'unknown' ? t().risk.unknown : (t().risk.levels[l] ?? ''));

  // Resumen textual: tramos contiguos en nivel ≥ 2 («km 20–60»).
  const summary = createMemo(() => {
    const high: string[] = [];
    let open: [number, number] | null = null;
    for (const sg of props.segments) {
      const isHigh = sg.level === 2 || sg.level === 3;
      if (isHigh) open = open ? [open[0], sg.toKm] : [sg.fromKm, sg.toKm];
      if (!isHigh && open) {
        high.push(`km ${Math.round(open[0])}–${Math.round(open[1])}`);
        open = null;
      }
    }
    if (open) high.push(`km ${Math.round(open[0])}–${Math.round(open[1])}`);
    return `${t().profile.label(props.routeId)}. ${high.length ? `${t().risk.levels[2]}+: ${high.join(', ')}` : t().compare.noRisk}.`;
  });

  const [localCursor, setLocalCursor] = createSignal<number | null>(null);
  const cursor = () => (props.cursorKm !== undefined ? props.cursorKm : localCursor());
  const setCursor = (km: number | null) => {
    setLocalCursor(km);
    props.onCursor?.(km);
  };
  const x = (km: number) => (km / Math.max(1, props.totalKm)) * 1000;

  const axis = createMemo(() => {
    const stepKm = props.totalKm > 600 ? 100 : props.totalKm > 250 ? 50 : props.totalKm > 80 ? 25 : 10;
    const out: number[] = [];
    for (let k = 0; k <= props.totalKm; k += stepKm) out.push(k);
    return out;
  });

  return (
    <Show
      when={props.variant === 'full'}
      fallback={
        <span class={s.mini} role="img" aria-label={summary()}>
          <For each={props.segments}>
            {(sg) => (
              <i class={`risk-fill-${sg.level}`} style={{ 'flex-grow': Math.max(0.001, sg.toKm - sg.fromKm) }} />
            )}
          </For>
        </span>
      }
    >
      <div class={s.full}>
        <div
          class={s.track}
          role="slider"
          tabIndex={0}
          aria-label={summary()}
          aria-valuemin={0}
          aria-valuemax={Math.round(props.totalKm)}
          aria-valuenow={Math.round(cursor() ?? 0)}
          aria-valuetext={
            cursor() === null
              ? summary()
              : t().profile.at(Math.round(cursor() ?? 0), levelText(levelAtKm(cursor() ?? 0)))
          }
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setCursor(Math.max(0, Math.min(props.totalKm, ((e.clientX - r.left) / r.width) * props.totalKm)));
          }}
          onPointerLeave={() => setCursor(null)}
          onBlur={() => setCursor(null)}
          onKeyDown={(e) => {
            const stepKm = Math.max(1, Math.round(props.totalKm / 50));
            const cur = cursor() ?? 0;
            const map: Record<string, number> = {
              ArrowRight: stepKm,
              ArrowLeft: -stepKm,
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
          <svg class={s.svg} viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden="true">
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
            <For each={props.segments}>
              {(sg) => {
                const h = () => levelHeight(sg.level) * (H - 4);
                return (
                  <>
                    <rect
                      class={s.bar}
                      data-level={sg.level}
                      x={x(sg.fromKm)}
                      width={Math.max(0, x(sg.toKm) - x(sg.fromKm))}
                      y={H - h()}
                      height={h()}
                    />
                    <Show when={sg.level === 1 || sg.level === 2 || sg.level === 3}>
                      <rect
                        fill={`url(#${uid}-p${sg.level})`}
                        x={x(sg.fromKm)}
                        width={Math.max(0, x(sg.toKm) - x(sg.fromKm))}
                        y={H - h()}
                        height={h()}
                      />
                    </Show>
                    <line class={s.crest} x1={x(sg.fromKm)} x2={x(sg.toKm)} y1={H - h()} y2={H - h()} />
                  </>
                );
              }}
            </For>
            <line class={s.base} x1="0" x2="1000" y1={H - 0.5} y2={H - 0.5} />
            <Show when={cursor() !== null}>
              <line class={s.cursor} x1={x(cursor() ?? 0)} x2={x(cursor() ?? 0)} y1="0" y2={H} />
            </Show>
          </svg>
        </div>
        <div class={s.axis} aria-hidden="true">
          <For each={axis()}>
            {(k) => (
              <span style={{ left: `${(k / Math.max(1, props.totalKm)) * 100}%` }} class="mono">
                {k}
              </span>
            )}
          </For>
          <span class={`${s.unit} mono`} style={{ left: 'auto' }}>
            km
          </span>
        </div>
        <Show when={cursor() !== null}>
          <output class={s.tip} style={{ left: `${((cursor() ?? 0) / Math.max(1, props.totalKm)) * 100}%` }}>
            {t().profile.at(Math.round(cursor() ?? 0), levelText(levelAtKm(cursor() ?? 0)))}
          </output>
        </Show>
      </div>
    </Show>
  );
}

import type { LatLng, RiskLevelOrUnknown } from '@routecast/shared';
import { createMemo, createUniqueId, For, Show } from 'solid-js';
import s from './RouteRibbon.module.css';

export interface RibbonPlace {
  name: string;
  at: LatLng;
  major?: boolean;
}

export interface RouteRibbonProps {
  path: LatLng[];
  /** Nivel por tramo: levels[i] colorea path[i] → path[i + 1]. */
  levels: RiskLevelOrUnknown[];
  /** Marcas de hora a lo largo de la ruta: fracción [0, 1] y etiqueta («17:20»). */
  ticks?: { at: number; label: string }[];
  places?: RibbonPlace[];
  /** Rutas alternativas atenuadas. */
  alternatives?: LatLng[][];
  label: string;
  height?: number;
}

const W = 600;

/**
 * La ruta como cinta cartográfica (DESIGN §6.3): borde de tinta, relleno por riesgo con patrón y marcas de hora.
 * Versión SVG estática para galería y miniaturas; el mapa interactivo usa la misma gramática en MapLibre.
 */
export function RouteRibbon(props: RouteRibbonProps) {
  const uid = createUniqueId();
  const H = () => props.height ?? 320;

  const proj = createMemo(() => {
    const all = [props.path, ...(props.alternatives ?? [])].flat().concat((props.places ?? []).map((p) => p.at));
    const k = Math.cos((all.reduce((a, p) => a + p.lat, 0) / Math.max(1, all.length)) * (Math.PI / 180));
    const xs = all.map((p) => p.lng * k);
    const ys = all.map((p) => -p.lat);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = 44;
    const scale = Math.min((W - 2 * pad) / Math.max(1e-6, x1 - x0), (H() - 2 * pad) / Math.max(1e-6, y1 - y0));
    const ox = (W - (x1 - x0) * scale) / 2;
    const oy = (H() - (y1 - y0) * scale) / 2;
    return (p: LatLng): [number, number] => [ox + (p.lng * k - x0) * scale, oy + (-p.lat - y0) * scale];
  });

  const pts = createMemo(() => props.path.map(proj()));
  const d = (ps: [number, number][]) => `M${ps.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}`;

  const along = (f: number) => {
    const ps = pts();
    const lens = ps.slice(1).map((p, i) => Math.hypot(p[0] - (ps[i]?.[0] ?? 0), p[1] - (ps[i]?.[1] ?? 0)));
    let target = f * lens.reduce((a, b) => a + b, 0);
    for (let i = 0; i < lens.length; i++) {
      const L = lens[i] ?? 0;
      const a = ps[i];
      const b = ps[i + 1];
      if (!a || !b) break;
      if (target <= L || i === lens.length - 1) {
        const t = L ? target / L : 0;
        return {
          x: a[0] + (b[0] - a[0]) * t,
          y: a[1] + (b[1] - a[1]) * t,
          angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
        };
      }
      target -= L;
    }
    return { x: 0, y: 0, angle: 0 };
  };

  // Relieve decorativo determinista (curvas de nivel suaves).
  const contours = createMemo(() => {
    const out: string[] = [];
    const centers = [
      [0.22, 0.32, 70],
      [0.7, 0.62, 95],
      [0.5, 0.18, 45],
    ] as const;
    centers.forEach(([cx, cy, r], ci) => {
      for (let ring = 1; ring <= 4; ring++) {
        let path = '';
        for (let i = 0; i <= 40; i++) {
          const a = (i / 40) * Math.PI * 2;
          const k = 1 + 0.16 * Math.sin(a * 3 + ci) + 0.08 * Math.sin(a * 5 + ci * 2);
          const rr = (r * ring) / 4;
          path += `${i ? 'L' : 'M'}${(cx * W + Math.cos(a) * rr * k * 1.3).toFixed(1)},${(cy * H() + Math.sin(a) * rr * k).toFixed(1)}`;
        }
        out.push(`${path}Z`);
      }
    });
    return out;
  });

  return (
    <svg class={s.ribbon} viewBox={`0 0 ${W} ${H()}`} role="img" aria-label={props.label}>
      <defs>
        <pattern id={`${uid}-p1`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.1" class={s.pat} />
        </pattern>
        <pattern id={`${uid}-p2`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2" height="6" class={s.pat} />
        </pattern>
        <pattern id={`${uid}-p3`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2" height="6" class={s.pat} />
          <rect width="6" height="2" class={s.pat} />
        </pattern>
      </defs>
      <rect class={s.land} width={W} height={H()} />
      <For each={contours()}>{(c) => <path class={s.contour} d={c} />}</For>
      <For each={props.alternatives ?? []}>{(alt) => <path class={s.alt} d={d(alt.map(proj()))} />}</For>
      <path class={s.casing} d={d(pts())} />
      <For each={pts().slice(1)}>
        {(p, i) => {
          const a = () => pts()[i()] ?? p;
          const level = () => props.levels[i()] ?? 'unknown';
          const seg = () => `M${a()[0]},${a()[1]}L${p[0]},${p[1]}`;
          return (
            <>
              <path class={s.seg} data-level={level()} d={seg()} />
              <Show when={level() === 1 || level() === 2 || level() === 3}>
                <path class={s.segPattern} d={seg()} stroke={`url(#${uid}-p${level()})`} />
              </Show>
            </>
          );
        }}
      </For>
      <For each={props.ticks ?? []}>
        {(tk) => {
          const p = along(tk.at);
          const deg = (p.angle * 180) / Math.PI;
          return (
            <g>
              <line
                class={s.tick}
                x1={0}
                x2={0}
                y1={-10}
                y2={10}
                transform={`translate(${p.x},${p.y}) rotate(${deg})`}
              />
              <text
                class={s.tickLabel}
                x={p.x + 20 * Math.sin(p.angle)}
                y={p.y - 20 * Math.cos(p.angle) + 4}
                text-anchor="middle"
              >
                {tk.label}
              </text>
            </g>
          );
        }}
      </For>
      <For each={props.places ?? []}>
        {(pl) => {
          const [x, y] = proj()(pl.at);
          return (
            <g>
              <circle class={pl.major ? s.dotMajor : s.dot} cx={x} cy={y} r={pl.major ? 5 : 3} />
              <text class={pl.major ? s.placeMajor : s.place} x={x + 9} y={y - 8}>
                {pl.name}
              </text>
            </g>
          );
        }}
      </For>
    </svg>
  );
}

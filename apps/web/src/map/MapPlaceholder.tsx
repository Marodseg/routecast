import { For } from 'solid-js';
import s from './MapPlaceholder.module.css';

/** Curvas de nivel deterministas (mismo trazo que la galería) para una carta estática sin coste de JS ni red. */
function ring(cx: number, cy: number, r: number, seed: number): string {
  let d = '';
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const k = 1 + 0.17 * Math.sin(a * 3 + seed) + 0.08 * Math.sin(a * 5 + seed * 2.1);
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r * k * 1.35).toFixed(1)},${(cy + Math.sin(a) * r * k).toFixed(1)}`;
  }
  return `${d}Z`;
}

const CENTERS = [
  [220, 260, 150],
  [760, 520, 210],
  [1180, 230, 120],
  [470, 760, 110],
] as const;

/**
 * Fondo de la portada mientras no hay ruta: una carta en curvas de nivel y retícula, sin MapLibre.
 * Mantiene la identidad cartográfica y deja la carga inicial ligera (Lighthouse móvil).
 */
export function MapPlaceholder(props: { onActivate?: () => void }) {
  const paths = CENTERS.flatMap(([cx, cy, r], i) =>
    Array.from({ length: 5 }, (_, k) => ring(cx, cy, (r * (k + 1)) / 5, i * 1.7 + k * 0.4)),
  );
  return (
    <div class={s.wrap} aria-hidden="true" onPointerDown={() => props.onActivate?.()}>
      <svg class={s.svg} viewBox="0 0 1440 960" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <For each={Array.from({ length: 15 }, (_, i) => i * 100)}>
          {(x) => <line class={s.grat} x1={x} x2={x} y1="0" y2="960" />}
        </For>
        <For each={Array.from({ length: 10 }, (_, i) => i * 100)}>
          {(y) => <line class={s.grat} x1="0" x2="1440" y1={y} y2={y} />}
        </For>
        <For each={paths}>{(d) => <path class={s.contour} d={d} />}</For>
      </svg>
    </div>
  );
}

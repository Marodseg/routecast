import { createEffect, createSignal, type JSX, onCleanup, onMount } from 'solid-js';
import { t } from '../../i18n';
import { prefersReducedMotion } from '../../lib/motion';
import s from './BottomSheet.module.css';

export type Snap = 'peek' | 'half' | 'full';
const ORDER: Snap[] = ['peek', 'half', 'full'];

export interface BottomSheetProps {
  snap: Snap;
  onSnap: (snap: Snap) => void;
  /** Altura visible en «peek» (px). */
  peek?: number;
  /** Elemento de fondo que queda `inert` cuando la hoja está completa (normalmente el mapa). */
  inertTarget?: () => HTMLElement | undefined;
  children: JSX.Element;
}

const TOP_GAP = 48;

/**
 * Hoja inferior para móvil (DESIGN §4/§7). Se posiciona respecto a su contenedor (position: relative),
 * así sirve igual en la app a pantalla completa y en la galería dentro de un marco de teléfono.
 */
export function BottomSheet(props: BottomSheetProps) {
  let root!: HTMLDivElement;
  let content!: HTMLDivElement;
  const [containerH, setContainerH] = createSignal(640);
  const [dragOffset, setDragOffset] = createSignal<number | null>(null);

  onMount(() => {
    const parent = root.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => e && setContainerH(e.contentRect.height));
    ro.observe(parent);
    onCleanup(() => ro.disconnect());
  });

  const visible = (snap: Snap) => {
    const h = containerH();
    if (snap === 'peek') return props.peek ?? 120;
    if (snap === 'half') return Math.round(h * 0.52);
    return h - TOP_GAP;
  };
  const offsetFor = (snap: Snap) => containerH() - TOP_GAP - visible(snap);
  const offset = () => dragOffset() ?? offsetFor(props.snap);

  createEffect(() => {
    const target = props.inertTarget?.();
    if (!target) return;
    target.inert = props.snap === 'full';
    onCleanup(() => {
      target.inert = false;
    });
  });

  // En «peek» el contenido está fuera de pantalla: ni foco ni lector de pantalla.
  createEffect(() => content.toggleAttribute('inert', props.snap === 'peek'));

  // Escape pliega la hoja completa (el fondo está inert y el asa no debería ser la única salida).
  createEffect(() => {
    if (props.snap !== 'full') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onSnap('half');
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => document.removeEventListener('keydown', onKey));
  });

  // --- Arrastre del asa ---
  let start = { y: 0, offset: 0, t: 0 };
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let moved = false;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    start = { y: e.clientY, offset: offset(), t: e.timeStamp };
    lastY = e.clientY;
    lastT = e.timeStamp;
    velocity = 0;
    moved = false;
    setDragOffset(offset());
  };
  const onPointerMove = (e: PointerEvent) => {
    if (dragOffset() === null) return;
    const dy = e.clientY - start.y;
    if (Math.abs(dy) > 4) moved = true;
    const max = offsetFor('peek');
    let next = start.offset + dy;
    // Resistencia elástica fuera de límites, sin rebote exagerado.
    if (next < 0) next = next / 3;
    if (next > max) next = max + (next - max) / 3;
    setDragOffset(next);
    const dt = Math.max(1, e.timeStamp - lastT);
    // Si el dedo estuvo quieto, la velocidad previa ya no cuenta.
    velocity = dt > 100 ? 0 : 0.7 * ((e.clientY - lastY) / dt) + 0.3 * velocity;
    lastY = e.clientY;
    lastT = e.timeStamp;
  };
  const onPointerUp = () => {
    const current = dragOffset();
    if (current === null) return;
    setDragOffset(null);
    if (!moved) return; // fue un clic: lo gestiona onClick
    if (performance.now() - lastT > 100) velocity = 0;
    // Proyección con la velocidad (px/ms) para decidir anclaje, como un lanzamiento.
    const projected = current + velocity * 180;
    const nearest = ORDER.reduce((best, snap) =>
      Math.abs(offsetFor(snap) - projected) < Math.abs(offsetFor(best) - projected) ? snap : best,
    );
    props.onSnap(nearest);
  };

  const cycle = () => {
    // El clic que sigue a un arrastre se ignora una vez; Enter/Espacio después siempre funcionan.
    if (moved) {
      moved = false;
      return;
    }
    props.onSnap(props.snap === 'full' ? 'peek' : (ORDER[ORDER.indexOf(props.snap) + 1] ?? 'full'));
  };

  return (
    <div
      ref={root}
      class={s.sheet}
      classList={{ [s.dragging ?? '']: dragOffset() !== null, [s.instant ?? '']: prefersReducedMotion() }}
      style={{ transform: `translate3d(0, ${offset()}px, 0)`, height: `calc(100% - ${TOP_GAP}px)` }}
      data-snap={props.snap}
    >
      <button
        type="button"
        class={s.handle}
        aria-label={props.snap === 'full' ? t().sheet.collapse : t().sheet.expand}
        aria-expanded={props.snap === 'full'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={cycle}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            props.onSnap(ORDER[Math.min(2, ORDER.indexOf(props.snap) + 1)] ?? 'full');
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            props.onSnap(ORDER[Math.max(0, ORDER.indexOf(props.snap) - 1)] ?? 'peek');
          }
        }}
      >
        <span class={s.grip} aria-hidden="true" />
      </button>
      <div
        class={s.content}
        ref={content}
        style={{ 'max-height': props.snap === 'full' ? undefined : `${Math.max(0, visible(props.snap) - 28)}px` }}
      >
        {props.children}
      </div>
    </div>
  );
}

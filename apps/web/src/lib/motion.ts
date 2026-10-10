import { createRoot, createSignal } from 'solid-js';

const query = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

/** Preferencia de movimiento reducido, reactiva a cambios del sistema en caliente. */
export const reducedMotion = createRoot(() => {
  const [get, set] = createSignal(query?.matches ?? false);
  query?.addEventListener?.('change', (e) => set(e.matches));
  return get;
});

export const prefersReducedMotion = (): boolean => reducedMotion();

/** Pulso háptico breve si el dispositivo lo admite y el usuario no ha pedido menos movimiento. */
export function tick(): void {
  if (prefersReducedMotion()) return;
  try {
    globalThis.navigator?.vibrate?.(4);
  } catch {
    // Sin háptica.
  }
}

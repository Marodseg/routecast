export const prefersReducedMotion = (): boolean =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Pulso háptico breve si el dispositivo lo admite y el usuario no ha pedido menos movimiento. */
export function tick(): void {
  if (prefersReducedMotion()) return;
  try {
    globalThis.navigator?.vibrate?.(4);
  } catch {
    // Sin háptica.
  }
}

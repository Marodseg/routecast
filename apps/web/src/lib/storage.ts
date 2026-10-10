/** localStorage puede no existir o lanzar (modo privado, cuotas, políticas): nunca debe romper la app. */
export function readPref(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(`routecast:${key}`) ?? null;
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(`routecast:${key}`, value);
  } catch {
    // Preferencia no persistida: aceptable.
  }
}

/** El dial trabaja en minutos desde la medianoche local del día actual; el dominio, en UnixMs (UTC). */
export const MIN_MS = 60_000;
export const STEP_MIN = 10;
/** Ventana de salida ofrecida: la previsión horaria es fiable ~48 h (SPEC §6.3). */
export const HORIZON_MIN = 48 * 60;

export function localMidnightMs(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const toMinutes = (ms: number, dayStartMs: number): number => Math.round((ms - dayStartMs) / MIN_MS);
export const toMs = (minutes: number, dayStartMs: number): number => dayStartMs + minutes * MIN_MS;

/** Siguiente múltiplo de 10 min a partir de ahora. */
export const nextStep = (nowMs: number): number => Math.ceil(nowMs / (STEP_MIN * MIN_MS)) * STEP_MIN * MIN_MS;

/** "HH:MM" en la hora local del navegador (CLAUDE.md regla 8: UTC en datos, local solo al pintar). */
export function localHHMM(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

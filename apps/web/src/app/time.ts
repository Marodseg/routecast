/** El dial trabaja en minutos desde la medianoche local del día actual; el dominio, en UnixMs (UTC). */
export const MIN_MS = 60_000;
export const STEP_MIN = 10;
/**
 * Días de previsión horaria que pedimos (Open-Meteo, tope del adaptador).
 * La fiabilidad es otra cosa: a más de ~48 h el core marca confianza baja (SPEC §6.3).
 */
export const FORECAST_DAYS = 7;

export function localMidnightMs(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Medianoche local de `midnightMs` más `days` días de calendario (respeta el cambio de hora). */
export function localMidnightPlus(midnightMs: number, days: number): number {
  const d = new Date(midnightMs);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function utcMidnightMs(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Último sello de `forecast_days` con `timezone=UTC`: desde la medianoche UTC de hoy,
 * N×24 horas, y el último sello es el inicio de la última hora.
 */
export function seriesEndMs(nowMs: number, days = FORECAST_DAYS): number {
  return utcMidnightMs(nowMs) + days * 24 * 3_600_000 - 3_600_000;
}

/** Último paso de 10 min del día local «hoy + 6» (hoy y los seis siguientes). */
export function calendarHorizonEndMs(nowMs: number): number {
  return localMidnightPlus(localMidnightMs(nowMs), FORECAST_DAYS) - STEP_MIN * MIN_MS;
}

/** Última salida que ofrecemos: cabe en el calendario y en la serie horaria, nunca en el pasado. */
export function horizonEndMs(nowMs: number): number {
  const step = STEP_MIN * MIN_MS;
  const raw = Math.min(calendarHorizonEndMs(nowMs), seriesEndMs(nowMs));
  const snapped = Math.floor(raw / step) * step;
  return Math.max(snapped, nextStep(nowMs));
}

/** Días de serie (`forecast_days`, desde la medianoche UTC de hoy) para que el último sello llegue a `untilMs`. */
export function daysToCover(untilMs: number, nowMs: number): number {
  const need = Math.ceil((untilMs - utcMidnightMs(nowMs) + 3_600_000) / (24 * 3_600_000));
  return Math.min(FORECAST_DAYS, Math.max(1, need));
}

/** Una serie cacheada solo vale si su última hora llega al fin del horizonte. Si no, se vuelve a pedir. */
export function seriesCoversHorizon(lastMs: number | undefined, nowMs: number): boolean {
  return lastMs !== undefined && lastMs >= horizonEndMs(nowMs);
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

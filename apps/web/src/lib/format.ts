const pad = (n: number): string => String(n).padStart(2, '0');

/** Minutos desde medianoche (local de presentación) → "HH:MM". */
export function hhmm(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Duración en minutos → "1 h 05" o "45 min". */
export function duration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)}`;
}

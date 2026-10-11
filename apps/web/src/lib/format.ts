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

/** Desfase hasta la salida: "45 min", "3 h 10" o, a partir de un día, "2 d 3 h". */
export function ahead(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 24 * 60) return duration(m);
  const days = Math.floor(m / (24 * 60));
  const h = Math.floor((m % (24 * 60)) / 60);
  return h === 0 ? `${days} d` : `${days} d ${h} h`;
}

export function sameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

const dayFormats = new Map<string, Intl.DateTimeFormat>();

/** "jue 15" / "thu 15", en el idioma de la interfaz (formateador cacheado: se llama en bucles de marcas). */
export function shortDay(ms: number, locale: string): string {
  let fmt = dayFormats.get(locale);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' });
    dayFormats.set(locale, fmt);
  }
  const parts = fmt.formatToParts(new Date(ms));
  const wd = (parts.find((p) => p.type === 'weekday')?.value ?? '').replace(/\.$/, '');
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${wd} ${day}`.trim().toLowerCase();
}

function clock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "HH:MM", o "jue 15 · HH:MM" si no cae en el mismo día local que `refMs`. */
export function localWhen(ms: number, refMs: number, locale: string): string {
  const time = clock(ms);
  return sameLocalDay(ms, refMs) ? time : `${shortDay(ms, locale)} · ${time}`;
}

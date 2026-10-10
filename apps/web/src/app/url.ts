import type { Place } from '@routecast/shared';

/** Estado compartible en la URL, sin servidor (SPEC F14): ?from=lat,lng,nombre&to=…&t=unixMs&r=A */
export interface UrlState {
  from?: Place;
  to?: Place;
  departureMs?: number;
  route?: string;
}

const encPlace = (p: Place) => `${p.at.lat.toFixed(5)},${p.at.lng.toFixed(5)},${p.name}`;

function decPlace(v: string | null, id: string): Place | undefined {
  if (!v) return undefined;
  const [lat, lng, ...name] = v.split(',');
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) return undefined;
  const n = name.join(',').trim().slice(0, 120);
  return { id, name: n || `${la.toFixed(3)}, ${ln.toFixed(3)}`, at: { lat: la, lng: ln } };
}

export function readUrl(search: string): UrlState {
  const q = new URLSearchParams(search);
  const t = Number(q.get('t'));
  const r = q.get('r');
  const from = decPlace(q.get('from'), 'url-from');
  const to = decPlace(q.get('to'), 'url-to');
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(Number.isFinite(t) && t > 0 ? { departureMs: t } : {}),
    ...(r && /^[A-C]$/.test(r) ? { route: r } : {}),
  };
}

export function writeUrl(s: UrlState): string {
  const q = new URLSearchParams();
  if (s.from) q.set('from', encPlace(s.from));
  if (s.to) q.set('to', encPlace(s.to));
  if (s.departureMs) q.set('t', String(s.departureMs));
  if (s.route) q.set('r', s.route);
  const str = q.toString();
  return str ? `?${str}` : '';
}

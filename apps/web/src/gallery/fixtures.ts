/** Datos FICTICIOS para la galería: Málaga → Granada, tres rutas. Sin red. */
import type { LatLng, Place, RiskLevel } from '@routecast/shared';
import { duration, hhmm } from '../lib/format';
import type { DialBand } from '../ui/DeparturePicker/DeparturePicker';
import type { ProfileSegment } from '../ui/RiskProfile/RiskProfile';
import type { CompareRoute } from '../ui/RouteCompare/RouteCompare';

const ll = (lat: number, lng: number): LatLng => ({ lat, lng });

export interface FixtureRoute {
  id: string;
  name: string;
  via: string;
  km: number;
  durMin: number;
  /** Desfase (min) desde la salida hasta el peor punto. */
  worstAtMin: number;
  where: string;
  factor: 'crosswind' | 'rain' | 'visibility';
  wind: { heading: number; from: number };
  path: LatLng[];
  /** Nivel máximo posible en cada vértice. */
  shape: RiskLevel[];
  /** Peor nivel por hora de salida, desde las 12:00. */
  hourly: RiskLevel[];
}

export const NOW = 15 * 60 + 40;
export const MIN = NOW;
export const MAX = 23 * 60 + 50;

export const routes: FixtureRoute[] = [
  {
    id: 'A',
    name: 'A-45 · A-92',
    via: 'por Antequera',
    km: 128,
    durMin: 84,
    worstAtMin: 24,
    where: 'A-92 km 141 · cerca de Antequera',
    factor: 'crosswind',
    wind: { heading: 52, from: 281 },
    path: [
      ll(36.721, -4.421),
      ll(36.8, -4.47),
      ll(36.92, -4.52),
      ll(37.0, -4.53),
      ll(37.05, -4.45),
      ll(37.093, -4.388),
      ll(37.14, -4.26),
      ll(37.165, -4.15),
      ll(37.19, -3.95),
      ll(37.19, -3.78),
      ll(37.177, -3.599),
    ],
    shape: [0, 1, 2, 3, 3, 3, 2, 1, 1, 0, 0],
    hourly: [0, 1, 1, 2, 3, 3, 2, 1, 1, 0, 0, 0],
  },
  {
    id: 'B',
    name: 'A-7 · A-44',
    via: 'por Motril',
    km: 171,
    durMin: 106,
    worstAtMin: 70,
    where: 'A-44 km 172 · Vélez de Benaudalla',
    factor: 'rain',
    wind: { heading: 355, from: 250 },
    path: [
      ll(36.721, -4.421),
      ll(36.73, -4.25),
      ll(36.745, -4.09),
      ll(36.765, -3.875),
      ll(36.745, -3.69),
      ll(36.765, -3.53),
      ll(36.84, -3.52),
      ll(36.95, -3.55),
      ll(37.05, -3.6),
      ll(37.177, -3.599),
    ],
    shape: [0, 0, 1, 1, 2, 3, 3, 2, 1, 0],
    hourly: [1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 0, 0],
  },
  {
    id: 'C',
    name: 'A-356 · A-402',
    via: 'por Alhama',
    km: 112,
    durMin: 111,
    worstAtMin: 48,
    where: 'A-402 km 26 · Alhama de Granada',
    factor: 'visibility',
    wind: { heading: 20, from: 200 },
    path: [
      ll(36.721, -4.421),
      ll(36.781, -4.101),
      ll(36.88, -4.03),
      ll(37.006, -3.989),
      ll(37.08, -3.85),
      ll(37.13, -3.72),
      ll(37.177, -3.599),
    ],
    shape: [0, 1, 3, 3, 2, 1, 0],
    hourly: [1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 0, 0],
  },
];

export const places = [
  { name: 'Málaga', at: ll(36.721, -4.421), major: true },
  { name: 'Granada', at: ll(37.177, -3.599), major: true },
  { name: 'Antequera', at: ll(37.019, -4.561) },
  { name: 'Loja', at: ll(37.168, -4.151) },
  { name: 'Alhama de Granada', at: ll(37.006, -3.989) },
];

const hourIdx = (min: number) => Math.max(0, Math.min(11, Math.floor(min / 60) - 12));
export const worstAt = (r: FixtureRoute, min: number): RiskLevel => r.hourly[hourIdx(min)] ?? 0;
const levelAt = (r: FixtureRoute, v: number, min: number): RiskLevel =>
  Math.min(r.shape[v] ?? 0, worstAt(r, min)) as RiskLevel;

/** Nivel por tramo (máximo de sus extremos, SPEC §6.4). */
export const segmentLevels = (r: FixtureRoute, min: number): RiskLevel[] =>
  r.path.slice(1).map((_, i) => Math.max(levelAt(r, i, min), levelAt(r, i + 1, min)) as RiskLevel);

export function profile(r: FixtureRoute, min: number): ProfileSegment[] {
  const n = r.path.length - 1;
  return segmentLevels(r, min).map((level, i) => ({ fromKm: (i / n) * r.km, toKm: ((i + 1) / n) * r.km, level }));
}

const FACTOR_TEXT = {
  crosswind: (l: RiskLevel) => `Racha cruzada de ${[18, 35, 50, 62][l]} km/h (racha ${[24, 46, 66, 82][l]})`,
  rain: (l: RiskLevel) => `Lluvia de ${[0.3, 3.4, 9.1, 22][l]?.toLocaleString('es-ES')} mm/h`,
  visibility: (l: RiskLevel) => `Visibilidad de ${[9000, 900, 350, 90][l]?.toLocaleString('es-ES')} m`,
};

export const gustAt = (level: RiskLevel) => [24, 46, 66, 82][level] ?? 0;

export function compareRoutes(min: number): CompareRoute[] {
  return routes
    .map((r) => {
      const worst = worstAt(r, min);
      const prof = profile(r, min);
      const kmHigh = Math.round(
        prof.filter((p) => p.level === 2 || p.level === 3).reduce((a, p) => a + p.toKm - p.fromKm, 0),
      );
      return {
        id: r.id,
        name: r.name,
        via: r.via,
        distanceKm: r.km,
        durationMin: r.durMin,
        arrival: hhmm(min + r.durMin),
        worst,
        kmHigh,
        profile: prof,
        ...(worst > 0 ? { worstText: `${hhmm(min + r.worstAtMin)} · ${FACTOR_TEXT[r.factor](worst)}` } : {}),
      } satisfies CompareRoute;
    })
    .sort((a, b) => (a.worst as number) - (b.worst as number) || a.kmHigh - b.kmHigh || a.durationMin - b.durationMin);
}

export const bands: DialBand[] = routes.map((r) => ({ id: r.id, levels: r.hourly.slice(hourIdx(MIN)) }));

export function ribbonTicks(r: FixtureRoute, min: number) {
  const out: { at: number; label: string }[] = [];
  for (let m = 20; m < r.durMin - 8; m += 20) out.push({ at: m / r.durMin, label: hhmm(min + m) });
  return out;
}

export const sampleDelta = (min: number) => duration(min - NOW);

const PLACES: Place[] = [
  { id: 'malaga', name: 'Málaga', detail: 'Málaga, Andalucía', at: ll(36.721, -4.421) },
  { id: 'granada', name: 'Granada', detail: 'Granada, Andalucía', at: ll(37.177, -3.599) },
  { id: 'antequera', name: 'Antequera', detail: 'Málaga, Andalucía', at: ll(37.019, -4.561) },
  { id: 'almeria', name: 'Almería', detail: 'Almería, Andalucía', at: ll(36.834, -2.464) },
  { id: 'alhama-g', name: 'Alhama de Granada', detail: 'Granada, Andalucía', at: ll(37.006, -3.989) },
  { id: 'alhama-m', name: 'Alhama de Murcia', detail: 'Murcia', at: ll(37.851, -1.425) },
  { id: 'madrid', name: 'Madrid', detail: 'Comunidad de Madrid', at: ll(40.417, -3.704) },
  { id: 'malagon', name: 'Malagón', detail: 'Ciudad Real, Castilla-La Mancha', at: ll(39.167, -3.854) },
];

export const recent: Place[] = [PLACES[1], PLACES[6]].filter((p): p is Place => !!p);

/** Búsqueda simulada con latencia y cancelación. */
export function fakeSearch(mode: 'ok' | 'error' | 'empty' = 'ok') {
  return (q: string, signal: AbortSignal): Promise<Place[]> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (mode === 'error') return reject(new Error('unavailable'));
        if (mode === 'empty') return resolve([]);
        const norm = (x: string) =>
          x
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase();
        resolve(PLACES.filter((p) => norm(p.name).includes(norm(q))).slice(0, 6));
      }, 350);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
}

import type { LatLng, Route } from '@routecast/shared';

const M_PER_DEG = 111_320;

/**
 * Simplifica la geometría (Douglas-Peucker iterativo en metros locales) conservando los tiempos acumulados de los
 * vértices que se quedan. Los motores de rutas devuelven ~70 vértices/km: una ruta de 900 km son ~60.000 puntos,
 * demasiados para muestrear y pintar con fluidez en un móvil. Con 15 m de tolerancia la forma es indistinguible.
 */
export function simplifyRoute(route: Route, toleranceM = 15): Route {
  const g = route.geometry;
  if (g.length <= 2) return route;
  const lat0 = ((g[0]?.lat ?? 0) * Math.PI) / 180;
  const kx = Math.cos(lat0) * M_PER_DEG;
  const xs = Float64Array.from(g, (p) => p.lng * kx);
  const ys = Float64Array.from(g, (p) => p.lat * M_PER_DEG);
  const keep = new Uint8Array(g.length);
  keep[0] = 1;
  keep[g.length - 1] = 1;
  const stack: [number, number][] = [[0, g.length - 1]];
  const tol2 = toleranceM * toleranceM;
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const ax = xs[a] as number;
    const ay = ys[a] as number;
    const dx = (xs[b] as number) - ax;
    const dy = (ys[b] as number) - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const px = xs[i] as number;
      const py = ys[i] as number;
      // Proyección sobre el segmento (si los extremos coinciden, distancia al punto).
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d2 = ex * ex + ey * ey;
      if (d2 > maxD) {
        maxD = d2;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > tol2) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const geometry: LatLng[] = [];
  const cumDurationS: number[] = [];
  for (let i = 0; i < g.length; i++) {
    if (!keep[i]) continue;
    geometry.push(g[i] as LatLng);
    cumDurationS.push(route.cumDurationS[i] as number);
  }
  return { ...route, geometry, cumDurationS };
}

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
  const xy = g.map((p) => [p.lng * kx, p.lat * M_PER_DEG] as const);
  const keep = new Uint8Array(g.length);
  keep[0] = 1;
  keep[g.length - 1] = 1;
  const stack: [number, number][] = [[0, g.length - 1]];
  const tol2 = toleranceM * toleranceM;
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const [ax, ay] = xy[a] ?? [0, 0];
    const [bx, by] = xy[b] ?? [0, 0];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i] ?? [0, 0];
      let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
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
  keep.forEach((k, i) => {
    if (!k) return;
    const p = g[i];
    if (p) geometry.push(p);
    cumDurationS.push(route.cumDurationS[i] ?? 0);
  });
  return { ...route, geometry, cumDurationS };
}

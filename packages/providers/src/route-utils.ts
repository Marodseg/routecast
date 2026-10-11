import type { LatLng } from '@routecast/shared/providers';

const RAD = Math.PI / 180;

/** Longitudes aproximadas (m) entre vértices consecutivos; solo para repartir tiempos, no para medir. */
export function segmentLengthsM(g: readonly LatLng[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < g.length; i++) {
    const a = g[i - 1];
    const b = g[i];
    if (!a || !b) continue;
    const x = (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * RAD);
    const y = b.lat - a.lat;
    out.push(Math.hypot(x, y) * 111_320);
  }
  return out;
}

/** Referencias de carretera españolas/europeas: A-45, AP-7, N-340, GR-30, M-30… */
const ROAD_REF = /^[A-Z]{1,3}-\d{1,4}[A-Z]?$/;

/** Nombre corto de la ruta: las dos vías con referencia más largas, en orden de aparición («A-45 · A-92»). */
export function routeName(parts: readonly { names: readonly string[]; lengthM: number }[]): string {
  const total = new Map<string, { len: number; first: number }>();
  parts.forEach((p, i) => {
    for (const n of p.names) {
      const ref = n.trim();
      if (!ROAD_REF.test(ref)) continue;
      const cur = total.get(ref);
      total.set(ref, { len: (cur?.len ?? 0) + p.lengthM, first: cur?.first ?? i });
    }
  });
  return [...total]
    .sort((a, b) => b[1].len - a[1].len)
    .slice(0, 2)
    .sort((a, b) => a[1].first - b[1].first)
    .map(([ref]) => ref)
    .join(' · ');
}

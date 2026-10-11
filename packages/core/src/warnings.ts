import type { LatLng, SamplePoint, UnixMs } from '@routecast/shared';

/** Lo mínimo de un aviso oficial que core necesita (sin depender de los tipos de proveedor). */
export interface AreaWarning {
  id: string;
  /** Anillos [lng, lat]. */
  polygons: readonly (readonly (readonly [number, number])[])[];
  fromMs: UnixMs;
  toMs: UnixMs;
}

export interface RouteWarningHit<W extends AreaWarning> {
  warning: W;
  fromKm: number;
  toKm: number;
  /** Primera hora de paso por la zona dentro de la ventana del aviso. */
  firstEtaMs: UnixMs;
}

/** Margen: la ETA es una estimación y los avisos tienen bordes horarios netos. */
export const WARNING_MARGIN_MS = 30 * 60_000;

/** Punto en polígono por paridad de cruces (anillos simples, como los de AEMET). */
export function pointInPolygons(p: LatLng, polygons: AreaWarning['polygons']): boolean {
  for (const ring of polygons) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (!a || !b) continue;
      const [xi, yi] = a;
      const [xj, yj] = b;
      if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

/**
 * Avisos que afectan a la ruta: alguna muestra cae dentro de la zona y su hora de paso está dentro de la ventana del
 * aviso (± margen). El tramo afectado va de la muestra anterior a la primera dentro hasta la siguiente a la última.
 */
export function warningsOnRoute<W extends AreaWarning>(
  samples: readonly SamplePoint[],
  warnings: readonly W[],
): RouteWarningHit<W>[] {
  const hits: RouteWarningHit<W>[] = [];
  for (const w of warnings) {
    if (!w.polygons.length) continue;
    let first = -1;
    let last = -1;
    samples.forEach((s, i) => {
      const inWindow = s.etaMs >= w.fromMs - WARNING_MARGIN_MS && s.etaMs <= w.toMs + WARNING_MARGIN_MS;
      if (inWindow && pointInPolygons(s.at, w.polygons)) {
        if (first < 0) first = i;
        last = i;
      }
    });
    if (first < 0) continue;
    const firstSample = samples[first] as SamplePoint;
    hits.push({
      warning: w,
      fromKm: samples[Math.max(0, first - 1)]?.kmFromStart ?? firstSample.kmFromStart,
      toKm: samples[Math.min(samples.length - 1, last + 1)]?.kmFromStart ?? firstSample.kmFromStart,
      firstEtaMs: firstSample.etaMs,
    });
  }
  return hits;
}

import type { LatLng } from '@routecast/shared/providers';

/** Decodifica una polilínea codificada (algoritmo de Google) con la precisión dada (Valhalla usa 6). */
export function decodePolyline(encoded: string, precision = 6): LatLng[] {
  const factor = 10 ** precision;
  const out: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) throw new RangeError('polilínea truncada');
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    out.push({ lat: lat / factor, lng: lng / factor });
  }
  return out;
}

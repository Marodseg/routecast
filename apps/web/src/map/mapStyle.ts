import { darkColors, lightColors, type ThemeColors, toHex } from '@routecast/shared/design';
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

export const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

export const themeColors = (dark: boolean): ThemeColors => (dark ? darkColors : lightColors);

type Role =
  | 'background'
  | 'water'
  | 'waterLine'
  | 'landcover'
  | 'building'
  | 'road'
  | 'roadMajor'
  | 'boundary'
  | 'label'
  | 'labelPlace'
  | 'other';

/** Clasificación genérica por tipo e id de capa: sobrevive a cambios menores del estilo base. */
export function roleOf(layer: LayerSpecification): Role {
  const id = layer.id.toLowerCase();
  if (layer.type === 'background') return 'background';
  if (layer.type === 'symbol') return /place|city|town|village|country|state/.test(id) ? 'labelPlace' : 'label';
  if (/water/.test(id)) return layer.type === 'line' ? 'waterLine' : 'water';
  if (/building/.test(id)) return 'building';
  if (/boundary|admin/.test(id)) return 'boundary';
  if (layer.type === 'line' && /(motorway|trunk|primary)/.test(id)) return 'roadMajor';
  if (layer.type === 'line' && /(road|highway|street|path|rail|bridge|tunnel|transport)/.test(id)) return 'road';
  if (/(landuse|landcover|park|wood|grass|forest|sand|ice|glacier|aeroway)/.test(id)) return 'landcover';
  return 'other';
}

interface Look {
  color: string;
  opacity?: number;
  halo?: string;
}

/** Color de nuestro tema para cada papel; null = ocultar la capa. */
export function lookFor(role: Role, c: ThemeColors): Look | null | undefined {
  switch (role) {
    case 'background':
      return { color: toHex(c.land) };
    case 'water':
    case 'waterLine':
      return { color: toHex(c.sea) };
    case 'landcover':
      return { color: toHex(c.surfaceSunken), opacity: 0.35 };
    case 'building':
      return null;
    case 'road':
      return { color: toHex({ ...c.inkSubtle, alpha: 0.28 }) };
    case 'roadMajor':
      return { color: toHex({ ...c.inkMuted, alpha: 0.45 }) };
    case 'boundary':
      return { color: toHex({ ...c.inkSubtle, alpha: 0.5 }) };
    case 'label':
      return { color: toHex(c.inkSubtle), halo: toHex(c.land) };
    case 'labelPlace':
      return { color: toHex(c.inkMuted), halo: toHex(c.land) };
    default:
      return undefined;
  }
}

/** Traduce el aspecto a las propiedades de pintura válidas para el tipo de capa. */
export function paintFor(type: LayerSpecification['type'], look: Look): Record<string, string | number> {
  switch (type) {
    case 'background':
      return { 'background-color': look.color };
    case 'fill':
      return { 'fill-color': look.color, ...(look.opacity !== undefined ? { 'fill-opacity': look.opacity } : {}) };
    case 'line':
      return { 'line-color': look.color, ...(look.opacity !== undefined ? { 'line-opacity': look.opacity } : {}) };
    case 'symbol':
      return { 'text-color': look.color, 'text-halo-color': look.halo ?? look.color, 'text-halo-width': 1.3 };
    case 'circle':
      return { 'circle-color': look.color };
    default:
      return {};
  }
}

/** Aplica el tema a un estilo base (copia; no muta el original). */
export function recolor(style: StyleSpecification, dark: boolean): StyleSpecification {
  const c = themeColors(dark);
  const layers = style.layers.flatMap((layer): LayerSpecification[] => {
    const look = lookFor(roleOf(layer), c);
    if (look === null) return [];
    if (look === undefined) return [layer];
    const paint = paintFor(layer.type, look);
    return [{ ...layer, paint: { ...(layer as { paint?: object }).paint, ...paint } } as LayerSpecification];
  });
  return { ...style, layers };
}

/** Imagen de patrón (puntos, rayado, rayado cruzado) para `line-pattern`: el riesgo nunca solo por color. */
export function patternImage(level: 1 | 2 | 3, inkRgba: [number, number, number, number], size = 8): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  const set = (x: number, y: number) => {
    const i = (y * size + x) * 4;
    data[i] = inkRgba[0];
    data[i + 1] = inkRgba[1];
    data[i + 2] = inkRgba[2];
    data[i + 3] = inkRgba[3];
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const diag = (x + y) % size;
      const anti = (x - y + size) % size;
      if (level === 1 && x % 4 === 1 && y % 4 === 1) set(x, y);
      if (level >= 2 && diag < 2) set(x, y);
      if (level === 3 && anti < 2) set(x, y);
    }
  }
  return new ImageData(data, size, size);
}

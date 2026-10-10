import type { JSX } from 'solid-js';

/**
 * Pictogramas propios: trazo 1,5 en rejilla de 20, terminaciones redondeadas.
 * Los de nivel cambian de FORMA (círculo, triángulo, triángulo con exclamación, octógono): el riesgo nunca depende solo del color.
 */
const PATHS = {
  rain: 'M5 3l-2 5M10 3l-2 5M15 3l-2 5M7 11l-2 5M12 11l-2 5M17 11l-2 5',
  crosswind: 'M10 2v16M2 7h9a2.5 2.5 0 1 0-2.5-2.5M2 12h12a2.5 2.5 0 1 1-2.5 2.5',
  gust: 'M2 6h10a2.5 2.5 0 1 0-2.5-2.5M2 10h14M2 14h8a2.5 2.5 0 1 1-2.5 2.5',
  snow: 'M10 2v16M3 6l14 8M3 14l14-8M8 3.5l2 1.5 2-1.5M8 16.5l2-1.5 2 1.5',
  ice: 'M3 15h14M5 15l2-8 3 5 2-3 3 6M10 4v1',
  visibility: 'M2 6h16M4 10h12M2 14h16M6 18h8',
  storm: 'M5 11a4 4 0 1 1 1.5-7.7A5 5 0 0 1 16 6a3 3 0 0 1 0 6H5M11 12l-3 4h4l-3 4',
  l0: 'M10 7a3 3 0 1 1 0 6a3 3 0 1 1 0-6z',
  l1: 'M10 4l7 12H3z',
  l2: 'M10 3l7.5 14h-15zM10 8v4M10 14.5v.5',
  l3: 'M6.5 2.5h7l4 4v7l-4 4h-7l-4-4v-7zM10 6.5v4.5M10 13.5v.5',
  unknown: 'M7.5 7.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M10 14.5v.5M3 3h14v14H3z',
  search: 'M8.5 3a5.5 5.5 0 1 1 0 11a5.5 5.5 0 1 1 0-11zM12.5 12.5l5 5',
  swap: 'M6 2v16M2.5 14.5L6 18l3.5-3.5M14 18V2M10.5 5.5L14 2l3.5 3.5',
  close: 'M5 5l10 10M15 5L5 15',
  clock: 'M10 2.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15zM10 6v4l3 2',
  sun: 'M10 6.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7zM10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6L16 16M4 16l1.4-1.4M14.6 5.4L16 4',
  moon: 'M16.5 12.5A7 7 0 0 1 7.5 3.5a7 7 0 1 0 9 9z',
  system: 'M10 2.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15zM10 2.5v15',
  warning: 'M10 3l8 14H2zM10 8v4M10 14.5v.5',
  chevron: 'M7 4l6 6-6 6',
  info: 'M10 2.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15zM10 9v5M10 6.5v.5',
  error: 'M10 2.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15zM7 7l6 6M13 7l-6 6',
  check: 'M4 10.5l4 4 8-9',
  pin: 'M10 18s-5.5-5.2-5.5-9.5a5.5 5.5 0 1 1 11 0C15.5 12.8 10 18 10 18zM10 6.5a2 2 0 1 1 0 4a2 2 0 1 1 0-4z',
  route: 'M5 17a2 2 0 1 1 0-4a2 2 0 1 1 0 4zM15 7a2 2 0 1 1 0-4a2 2 0 1 1 0 4zM6.5 13.5L10 10l3.5-3.5',
  offline:
    'M2 2l16 16M5 9.5a7 7 0 0 1 3-1.8M11.5 7.6a7 7 0 0 1 3.5 1.9M7.5 12.5a3.5 3.5 0 0 1 5 0M10 16v.5M2 6.5a11 11 0 0 1 3-2M8.5 3.6A11 11 0 0 1 18 6.5',
} as const;

export type IconName = keyof typeof PATHS;

export interface IconProps {
  name: IconName;
  /** Tamaño en px (por defecto 16). */
  size?: number;
  /** Si se da, el icono es significativo y se anuncia; si no, es decorativo. */
  label?: string;
  class?: string;
  style?: JSX.CSSProperties;
}

export function Icon(props: IconProps) {
  return (
    <svg
      class={props.class}
      style={props.style}
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      role={props.label ? 'img' : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : 'true'}
    >
      <path d={PATHS[props.name]} />
    </svg>
  );
}

export const levelIcon = (level: 0 | 1 | 2 | 3 | 'unknown'): IconName =>
  level === 'unknown' ? 'unknown' : `l${level}`;

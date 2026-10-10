/**
 * Tokens de diseño: fuente única (DESIGN §3, ADR-0006). Se transforman en variables CSS con `tokensToCss`.
 * Dirección «Instrumento» + cartografía de «Carta». Cualquier color nuevo se añade aquí y pasa los tests de
 * contraste y daltonismo de `test/design.test.ts`.
 */
import { type Oklch, oklch } from './color.ts';

export const RISK_LEVELS = [0, 1, 2, 3] as const;

export interface ThemeColors {
  /** Fondo de la app, detrás del mapa y paneles. */
  canvas: Oklch;
  /** Paneles e instrumentos. */
  surface: Oklch;
  /** Hover, filas alternas, interior de controles. */
  surfaceSunken: Oklch;
  land: Oklch;
  sea: Oklch;
  ink: Oklch;
  inkMuted: Oklch;
  inkSubtle: Oklch;
  rule: Oklch;
  ruleStrong: Oklch;
  accent: Oklch;
  onAccent: Oklch;
  /** Texto en color de acento sobre `surface` (enlaces, «ahora»). */
  accentInk: Oklch;
  risk0: Oklch;
  risk1: Oklch;
  risk2: Oklch;
  risk3: Oklch;
  /** Borde de la cinta de ruta seleccionada: da contraste a cualquier relleno de riesgo sobre el mapa. */
  routeCasing: Oklch;
  /** Tinta de los patrones de riesgo (puntos/rayado) sobre los rellenos. */
  riskPattern: Oklch;
  /** Pictogramas sobre rellenos de riesgo (contraste no textual ≥ 3:1). Nunca texto sobre el relleno. */
  onRisk: Oklch;
  danger: Oklch;
}

export const lightColors: ThemeColors = {
  canvas: oklch(0.93, 0.007, 80),
  surface: oklch(0.985, 0.004, 85),
  surfaceSunken: oklch(0.955, 0.006, 82),
  land: oklch(0.945, 0.013, 84),
  sea: oklch(0.885, 0.02, 215),
  ink: oklch(0.19, 0.012, 70),
  inkMuted: oklch(0.4, 0.012, 70),
  inkSubtle: oklch(0.5, 0.01, 70),
  rule: oklch(0.19, 0.012, 70, 0.13),
  ruleStrong: oklch(0.19, 0.012, 70, 0.35),
  accent: oklch(0.52, 0.115, 160),
  onAccent: oklch(0.985, 0.004, 85),
  accentInk: oklch(0.47, 0.095, 160),
  risk0: oklch(0.77, 0.025, 250),
  risk1: oklch(0.87, 0.15, 95),
  risk2: oklch(0.71, 0.17, 52),
  risk3: oklch(0.53, 0.2, 27),
  routeCasing: oklch(0.19, 0.012, 70),
  riskPattern: oklch(0.18, 0.02, 60, 0.5),
  onRisk: oklch(0.19, 0.012, 70),
  danger: oklch(0.5, 0.19, 27),
};

export const darkColors: ThemeColors = {
  canvas: oklch(0.15, 0.006, 70),
  surface: oklch(0.195, 0.007, 70),
  surfaceSunken: oklch(0.225, 0.008, 70),
  land: oklch(0.205, 0.008, 68),
  sea: oklch(0.16, 0.016, 235),
  ink: oklch(0.94, 0.008, 85),
  inkMuted: oklch(0.78, 0.01, 80),
  inkSubtle: oklch(0.66, 0.01, 78),
  rule: oklch(0.94, 0.008, 85, 0.12),
  ruleStrong: oklch(0.94, 0.008, 85, 0.3),
  accent: oklch(0.74, 0.13, 160),
  onAccent: oklch(0.15, 0.006, 70),
  accentInk: oklch(0.78, 0.13, 160),
  risk0: oklch(0.6, 0.03, 250),
  risk1: oklch(0.86, 0.14, 95),
  risk2: oklch(0.73, 0.16, 55),
  risk3: oklch(0.63, 0.2, 27),
  routeCasing: oklch(0.12, 0.006, 70),
  riskPattern: oklch(0.12, 0.02, 60, 0.55),
  onRisk: oklch(0.15, 0.006, 70),
  danger: oklch(0.7, 0.17, 27),
};

export const fonts = {
  display: "'Familjen Grotesk Variable', 'Geist Variable', system-ui, sans-serif",
  text: "'Geist Variable', system-ui, sans-serif",
  mono: "'Geist Mono Variable', ui-monospace, 'SFMono-Regular', monospace",
} as const;

/** Escala tipográfica modular (~1,2) en px: [mínimo móvil, máximo escritorio]. */
export const typeScale = {
  xs: [10, 10],
  sm: [12, 12],
  md: [14, 14.5],
  lg: [16, 17],
  xl: [20, 22],
  '2xl': [24, 28],
  '3xl': [32, 40],
  '4xl': [48, 64],
} as const satisfies Record<string, readonly [number, number]>;

/** Rejilla de 4 px. */
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

/** Sistema de radios intencionado: filo / control / contenedor flotante. */
export const radius = { s: 0, m: 3, l: 8 } as const;

export const motion = {
  durationFast: 120,
  duration: 200,
  durationSlow: 320,
  easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
  easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  /** Paso entre elementos en entradas escalonadas. */
  stagger: 32,
} as const;

export const zIndex = { map: 0, overlay: 10, panel: 20, sheet: 30, toast: 40 } as const;

export const breakpoints = { tablet: 768, desktop: 1024 } as const;

export const tokens = {
  lightColors,
  darkColors,
  fonts,
  typeScale,
  space,
  radius,
  motion,
  zIndex,
  breakpoints,
} as const;
export type Tokens = typeof tokens;

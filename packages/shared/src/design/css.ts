import { formatOklch } from './color.ts';
import type { ThemeColors, Tokens } from './tokens.ts';

const kebab = (s: string): string => s.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();

const FLUID_MIN_VW = 360;
const FLUID_MAX_VW = 1280;

/** `clamp()` fluido entre dos tamaños para anchos de 360 a 1280 px. */
export function fluid(min: number, max: number): string {
  if (min === max) return `${min}px`;
  const slope = (max - min) / (FLUID_MAX_VW - FLUID_MIN_VW);
  const intercept = min - slope * FLUID_MIN_VW;
  return `clamp(${min}px, ${Number(intercept.toFixed(3))}px + ${Number((slope * 100).toFixed(4))}vw, ${max}px)`;
}

function colorDecls(colors: ThemeColors): string[] {
  return Object.entries(colors).map(([k, v]) => `--${kebab(k)}: ${formatOklch(v)};`);
}

const block = (selector: string, decls: string[], indent = ''): string =>
  `${indent}${selector} {\n${decls.map((d) => `${indent}  ${d}`).join('\n')}\n${indent}}`;

/**
 * Genera las variables CSS de todos los tokens. Tema claro por defecto, oscuro por preferencia del sistema
 * salvo `data-theme="light"`, y oscuro forzado con `data-theme="dark"`.
 */
export function tokensToCss(t: Tokens): string {
  const common = [
    ...Object.entries(t.fonts).map(([k, v]) => `--font-${k}: ${v};`),
    ...Object.entries(t.typeScale).map(([k, [min, max]]) => `--text-${k}: ${fluid(min, max)};`),
    ...Object.entries(t.space).map(([k, v]) => `--space-${k}: ${v}px;`),
    ...Object.entries(t.radius).map(([k, v]) => `--radius-${k}: ${v}px;`),
    `--duration-fast: ${t.motion.durationFast}ms;`,
    `--duration: ${t.motion.duration}ms;`,
    `--duration-slow: ${t.motion.durationSlow}ms;`,
    `--ease-out: ${t.motion.easeOut};`,
    `--ease-in-out: ${t.motion.easeInOut};`,
    `--stagger: ${t.motion.stagger}ms;`,
    ...Object.entries(t.zIndex).map(([k, v]) => `--z-${kebab(k)}: ${v};`),
  ];
  const light = ['color-scheme: light;', ...colorDecls(t.lightColors)];
  const dark = ['color-scheme: dark;', ...colorDecls(t.darkColors)];
  return [
    '/* Generado desde packages/shared/src/design/tokens.ts. No editar a mano. */',
    block(':root', [...common, ...light]),
    `@media (prefers-color-scheme: dark) {\n${block(":root:not([data-theme='light'])", dark, '  ')}\n}`,
    block(":root[data-theme='dark']", dark),
    '',
  ].join('\n');
}

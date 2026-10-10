import { describe, expect, it } from 'vitest';
import {
  type ColorVisionDeficiency,
  contrastRatio,
  darkColors,
  deltaEok,
  fluid,
  formatOklch,
  inSrgbGamut,
  lightColors,
  oklch,
  relativeLuminance,
  simulateCvd,
  type ThemeColors,
  tokens,
  tokensToCss,
  toLinearSrgb,
} from '../src/design';

const themes: [string, ThemeColors][] = [
  ['claro', lightColors],
  ['oscuro', darkColors],
];
const risks = (c: ThemeColors) => [c.risk0, c.risk1, c.risk2, c.risk3];

describe('conversión de color', () => {
  it('blanco y negro tienen luminancia 1 y 0 y contraste 21:1', () => {
    const white = oklch(1, 0, 0);
    const black = oklch(0, 0, 0);
    expect(relativeLuminance(white)).toBeCloseTo(1, 4);
    expect(relativeLuminance(black)).toBeCloseTo(0, 6);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 2);
  });

  it('el rojo sRGB puro en OKLCH vuelve a [1, 0, 0] lineal', () => {
    const [r, g, b] = toLinearSrgb(oklch(0.62796, 0.25768, 29.2339));
    expect(r).toBeCloseTo(1, 3);
    expect(g).toBeCloseTo(0, 3);
    expect(b).toBeCloseTo(0, 3);
  });

  it('formatea con y sin alfa', () => {
    expect(formatOklch(oklch(0.5, 0.1, 160))).toBe('oklch(0.5 0.1 160)');
    expect(formatOklch(oklch(0.19, 0.012, 70, 0.13))).toBe('oklch(0.19 0.012 70 / 0.13)');
  });

  it('detecta colores fuera de gama sRGB', () => {
    expect(inSrgbGamut(oklch(0.5, 0.05, 200))).toBe(true);
    expect(inSrgbGamut(oklch(0.9, 0.4, 145))).toBe(false);
  });
});

describe.each(themes)('tema %s', (_name, c) => {
  it('todos los colores están en gama sRGB', () => {
    const out = Object.entries(c).filter(([, v]) => !inSrgbGamut(v));
    expect(out.map(([k]) => k)).toEqual([]);
  });

  it.each([
    ['ink', 'surface'],
    ['ink', 'surfaceSunken'],
    ['ink', 'canvas'],
    ['ink', 'land'],
    ['inkMuted', 'surface'],
    ['inkMuted', 'surfaceSunken'],
    ['inkMuted', 'canvas'],
    ['inkMuted', 'land'],
    ['inkSubtle', 'surface'],
    ['inkSubtle', 'surfaceSunken'],
    ['inkSubtle', 'canvas'],
    ['inkSubtle', 'land'],
    ['accentInk', 'surface'],
    ['accentInk', 'surfaceSunken'],
    ['onAccent', 'accent'],
    ['danger', 'surface'],
  ] as const)('texto %s sobre %s cumple AA (≥ 4,5:1)', (fg, bg) => {
    expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('el foco (acento) contrasta ≥ 3:1 con las superficies', () => {
    for (const bg of [c.surface, c.surfaceSunken, c.canvas, c.land]) {
      expect(contrastRatio(c.accent, bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it('el borde de los controles contrasta ≥ 3:1 con las superficies (WCAG 1.4.11)', () => {
    for (const bg of [c.surface, c.surfaceSunken, c.canvas]) {
      expect(contrastRatio(c.control, bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it('cada relleno de riesgo contrasta ≥ 3:1 con el borde de la cinta y con sus pictogramas', () => {
    for (const r of risks(c)) {
      expect(contrastRatio(r, c.routeCasing)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(r, c.onRisk)).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(['normal', 'protanopia', 'deuteranopia', 'tritanopia'] as const)(
    'los 4 niveles de riesgo se distinguen con visión %s (ΔE_ok ≥ 0,1 entre todos los pares)',
    (type) => {
      // Red de seguridad: el color nunca es el único canal (patrón + forma de icono + texto).
      const v = risks(c).map((r) =>
        type === 'normal' ? toLinearSrgb(r) : simulateCvd(r, type as ColorVisionDeficiency),
      );
      for (let i = 0; i < v.length; i++) {
        for (let j = i + 1; j < v.length; j++) {
          // biome-ignore lint/style/noNonNullAssertion: índices dentro de rango
          expect(deltaEok(v[i]!, v[j]!), `niveles ${i} y ${j}`).toBeGreaterThanOrEqual(0.1);
        }
      }
    },
  );
});

describe('tokensToCss', () => {
  const css = tokensToCss(tokens);

  it('declara variables semánticas en kebab-case', () => {
    expect(css).toContain(`--ink-muted: ${formatOklch(lightColors.inkMuted)};`);
    expect(css).toContain(`--risk-2: ${formatOklch(lightColors.risk2)};`);
    expect(css).toContain('--space-4: 16px;');
    expect(css).toContain('--radius-l: 8px;');
    expect(css).toContain('--z-toast: 40;');
  });

  it('el tema oscuro aplica por preferencia salvo data-theme=light, y por data-theme=dark', () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\n {2}:root:not\(\[data-theme='light'\]\) \{/);
    expect(css).toContain(":root[data-theme='dark'] {");
    expect(css.split(`--ink: ${formatOklch(darkColors.ink)};`)).toHaveLength(3);
  });

  it('fluid() devuelve el mínimo a 360 px y el máximo a 1280 px', () => {
    const m = fluid(32, 40).match(/clamp\(32px, (-?[\d.]+)px \+ ([\d.]+)vw, 40px\)/);
    expect(m).not.toBeNull();
    const at = (vw: number) => Number(m?.[1]) + (Number(m?.[2]) * vw) / 100;
    expect(at(360)).toBeCloseTo(32, 2);
    expect(at(1280)).toBeCloseTo(40, 2);
    expect(fluid(10, 10)).toBe('10px');
  });
});

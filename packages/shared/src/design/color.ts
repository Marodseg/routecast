/** Color en OKLCH (L 0-1, C ≥ 0, H en grados) con alfa opcional. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha?: number;
}

type Vec3 = readonly [number, number, number];

export const oklch = (l: number, c: number, h: number, alpha?: number): Oklch =>
  alpha === undefined ? { l, c, h } : { l, c, h, alpha };

export function formatOklch({ l, c, h, alpha }: Oklch): string {
  const base = `${round(l, 3)} ${round(c, 3)} ${round(h, 1)}`;
  return alpha === undefined ? `oklch(${base})` : `oklch(${base} / ${round(alpha, 2)})`;
}

const round = (n: number, d: number): number => Number(n.toFixed(d));

export function oklchToOklab({ l, c, h }: Oklch): Vec3 {
  const rad = (h * Math.PI) / 180;
  return [l, c * Math.cos(rad), c * Math.sin(rad)];
}

/** OKLab → sRGB lineal (sin recortar; puede salir de [0, 1] si está fuera de gama). */
export function oklabToLinearSrgb([L, a, b]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function linearSrgbToOklab([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const clampVec = ([r, g, b]: Vec3): Vec3 => [clamp01(r), clamp01(g), clamp01(b)];

/** sRGB lineal recortado a gama. */
export const toLinearSrgb = (c: Oklch): Vec3 => clampVec(oklabToLinearSrgb(oklchToOklab(c)));

/** ¿Está el color dentro de la gama sRGB (con tolerancia numérica)? */
export function inSrgbGamut(c: Oklch, eps = 1e-3): boolean {
  return oklabToLinearSrgb(oklchToOklab(c)).every((v) => v >= -eps && v <= 1 + eps);
}

/** Luminancia relativa WCAG 2.x. */
export function relativeLuminance(c: Oklch): number {
  const [r, g, b] = toLinearSrgb(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG 2.x entre dos colores opacos (1-21). */
export function contrastRatio(fg: Oklch, bg: Oklch): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export type ColorVisionDeficiency = 'protanopia' | 'deuteranopia' | 'tritanopia';

// Machado, Oliveira y Fernandes (2009), severidad 1.0, aplicadas en sRGB lineal.
const CVD: Record<ColorVisionDeficiency, readonly [Vec3, Vec3, Vec3]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export function simulateCvd(c: Oklch, type: ColorVisionDeficiency): Vec3 {
  const [r, g, b] = toLinearSrgb(c);
  const m = CVD[type];
  return clampVec([
    m[0][0] * r + m[0][1] * g + m[0][2] * b,
    m[1][0] * r + m[1][1] * g + m[1][2] * b,
    m[2][0] * r + m[2][1] * g + m[2][2] * b,
  ]);
}

/** Distancia euclídea en OKLab entre dos colores en sRGB lineal (ΔE_ok; ~0,02 ≈ diferencia apenas perceptible). */
export function deltaEok(a: Vec3, b: Vec3): number {
  const [l1, a1, b1] = linearSrgbToOklab(a);
  const [l2, a2, b2] = linearSrgbToOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** sRGB (gamma) en hexadecimal, para APIs que no entienden oklch() (p. ej. estilos de MapLibre). */
export function toHex(c: Oklch): string {
  const enc = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  const hex = toLinearSrgb(c)
    .map((v) =>
      Math.round(clamp01(enc(v)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
  return c.alpha === undefined || c.alpha >= 1
    ? `#${hex}`
    : `#${hex}${Math.round(c.alpha * 255)
        .toString(16)
        .padStart(2, '0')}`;
}

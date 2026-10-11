// Genera manifest.webmanifest, icon.svg e iconos PNG (192/512, «maskable») desde los tokens de diseño.
// Uso: pnpm --filter @routecast/web exec node scripts/build-pwa-assets.mjs
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { darkColors, lightColors, toHex } from '@routecast/shared/design';

const PUBLIC = new URL('../public/', import.meta.url);
const ink = toHex(lightColors.ink);
const accent = toHex(lightColors.accent);
const paper = toHex(lightColors.surface);

// Marca: el triángulo-baliza verde sobre «carta» oscura con retícula; zona segura del 60 % para iconos maskable.
const icon = (size, maskable) => {
  const pad = maskable ? size * 0.2 : size * 0.12;
  const s = size - 2 * pad;
  const grid = Array.from({ length: 5 }, (_, i) => {
    const p = (size / 6) * (i + 1);
    return `<line x1="${p}" y1="0" x2="${p}" y2="${size}"/><line x1="0" y1="${p}" x2="${size}" y2="${p}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <title>Routecast</title>
  <rect width="${size}" height="${size}" rx="${maskable ? 0 : size * 0.18}" fill="${ink}"/>
  <g stroke="${paper}" stroke-opacity="0.08" stroke-width="${size / 256}">${grid}</g>
  <path d="M${pad + s * 0.12} ${pad + s * 0.86} L${pad + s * 0.5} ${pad + s * 0.12} L${pad + s * 0.88} ${pad + s * 0.86} Z" fill="${accent}"/>
  <path d="M${pad + s * 0.12} ${pad + s * 0.86} H${pad + s * 0.88}" stroke="${paper}" stroke-width="${size / 48}" stroke-linecap="square"/>
</svg>`;
};

writeFileSync(new URL('icon.svg', PUBLIC), icon(512, false));
writeFileSync(
  new URL('manifest.webmanifest', PUBLIC),
  `${JSON.stringify(
    {
      name: 'Routecast',
      short_name: 'Routecast',
      description: 'Compara rutas en coche según el tiempo que hará en cada tramo cuando pases tú.',
      lang: 'es',
      start_url: './',
      scope: './',
      display: 'standalone',
      background_color: toHex(lightColors.canvas),
      theme_color: toHex(darkColors.canvas),
      icons: [
        { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2,
  )}\n`,
);

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${icon(size, maskable)}</body></html>`);
  await page
    .locator('svg')
    .screenshot({ path: new URL(name, PUBLIC).pathname.replace(/^\/([A-Z]:)/, '$1'), omitBackground: true });
}
await browser.close();
console.warn('PWA: manifest, icon.svg e iconos PNG generados');

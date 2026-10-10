// Capturas de los prototipos de dirección visual (fase 1): 375/768/1280 × claro/oscuro.
// Uso: pnpm --filter @routecast/web exec node scripts/capture-prototypes.mjs [prefijo]
import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = resolve(fileURLToPath(new URL('../../../design/prototypes', import.meta.url)));
const OUT = join(ROOT, 'shots');
const only = process.argv[2];
const pages = ['a-carta', 'b-instrumento'].filter((p) => !only || p.startsWith(only));
const widths = [
  { w: 375, h: 812 },
  { w: 768, h: 1024 },
  { w: 1280, h: 800 },
];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.css': 'text/css' };

const server = createServer((req, res) => {
  const p = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    statSync(p);
    res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' });
    createReadStream(p).pipe(res);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const port = server.address().port;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const errors = [];
for (const page of pages) {
  for (const scheme of ['light', 'dark']) {
    for (const { w, h } of widths) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        colorScheme: scheme,
        reducedMotion: 'reduce',
        deviceScaleFactor: 1,
      });
      const tab = await ctx.newPage();
      tab.on('pageerror', (e) => errors.push(`${page} ${scheme} ${w}: ${e.message}`));
      tab.on('console', (m) => m.type() === 'error' && errors.push(`${page} ${scheme} ${w}: ${m.text()}`));
      await tab.goto(`http://localhost:${port}/${page}.html`);
      await tab.evaluate(() => document.fonts.ready);
      await tab.waitForTimeout(150);
      const file = join(OUT, `${page}-${w}-${scheme}.png`);
      await tab.screenshot({ path: file, fullPage: w < 900 });
      const overflow = await tab.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (overflow) errors.push(`${page} ${scheme} ${w}: scroll horizontal`);
      if (w === 1280 && scheme === 'light') {
        await tab.addStyleTag({ content: 'html { filter: grayscale(1); }' });
        await tab.screenshot({ path: join(OUT, `${page}-${w}-gray.png`) });
      }
      await ctx.close();
    }
  }
}
await browser.close();
server.close();
console.warn(errors.length ? `Problemas:\n${errors.join('\n')}` : 'Sin errores de consola ni scroll horizontal.');
console.warn(`Capturas en ${OUT}`);

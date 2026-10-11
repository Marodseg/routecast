// Prueba manual contra las APIs REALES (pocas peticiones): Málaga → Granada, captura y comprueba que el dial no hace red.
// Uso: pnpm --filter @routecast/web build && pnpm --filter @routecast/web exec node scripts/live-smoke.mjs <carpeta-salida>
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const OUT = process.argv[2];
const srv = spawn('pnpm', ['preview', '--port', '4175', '--strictPort'], { shell: true, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 1280, height: 860 },
  locale: 'es-ES',
  timezoneId: 'Europe/Madrid',
});
const p = await ctx.newPage();
const reqs = [];
p.on('request', (r) => reqs.push(r.url().split('?')[0]));
p.on('pageerror', (e) => console.warn('PAGEERROR', e.message));
p.on('console', (m) => m.type() === 'error' && console.warn('CONSOLE', m.text()));
await p.goto('http://localhost:4175/');
const pick = async (label, q) => {
  const box = p.getByRole('combobox', { name: label });
  await box.fill(q);
  await p.getByRole('option').first().waitFor({ timeout: 10000 });
  await box.press('Enter');
};
await pick('Origen', 'Málaga');
await pick('Destino', 'Granada');
await p
  .getByRole('button', { name: /A-|Ruta/ })
  .first()
  .waitFor({ timeout: 30000 });
await p.waitForTimeout(4000);
await p.screenshot({ path: `${OUT}/live-1280.png` });
console.warn('URL', p.url());
console.warn(
  'REQUESTS',
  [...new Set(reqs.filter((u) => !u.includes('localhost') && !u.includes('tiles.openfreemap')))].join('\n'),
);
const before = reqs.length;
const dial = p.getByRole('slider', { name: 'Hora de salida' });
await dial.focus();
for (let i = 0; i < 6; i++) await p.keyboard.press('PageUp');
await p.waitForTimeout(800);
console.warn(
  'requests after dial (non-tile):',
  reqs.slice(before).filter((u) => !u.includes('tiles.openfreemap')).length,
);
await p.screenshot({ path: `${OUT}/live-1280-later.png` });
await p.setViewportSize({ width: 390, height: 844 });
await p.reload();
await p.waitForTimeout(6000);
await p.screenshot({ path: `${OUT}/live-390.png` });
await b.close();
srv.kill();
process.exit(0);

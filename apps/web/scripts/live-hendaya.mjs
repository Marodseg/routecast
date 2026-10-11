// Prueba manual: Granada → Hendaya con APIs reales y el Worker desplegado (build con VITE_API_BASE).
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const OUT = process.argv[2];
const srv = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4173', '--strictPort'], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch();
const p = await b.newPage({
  viewport: { width: 1280, height: 860 },
  locale: 'es-ES',
  timezoneId: 'Europe/Madrid',
  serviceWorkers: 'block',
});
p.on('console', (m) => m.type() === 'error' && console.warn('CONSOLE', m.text().slice(0, 160)));
await p.goto('http://localhost:4173/');
for (const [label, q] of [
  ['Origen', 'Granada'],
  ['Destino', 'Hendaya'],
]) {
  const box = p.getByRole('combobox', { name: label });
  await box.fill(q);
  await p.getByRole('option').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(900);
  const opts = await p.getByRole('option').allInnerTexts();
  console.warn(`«${q}» →`, opts.map((o) => o.replace(/\s+/g, ' ').trim()).join(' | '));
  await box.press('Enter');
}
await p.locator('section button[aria-pressed]').first().waitFor({ timeout: 60000 });
await p.waitForTimeout(8000);
const rows = await p.locator('section button[aria-pressed]').allInnerTexts();
console.warn('RUTAS:\n ' + rows.map((r) => r.replace(/\s+/g, ' ').slice(0, 140)).join('\n '));
console.warn(
  'ESTADO:',
  (await p.locator('[role=status]').allInnerTexts()).filter(Boolean).join(' / ').replace(/\s+/g, ' ').slice(0, 300),
);
await p.screenshot({ path: `${OUT}/hendaya.png` });
await b.close();
srv.kill();
process.exit(0);

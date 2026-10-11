// Prueba manual de la web publicada (GitHub Pages) con APIs reales: Granada → Hendaya.
// Uso: pnpm --filter @routecast/web exec node scripts/live-pages.mjs [url] [carpeta-captura]
import { chromium } from '@playwright/test';

const URL_ = process.argv[2] ?? 'https://marodseg.github.io/routecast/';
const OUT = process.argv[3];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 860 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
const problems = [];
const calls = new Set();
p.on('console', (m) => m.type() === 'error' && problems.push(m.text().slice(0, 200)));
p.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
p.on('request', (r) => calls.add(new URL(r.url()).host));
p.on('requestfailed', (r) => problems.push(`fallo ${r.failure()?.errorText} ${r.url().slice(0, 120)}`));
p.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url().slice(0, 120)}`));
const report = (title) => {
  console.warn(title);
  console.warn('HOSTS:', [...calls].sort().join(', '));
  console.warn('PROBLEMAS:', problems.length ? `\n  ${problems.join('\n  ')}` : 'ninguno');
};

await p.goto(URL_);
for (const [label, q] of [
  ['Origen', 'Granada'],
  ['Destino', 'Hendaya'],
]) {
  const box = p.getByRole('combobox', { name: label });
  await box.fill(q);
  await p.getByRole('option').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(900);
  await box.press('Enter');
}
try {
  await p.locator('section button[aria-pressed]').first().waitFor({ timeout: 40000 });
} catch {
  console.warn('URL:', p.url());
  console.warn('TEXTO:', (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400));
  report('SIN RUTAS');
  await b.close();
  process.exit(1);
}
await p.waitForTimeout(8000);
const rows = await p.locator('section button[aria-pressed]').allInnerTexts();
console.warn('RUTAS:', rows.map((r) => r.replace(/\s+/g, ' ').slice(0, 60)).join(' || '));
const status = await p.locator('[role=status]').allInnerTexts();
console.warn('AVISOS:', status.filter(Boolean).join(' / ').replace(/\s+/g, ' ').slice(0, 160));
const sw = await p.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope ?? 'sin registrar');
console.warn('SW:', sw);
console.warn('CSP:', (await p.locator('meta[http-equiv="Content-Security-Policy"]').count()) > 0);
report('OK');
if (OUT) await p.screenshot({ path: `${OUT}/pages.png` });
await b.close();

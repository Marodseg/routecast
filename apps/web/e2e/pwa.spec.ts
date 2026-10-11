import { expect, test } from '@playwright/test';
import { mockNetwork, NOW } from './mocks';

test.describe('PWA', () => {
  test.use({ serviceWorkers: 'allow' });

  test('CSP sin violaciones y manifest con iconos', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
    });
    await page.clock.setFixedTime(NOW);
    await mockNetwork(page);
    await page.goto('/?from=36.72130,-4.42140,M%C3%A1laga&to=37.17350,-3.59953,Granada');
    await expect(page.locator('section button[aria-pressed]')).toHaveCount(2);
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain('https://api.routecast.test');
    const manifest = await (await page.request.get('/manifest.webmanifest')).json();
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
    expect(violations).toEqual([]);
  });

  test('sin conexión: abre el shell y muestra la última ruta guardada', async ({ page, context }) => {
    await page.clock.setFixedTime(NOW);
    await mockNetwork(page);
    const q = '/?from=36.72130,-4.42140,M%C3%A1laga&to=37.17350,-3.59953,Granada';
    await page.goto(q);
    await expect(page.locator('section button[aria-pressed]')).toHaveCount(2);
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Una recarga con el SW ya controlando la página deja el shell en caché.
    await page.reload();
    await expect(page.locator('section button[aria-pressed]')).toHaveCount(2);

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText('Mostramos la última ruta guardada', { exact: false })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('section button[aria-pressed]')).toHaveCount(2);
  });
});

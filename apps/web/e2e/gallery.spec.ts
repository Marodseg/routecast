import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WIDTHS = [375, 768, 1280] as const;
const SCHEMES = ['light', 'dark'] as const;

test.describe('galería de componentes', () => {
  test.skip(
    ({ browserName, isMobile }) => isMobile || browserName !== 'chromium',
    'Se recorren los anchos dentro del test',
  );

  for (const scheme of SCHEMES) {
    for (const width of WIDTHS) {
      test(`${width}px ${scheme}: sin violaciones axe y captura estable @visual`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/dev/gallery/');
        await page.evaluate(() => document.fonts.ready);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        const axe = await new AxeBuilder({ page }).analyze();
        expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        expect(overflow, 'sin scroll horizontal').toBe(false);

        await expect(page).toHaveScreenshot(`gallery-${width}-${scheme}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });
    }
  }

  test('el dial responde a teclado y anuncia el valor', async ({ page }) => {
    await page.goto('/dev/gallery/');
    const dial = page.getByRole('slider', { name: 'Hora de salida' }).first();
    await dial.focus();
    await expect(dial).toHaveAttribute('aria-valuenow', '1020');
    await page.keyboard.press('ArrowRight');
    await expect(dial).toHaveAttribute('aria-valuenow', '1030');
    await page.keyboard.press('PageUp');
    await expect(dial).toHaveAttribute('aria-valuenow', '1090');
    await page.keyboard.press('Home');
    await expect(dial).toHaveAttribute('aria-valuenow', '940');
    await expect(dial).toHaveAttribute('aria-valuetext', /Salida a las 15:40\. Ruta A:/);
  });

  test('cambiar la hora reordena el comparador sin peticiones de red', async ({ page }) => {
    await page.goto('/dev/gallery/');
    await page.evaluate(() => document.fonts.ready);
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    const firstRoute = page.locator('#compare button[aria-pressed]').first();
    await expect(firstRoute).toContainText('A-7 · A-44');
    const dial = page.getByRole('slider', { name: 'Hora de salida' }).first();
    await dial.focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('PageUp');
    await expect(firstRoute).toContainText('A-45 · A-92');
    expect(requests).toEqual([]);
  });

  test('el buscador sigue el patrón combobox', async ({ page }) => {
    await page.goto('/dev/gallery/');
    const box = page.getByRole('combobox', { name: 'Origen' });
    await box.fill('gra');
    const option = page.getByRole('option', { name: /Granada/ }).first();
    await expect(option).toBeVisible();
    await box.press('ArrowDown');
    await box.press('Enter');
    await expect(box).toHaveValue(/Granada|Alhama de Granada/);
    await expect(box).toHaveAttribute('aria-expanded', 'false');
  });
});

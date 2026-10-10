import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('la portada carga con el nombre de la app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Routecast' })).toBeVisible();
});

test('la portada no tiene errores de accesibilidad', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

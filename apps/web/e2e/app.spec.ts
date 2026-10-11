import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockNetwork, NOW, pickPlace } from './mocks';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

const compareRows = (page: import('@playwright/test').Page) => page.locator('section button[aria-pressed]');

test('flujo completo: origen → destino → rutas con riesgo → cambiar hora sin red', async ({ page }) => {
  const net = await mockNetwork(page);
  await page.goto('/');
  await pickPlace(page, 'Origen', 'Mál');
  await pickPlace(page, 'Destino', 'Gra');

  await expect(compareRows(page)).toHaveCount(2);
  // A las 16:40 la ruta A (Antequera) tiene rachas cruzadas: la costa (B) va primero.
  await expect(compareRows(page).first()).toContainText('A-7 · A-44');
  await expect(page.getByText(/Racha cruzada de \d+ km\/h/).first()).toBeVisible();
  await expect(page).toHaveURL(/from=36\.72.*M%C3%A1laga.*to=37\.1/);

  const before = net.external.length;
  const dial = page.getByRole('slider', { name: 'Hora de salida' });
  await dial.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('PageUp');
  // Pasado el viento, la ruta rápida (A) vuelve a ser la primera… y sin ninguna petición nueva.
  await expect(compareRows(page).first()).toContainText('A-45 · A-92');
  expect(net.external.slice(before)).toEqual([]);
  await expect(page).toHaveURL(/t=\d+/);
});

test('la URL compartida reproduce la consulta sin teclear', async ({ page }) => {
  await mockNetwork(page);
  const t = NOW + 6 * 3_600_000;
  await page.goto(`/?from=36.72130,-4.42140,M%C3%A1laga&to=37.17350,-3.59953,Granada&t=${t}&r=B`);
  await expect(compareRows(page)).toHaveCount(2);
  await expect(page.getByRole('combobox', { name: 'Origen' })).toHaveValue('Málaga');
  await expect(page.locator('section button[aria-pressed="true"]')).toContainText('A-7 · A-44');
});

test('rutas caídas: mensaje claro y reintento', async ({ page }) => {
  await mockNetwork(page, { routing: 'down' });
  await page.goto('/?from=36.72130,-4.42140,M%C3%A1laga&to=37.17350,-3.59953,Granada');
  await expect(page.getByText('Los servidores de rutas no responden', { exact: false })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
});

test('previsión caída: rutas sin riesgo calculado y aviso', async ({ page }) => {
  await mockNetwork(page, { weather: 'down' });
  await page.goto('/?from=36.72130,-4.42140,M%C3%A1laga&to=37.17350,-3.59953,Granada');
  await expect(compareRows(page)).toHaveCount(2);
  await expect(page.getByText('Sin previsión meteorológica ahora mismo', { exact: false })).toBeVisible();
  await expect(compareRows(page).first()).toContainText('Sin datos');
});

test('429 de la previsión: se reintenta y se informa sin romper', async ({ page }) => {
  await mockNetwork(page, { weather: 'rate_limited' });
  await page.goto('/?from=36.72130,-4.42140,M%C3%A1laga&to=37.17350,-3.59953,Granada');
  await expect(page.getByText('Demasiadas consultas seguidas', { exact: false })).toBeVisible({ timeout: 20_000 });
  await expect(compareRows(page)).toHaveCount(2);
});

test('sin violaciones de accesibilidad con resultados', async ({ page }) => {
  await mockNetwork(page);
  await page.goto('/?from=36.72130,-4.42140,M%C3%A1laga&to=37.17350,-3.59953,Granada');
  await expect(compareRows(page)).toHaveCount(2);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

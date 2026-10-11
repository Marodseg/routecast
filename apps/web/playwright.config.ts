import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  // Las capturas dependen del sistema (fuentes, antialiasing): una carpeta por plataforma.
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{arg}{ext}',
  // En CI se generan las que falten (p. ej. linux) y se suben como artefacto para versionarlas.
  updateSnapshots: process.env.CI ? 'missing' : 'none',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    locale: 'es-ES',
    // El service worker solo se activa en el test de PWA (interferiría con la red simulada).
    serviceWorkers: 'block',
    timezoneId: 'Europe/Madrid',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Worker simulado en los E2E (las peticiones se interceptan en e2e/mocks.ts).
    env: { VITE_API_BASE: 'https://api.routecast.test' },
  },
});

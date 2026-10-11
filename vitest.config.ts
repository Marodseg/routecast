import { defineConfig } from 'vitest/config';

// Misma zona en local y en CI (que corre en UTC): la web pinta en hora local y hay tests de cambio de hora.
process.env.TZ = 'Europe/Madrid';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'shared', root: 'packages/shared', include: ['test/**/*.test.ts'] } },
      { test: { name: 'core', root: 'packages/core', include: ['test/**/*.test.ts'] } },
      { test: { name: 'providers', root: 'packages/providers', include: ['test/**/*.test.ts'] } },
      { test: { name: 'worker', root: 'apps/worker', include: ['test/**/*.test.ts'] } },
      'apps/web/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**'],
      reporter: ['text-summary', 'html', 'lcov'],
      thresholds: {
        'packages/core/src/**': { perFile: true, lines: 90, functions: 90, branches: 80, statements: 90 },
      },
    },
  },
});

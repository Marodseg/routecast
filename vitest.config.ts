import { defineConfig } from 'vitest/config';

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
        perFile: true,
        'packages/core/src/**': { lines: 90, functions: 90, branches: 85, statements: 90 },
      },
    },
  },
});

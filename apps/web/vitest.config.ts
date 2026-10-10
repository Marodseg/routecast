import solid from 'vite-plugin-solid';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [solid({ hot: false })],
  resolve: { conditions: ['browser', 'development'] },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
});

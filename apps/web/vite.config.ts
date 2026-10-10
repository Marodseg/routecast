import { resolve } from 'node:path';
import { tokens, tokensToCss } from '@routecast/shared/design';
import { defineConfig, type Plugin } from 'vite';
import solid from 'vite-plugin-solid';

/** `import 'virtual:tokens.css'` → variables CSS generadas desde packages/shared (fuente única). */
function designTokens(): Plugin {
  const id = 'virtual:tokens.css';
  const resolved = `\0${id}`;
  return {
    name: 'routecast-design-tokens',
    resolveId: (source) => (source === id ? resolved : undefined),
    load: (source) => (source === resolved ? tokensToCss(tokens) : undefined),
  };
}

// En GitHub Pages el sitio vive bajo /<repo>/; el workflow de deploy fija BASE_PATH.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [designTokens(), solid()],
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        gallery: resolve(import.meta.dirname, 'dev/gallery/index.html'),
      },
    },
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});

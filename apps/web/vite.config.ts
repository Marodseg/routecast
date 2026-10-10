import { defineConfig } from 'vite';

// En GitHub Pages el sitio vive bajo /<repo>/; el workflow de deploy fija BASE_PATH.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});

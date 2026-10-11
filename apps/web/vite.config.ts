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

/** Orígenes a los que la web puede conectar (ARCHITECTURE §11). Añadir aquí cualquier proveedor nuevo. */
const CONNECT = [
  'https://api.open-meteo.com',
  'https://photon.komoot.io',
  'https://valhalla1.openstreetmap.de',
  'https://routing.openstreetmap.de',
  'https://router.project-osrm.org',
  'https://tiles.openfreemap.org',
];

/** CSP estricta en el HTML construido (en desarrollo no: Vite inyecta estilos y websockets). */
function csp(): Plugin {
  return {
    name: 'routecast-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const api = process.env.VITE_API_BASE ? new URL(process.env.VITE_API_BASE).origin : '';
      const policy = [
        "default-src 'self'",
        "script-src 'self'",
        // Solid aplica algunos estilos como atributo; los scripts siguen estrictos (ADR-0009).
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "worker-src 'self' blob:",
        `connect-src 'self' ${[...CONNECT, api].filter(Boolean).join(' ')}`,
        "manifest-src 'self'",
        "base-uri 'self'",
        "form-action 'none'",
        "object-src 'none'",
      ].join('; ');
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

// En GitHub Pages el sitio vive bajo /<repo>/; el workflow de deploy fija BASE_PATH.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [designTokens(), solid(), csp()],
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

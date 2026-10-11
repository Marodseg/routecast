# Routecast

Compara rutas en coche según **el tiempo que hará en cada tramo a la hora en que pases tú**: lluvia fuerte, rachas,
viento cruzado, riesgo de tormenta con granizo, nieve/hielo y niebla. Para decidir por dónde ir y cuándo salir.

**Pruébala:** https://marodseg.github.io/routecast/ · API: https://routecast-api.marodseg.workers.dev/api/health

> **Estado:** en desarrollo (fase 4 completada del [ROADMAP](docs/ROADMAP.md)): búsqueda, rutas alternativas, riesgo por tramo a la hora de paso, selector de hora, avisos oficiales de AEMET/Meteoalarm y PWA. Galería de componentes en `/dev/gallery/`.

Proyecto personal, sin monetización, con coste 0 €. Ámbito inicial: España.

## Stack

pnpm workspaces · TypeScript strict · Vite · MapLibre GL + OpenFreeMap · Hono en Cloudflare Workers · Zod · Vitest ·
Playwright · Biome. Detalles en [ARCHITECTURE](docs/ARCHITECTURE.md) y [ADRs](docs/adr/).

```
apps/web            UI (Vite + TypeScript + MapLibre)
apps/worker         Cloudflare Worker (Hono): claves, caché de avisos, fallback de rutas
packages/core       Lógica pura: muestreo, ETA, viento cruzado, scoring de riesgo
packages/providers  Adaptadores a APIs externas (Open-Meteo, OSRM, Photon, AEMET…)
packages/shared     Tipos, esquemas Zod, tokens de diseño
```

## Desarrollo

Requisitos: Node ≥ 22 (CI usa la versión de `.nvmrc`) y pnpm 10.

```sh
pnpm install
pnpm dev          # web (http://localhost:5173) + worker (http://localhost:8787)
pnpm lint         # Biome: formato, lint y fronteras entre paquetes
pnpm typecheck
pnpm test         # Vitest (todos los paquetes)
pnpm test:e2e     # Playwright (la primera vez: pnpm --filter @routecast/web exec playwright install chromium)
pnpm build
pnpm size         # presupuesto de bundle
```

## Despliegue

- **Web**: `deploy-web.yml` publica `apps/web` en GitHub Pages en cada push a `main`. Protege `main` exigiendo el
  check de CI para que nunca se despliegue algo en rojo.
- **Worker**: `deploy-worker.yml` (necesita `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` como secretos del repo; sin ellos se omite) o a mano con `pnpm --filter @routecast/worker exec wrangler deploy`. Claves con `wrangler secret put AEMET_API_KEY` y `ORS_API_KEY`.
- **Desarrollo local**: copia `apps/worker/dev.vars.example` a `apps/worker/.dev.vars` con tus claves y ejecuta `pnpm dev`.

## Fuentes de datos

© OpenStreetMap contributors (ODbL) · OpenFreeMap / OpenMapTiles · Weather data by Open-Meteo.com (CC-BY 4.0) ·
Routing by OSRM / OpenRouteService · Avisos: AEMET / Meteoalarm (EUMETNET). Ver [PROVIDERS](docs/PROVIDERS.md).

## Licencia

[MIT](LICENSE)

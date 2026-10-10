# Routecast

Compara rutas en coche según **el tiempo que hará en cada tramo a la hora en que pases tú**: lluvia fuerte, rachas,
viento cruzado, riesgo de tormenta con granizo, nieve/hielo y niebla. Para decidir por dónde ir y cuándo salir.

> **Estado:** en desarrollo — fase 0 (cimientos) del [ROADMAP](docs/ROADMAP.md). Aún no hay funcionalidad de usuario.

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

## Fuentes de datos

© OpenStreetMap contributors (ODbL) · OpenFreeMap / OpenMapTiles · Weather data by Open-Meteo.com (CC-BY 4.0) ·
Routing by OSRM / OpenRouteService · Avisos: AEMET / Meteoalarm (EUMETNET). Ver [PROVIDERS](docs/PROVIDERS.md).

## Licencia

[MIT](LICENSE)

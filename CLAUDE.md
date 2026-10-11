# Routecast — instrucciones para Claude Code

> Nombre de trabajo: **Routecast** (cámbialo cuando elijas el definitivo; está en `package.json`, README y docs).

## Qué es

Web app gratuita que, dadas un origen y un destino en coche, compara 2-3 rutas alternativas y muestra
**qué tiempo hará en cada tramo en el momento en que pases tú** (lluvia fuerte, rachas, viento cruzado,
tormenta/granizo, nieve/hielo, niebla), para poder elegir la ruta más segura o cómoda.

- Proyecto personal/portfolio, **sin monetización**. Todo el stack debe poder costar 0 €.
- Ámbito inicial: **España** (AEMET + Meteoalarm). Extensible a Europa.
- Hosting: GitHub Pages (web) + Cloudflare Workers plan gratuito (API fina).

Lee **antes de tocar código**: `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/PROVIDERS.md`, `docs/DESIGN.md` y `docs/adr/`.

## Diseño (prioridad alta del proyecto)

El objetivo es una interfaz moderna, con identidad propia y que **no parezca generada por IA**: responsive real,
animación con propósito y componentes memorables. `docs/DESIGN.md` manda en cualquier decisión visual.

- Todo trabajo visual lo hace (o revisa) el subagente `ui-designer`; carga el skill `frontend-design` si está disponible.
- Tokens como única fuente (`packages/shared/src/design`), nunca hex/px sueltos. Claro y oscuro de primera clase.
- Checklist anti-"look IA" (DESIGN §2) obligatorio en cada PR de UI. Elementos firma: `DeparturePicker` y `RoadWind`.
- Bucle: implementar → capturas Playwright (375/768/1280, claro/oscuro) → autocrítica → iterar.
- Movimiento solo con propósito, `prefers-reduced-motion` respetado, 60 fps; riesgo siempre con color + icono + patrón.
- No uses kits de UI con apariencia reconocible sin rediseñarlos a nuestros tokens.

## Estructura del monorepo (objetivo)

```
apps/web        Vite + TypeScript + Solid + MapLibre (UI); galería en /dev/gallery
apps/worker     Cloudflare Worker (Hono): claves, caché, avisos, rate limiting
packages/core   Lógica pura SIN red ni DOM: muestreo, ETA, viento cruzado, scoring
packages/providers  Adaptadores: Open-Meteo, OSRM, ORS, Valhalla, AEMET, Meteoalarm, Photon
packages/shared Tipos, esquemas Zod, constantes
docs/           SPEC, ARCHITECTURE, PROVIDERS, ROADMAP, ADRs
```

## Stack (decidido, ver ADR-0001)

pnpm workspaces · TypeScript `strict` · Vite · **Solid** + CSS Modules (ADR-0007) · MapLibre GL + OpenFreeMap · Hono en Workers ·
Zod para validar TODA respuesta externa · Vitest · Playwright · Biome (lint+format) ·
GitHub Actions · Wrangler.

## Comandos

```
pnpm install
pnpm dev            # web (Vite, :5173) + worker (wrangler dev, :8787)
pnpm test           # vitest run, todos los paquetes (projects en vitest.config.ts)
pnpm test:coverage  # idem con cobertura v8 (umbral ≥ 90 % en packages/core)
pnpm test:e2e       # playwright en apps/web (build + preview :4173; móvil y escritorio)
pnpm lint           # biome check: formato, lint y fronteras entre paquetes (noRestrictedImports/Globals)
pnpm lint:fix       # biome check --write
pnpm typecheck      # tsc --noEmit en cada paquete (pnpm -r typecheck)
pnpm build          # vite build (web) + wrangler deploy --dry-run (worker)
pnpm size           # size-limit sobre apps/web/dist (requiere build)
pnpm --filter @routecast/web exec playwright install chromium   # primera vez
```

Scripts manuales (con red, ejecutar con moderación):
- `node packages/providers/scripts/record-fixtures.mjs` — regraba fixtures de proveedores.
- `node packages/providers/scripts/build-aemet-zones.mjs` — tabla de zonas AEMET (necesita `apps/worker/.dev.vars`).
- `pnpm --filter @routecast/web exec node scripts/build-gazetteer.mjs` — nomenclátor desde Wikidata (ADR-0010).
- `pnpm --filter @routecast/web exec node scripts/build-pwa-assets.mjs` — manifest e iconos desde los tokens.

Entorno local: `apps/worker/.dev.vars` (claves, ignorado por git; plantilla en `dev.vars.example`). La web usa el Worker
local (:8787) en desarrollo; `VITE_API_BASE` lo cambia (ver `apps/web/.env.example`). Worker desplegado:
https://routecast-api.marodseg.workers.dev

Galería de componentes: `pnpm dev` → http://localhost:5173/dev/gallery/ (también se publica en Pages).
Capturas de regresión: `apps/web/e2e/__screenshots__/{plataforma}/`; tras un cambio visual intencionado,
`pnpm --filter @routecast/web exec playwright test --update-snapshots -g visual`.

Notas: los paquetes exportan su `src/index.ts` directamente (sin paso de build). Las fronteras `core`/`shared`/`providers`
se imponen con Biome (`biome.json` → `overrides`), no con dependency-cruiser (no soporta Node impar local).

Si un comando no existe todavía, créalo en la fase correspondiente; no lo inventes en la documentación.

## Reglas innegociables

1. **`packages/core` es puro**: sin `fetch`, sin `window`, sin `Date.now()` implícito (el reloj se inyecta). Todo lo que
   haya en core debe tener tests unitarios. Aquí vive el valor del proyecto.
2. **Ninguna clave en el cliente.** Claves (AEMET, ORS) solo como secretos del Worker (`wrangler secret`).
   Nunca commitear `.env`, `.dev.vars` ni claves. Hay `.gitignore` y deny en `.claude/settings.json`.
3. **Proveedores detrás de interfaces** (`RoutingProvider`, `WeatherProvider`, `WarningsProvider`, `GeocodingProvider`).
   La UI y el core no conocen OSRM ni Open-Meteo por nombre. Ver ADR-0003.
4. **Valida con Zod** todo lo que venga de una API externa y trátalo como no confiable. Un campo que cambie no debe
   romper la app: degrada con gracia y avisa en la UI.
5. **Respeta los términos de uso** de cada proveedor (`docs/PROVIDERS.md`): User-Agent identificable donde se exige,
   atribuciones visibles, caché, sin autocompletado contra Nominatim, ≤ 1 req/s contra demos públicos.
6. **Cuotas**: deduplicar puntos meteo por celda de 0,1° y hora, cachear (memoria + IndexedDB, TTL 30 min), 
   reintentos con backoff, tratar 429 como estado normal, no como error fatal.
7. **El granizo es riesgo estimado, no certeza.** Nunca lo muestres como predicción segura. Mismo criterio para el
   resto de umbrales: son valores iniciales a calibrar (ver `docs/SPEC.md` §6).
8. **Zona horaria**: pedir a las APIs `timezone=UTC` y tiempos en unix; convertir solo al pintar.
9. **Accesibilidad y móvil primero**: contraste AA, no depender solo del color (iconos/patrones), teclado, `prefers-reduced-motion`.
10. **i18n desde el principio**: ES y EN con diccionario tipado; sin cadenas sueltas en componentes.

## Flujo de trabajo

- Empieza cada fase en **plan mode**, propón el plan y espera confirmación antes de editar.
- Trabaja en ramas `feat/…`, commits en **Conventional Commits**, PRs pequeños (< ~400 líneas de diff si se puede).
- TDD en `core`: test primero para cada regla de scoring/ETA/viento.
- Antes de dar algo por hecho: `pnpm lint && pnpm typecheck && pnpm test`. Si añades UI, comprueba en navegador.
- Cada decisión de arquitectura nueva → ADR corto en `docs/adr/` (plantilla en ADR-0001).
- Subagentes disponibles en `.claude/agents/`: `code-reviewer`, `test-writer`, `provider-auditor`, `scoring-reviewer`, `ui-designer`.
  Úsalos: review antes de cada PR, `provider-auditor` cada vez que se toque un adaptador o se añada una llamada externa,
  `scoring-reviewer` al tocar umbrales, `ui-designer` para todo lo visual.
- No añadas dependencias sin justificarlo en el PR (tamaño, mantenimiento, licencia).
- No inventes datos de API: si dudas de un campo o límite, mira `docs/PROVIDERS.md` y, si no está, búscalo en la
  documentación oficial y actualízalo allí con fecha.

## Definition of Done (cualquier PR)

- [ ] Lint, typecheck y tests en verde en CI
- [ ] Tests nuevos para lógica nueva (con fixtures grabadas, sin red)
- [ ] Sin claves ni datos personales; sin `console.log` olvidados
- [ ] Docs/ADR actualizados si cambia una decisión o un límite de proveedor
- [ ] Atribuciones visibles intactas (OSM, Open-Meteo, OSRM/ORS, AEMET, Meteoalarm, OpenFreeMap)
- [ ] Revisado con `code-reviewer`
- [ ] Si toca UI: checklist anti-"look IA" pasado, capturas en móvil y escritorio (claro/oscuro) y `axe` sin errores

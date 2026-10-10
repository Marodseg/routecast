# ROADMAP — Routecast

Reglas generales: cada fase empieza en **plan mode**, termina con su checklist en verde y un PR (o varios) revisado con
`code-reviewer`. No pases a la siguiente fase con la actual a medias. Los prompts son para pegar en Claude Code.

---

## Fase 0 — Cimientos (≈ 1 sesión)

**Prompt**
```
Lee CLAUDE.md y todo docs/. Estamos en la FASE 0 del ROADMAP. En plan mode, propón el plan para crear el monorepo
pnpm (apps/web, apps/worker, packages/{core,providers,shared}) con TypeScript strict, Biome, Vitest, Playwright,
size-limit y las GitHub Actions de ARCHITECTURE §10 (ci.yml y deploy-web.yml; el deploy del worker puede esperar).
Incluye: .gitignore (con .env y .dev.vars), .editorconfig, LICENSE (MIT), CODEOWNERS, Dependabot, plantilla de PR con la
Definition of Done, y regla de lint/dependency-cruiser que impida que core importe providers. Espera mi confirmación.
```

**Checklist**
- [ ] `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde
- [ ] CI en GitHub verde con una app "hola mundo" desplegada en Pages
- [ ] Sección "Comandos" de `CLAUDE.md` rellenada con los comandos reales
- [ ] README base con nombre, descripción y estado

---

## Fase 1 — Sistema de diseño y galería (≈ 2-3 sesiones)

> Antes de construir funcionalidad: identidad visual validada. Lee `docs/DESIGN.md` entero.

**Prompt**
```
FASE 1. Lee docs/DESIGN.md y carga el skill frontend-design si está disponible. Usa el subagente ui-designer.
En plan mode: propón 2 direcciones visuales concretas (paleta OKLCH claro/oscuro con escala de riesgo segura para
daltonismo, pareja tipográfica autoalojada, sistema de radios/filetes) y haz un prototipo HTML de cada una con la misma
pantalla (mapa falso + panel + DeparturePicker). Capturas con Playwright en 375 y 1280 px, claro y oscuro, y
autocrítica contra el checklist anti-"look IA" del §2. Yo elegiré una. Después implementa tokens (packages/shared),
CSS base, y la galería /dev/gallery con los componentes del §4 en sus estados, sin lógica de negocio.
```

**Checklist**
- [ ] Dirección visual elegida y registrada en un ADR (0006)
- [ ] Tokens como fuente única (TS → CSS variables), tema claro/oscuro
- [ ] Componentes del §4 en la galería, con teclado y estados; **DeparturePicker** y **RoadWind** funcionando
- [ ] Capturas de regresión visual (3 anchos × 2 temas) y `axe` sin errores
- [ ] `prefers-reduced-motion` respetado; animaciones a 60 fps
- [ ] Presupuesto de bundle configurado en size-limit

---

## Fase 2 — Core con TDD (≈ 2 sesiones)

**Prompt**
```
FASE 2. Implementa packages/core siguiendo SPEC §6 y ARCHITECTURE §5, con TDD: primero los tests, luego el código.
Módulos: geo (haversine, rumbo, suavizado de rumbo), resample (25 km + cambios de rumbo > 45°), eta (reloj inyectado,
interpolación de cumDurationS), relativeWind (frontal/cruzada), scoring (thresholds.ts único, 'unknown' si falta dato,
combinación de factores acotada a 3), aggregateRoute. Casos límite: ruta de 5 km, 1.500 km, segmentos de longitud 0,
datos nulos, viento calmo, ángulos de 359°→1°. Sin red ni DOM. Cobertura ≥ 90 %. Al terminar, pasa scoring-reviewer.
```

**Checklist**
- [ ] ≥ 90 % de cobertura en `core`, sin dependencias de red/DOM (lint lo impide)
- [ ] `thresholds.ts` documentado; `scoring-reviewer` sin hallazgos bloqueantes
- [ ] Tests de propiedades (p. ej. viento cruzado ∈ [0, v]; rumbo ∈ [0, 360))

---

## Fase 3 — Proveedores y MVP end-to-end (≈ 3-4 sesiones)

**Prompt**
```
FASE 3. Implementa packages/providers: Photon (geocoding), OSRM (con fallback y circuit breaker), Open-Meteo (lote
multi-ubicación, celdas 0,1°, timezone=UTC/unix, validación Zod, null-safe). Cada adaptador con fixtures grabadas y MSW,
timeouts, AbortSignal, Result<T,ProviderError>. Pasa provider-auditor en cada uno. Después integra en apps/web con la UI
de la fase 1: buscar origen/destino, rutas alternativas, previsión por punto, riesgo, comparador, DeparturePicker que
recalcula desde caché sin red, estados vacío/error/parcial, URL compartible. Tests E2E del flujo principal.
```

**Checklist**
- [ ] Flujo completo funciona en móvil y escritorio, claro/oscuro
- [ ] Cambiar hora = 0 peticiones de red (verificado en E2E)
- [ ] Simulaciones de 429/timeout/respuesta rara con mensaje claro en UI
- [ ] `provider-auditor` sin hallazgos bloqueantes; atribuciones visibles
- [ ] Lighthouse móvil ≥ 90 / a11y ≥ 95

---

## Fase 4 — Worker, avisos oficiales y pulido PWA (≈ 2-3 sesiones)

**Prompt**
```
FASE 4. Implementa apps/worker (Hono): /api/warnings (AEMET en dos pasos + Meteoalarm, normalización a Warning,
deduplicación, Cache API, partial:true si falla uno), /api/route (ORS con clave secreta) como último fallback, /api/health,
CORS restringido, rate limiting, límites de entrada. Secretos con wrangler secret. deploy-worker.yml. En la web: banda de
avisos y marcado de tramos afectados por ventana temporal. Después PWA (shell offline + última ruta en IndexedDB) y
pulido de animaciones (trazado de rutas, odómetro de cifras, transición de foco).
```

**Checklist**
- [ ] Worker desplegado; ningún secreto en el repo ni en el cliente
- [ ] Degradación probada: AEMET caído → solo Meteoalarm; Worker caído → web sin avisos y lo indica
- [ ] PWA instalable; Lighthouse PWA correcto
- [ ] Revisión de seguridad: CSP, validación de entrada, dependencias

---

## Fase 5 — Lanzamiento y extensiones

**Prompt**
```
FASE 5. Prepara el lanzamiento: README con capturas/GIF, arquitectura y limitaciones honestas (granizo = riesgo, sin
radar), política de privacidad breve, página "Acerca de/Fuentes de datos" con atribuciones, ADRs al día, CHANGELOG,
issue templates, SECURITY.md, dominio propio opcional. Después propón (sin implementar) extensiones priorizadas:
perfil de vehículo (viento cruzado para moto/caravana), Europa vía Meteoalarm, malla meteo precalculada con Actions.
```

**Checklist**
- [ ] README impecable y repo ordenado (issues, labels, releases)
- [ ] Prueba informal con 3 personas ajenas (§10 de DESIGN) y feedback registrado
- [ ] Publicación en LinkedIn con GIF del DeparturePicker en acción

---

## Ritual de cada sesión con Claude Code
1. `claude` en la raíz, plan mode, pega el prompt de la fase (o la siguiente tarea de su checklist).
2. Implementa en rama `feat/…`, commits convencionales.
3. `code-reviewer` (y el subagente específico: `test-writer`, `provider-auditor`, `scoring-reviewer`, `ui-designer`).
4. `pnpm lint && pnpm typecheck && pnpm test` (y `test:e2e` si hay UI), capturas si hay UI.
5. PR con la Definition of Done marcada; merge cuando CI esté en verde.

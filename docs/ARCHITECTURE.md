# ARCHITECTURE — Routecast

## 1. Vista general

```
                 ┌────────────────────────────── Navegador (GitHub Pages) ───────────────────────────┐
                 │  apps/web (Vite+TS+MapLibre)                                                       │
                 │   UI ── state ── orchestrator ── packages/core (puro: muestreo, ETA, viento, riesgo)│
                 │                      │                                                              │
                 │                      ├── WeatherProvider  ──────────► Open-Meteo (directo, CORS)    │
                 │                      ├── RoutingProvider  ──────────► OSRM demo / Valhalla demo     │
                 │                      ├── GeocodingProvider ─────────► Photon                        │
                 │                      └── WarningsProvider ──┐                                       │
                 └─────────────────────────────────────────────┼──────────────────────────────────────┘
                                                               ▼
                 ┌────────── Cloudflare Worker (apps/worker, Hono) ──────────┐
                 │  /api/warnings  → AEMET OpenData + Meteoalarm (caché)     │
                 │  /api/route     → OpenRouteService (clave secreta)  [fallback]
                 │  /api/health, rate limiting, User-Agent identificable     │
                 └───────────────────────────────────────────────────────────┘
```

Decisión clave (ADR-0002): **el tiempo se pide desde el navegador** porque Open-Meteo limita por IP y desde un Worker se
compartiría IP con otros clientes de Cloudflare. El Worker solo hace lo que el navegador no puede: guardar claves y cachear
avisos oficiales.

## 2. Paquetes

| Paquete | Responsabilidad | Dependencias permitidas |
|---|---|---|
| `shared` | Tipos de dominio, esquemas Zod, tokens de diseño, constantes | zod |
| `core` | Lógica pura (sin red, sin DOM, reloj inyectado) | shared |
| `providers` | Adaptadores HTTP a APIs externas + normalización a tipos de dominio | shared, zod |
| `apps/web` | UI, estado, orquestación, caché cliente | core, providers, shared |
| `apps/worker` | Endpoints fijos, claves, caché, rate limiting | providers, shared, hono |

Regla: `core` no importa `providers`. `web` y `worker` importan ambos. Imposición con una regla de lint (Biome `noRestrictedImports` o `dependency-cruiser`) en CI.

## 3. Modelos de dominio (`packages/shared`)

```ts
type LatLng = { lat: number; lng: number };
type UnixMs = number;

interface Route {
  id: string;
  geometry: LatLng[];            // polilínea simplificada para pintar y muestrear
  distanceM: number;
  durationS: number;
  // duración acumulada por vértice, para ETA (cumDurationS[i] = segundos desde el origen hasta geometry[i])
  cumDurationS: number[];
  provider: string;
}

interface SamplePoint {
  index: number;
  at: LatLng;
  kmFromStart: number;
  etaMs: UnixMs;                 // salida + cumDuration interpolada
  headingDeg: number;            // rumbo suavizado de la carretera
}

interface HourlyWeather {        // un punto/celda, valores por hora UTC
  cell: string;                  // "lat:lng" cuantizado a 0.1°
  timesMs: UnixMs[];
  precipitationMmH: (number | null)[];
  gustsKmH: (number | null)[];
  windKmH: (number | null)[];
  windFromDeg: (number | null)[];
  weatherCode: (number | null)[];
  tempC: (number | null)[];
  visibilityM: (number | null)[];
  cape: (number | null)[];
  lightningPotential: (number | null)[];
  snowfallCmH: (number | null)[];
  fetchedAtMs: UnixMs;
}

type RiskLevel = 0 | 1 | 2 | 3;
type Factor = 'rain' | 'crosswind' | 'gust' | 'snow' | 'ice' | 'visibility' | 'storm';
interface PointRisk { level: RiskLevel | 'unknown'; dominant?: Factor; values: Record<string, number | null>; }
```

`null` = dato ausente; nunca se sustituye por 0 (ver SPEC §6.3).

## 4. Interfaces de proveedor

```ts
interface RoutingProvider {
  readonly id: string;
  getRoutes(from: LatLng, to: LatLng, opts: { alternatives: number; signal: AbortSignal }): Promise<Result<Route[], ProviderError>>;
}
interface WeatherProvider {
  readonly id: string;
  getHourly(cells: LatLng[], opts: { signal: AbortSignal }): Promise<Result<HourlyWeather[], ProviderError>>;
}
interface WarningsProvider {
  getWarnings(bbox: BBox, window: [UnixMs, UnixMs], opts: { signal: AbortSignal }): Promise<Result<Warning[], ProviderError>>;
}
interface GeocodingProvider {
  suggest(q: string, opts: { signal: AbortSignal; bias?: LatLng }): Promise<Result<Place[], ProviderError>>;
}

type ProviderError =
  | { kind: 'rate_limited'; retryAfterS?: number }
  | { kind: 'unavailable' } | { kind: 'timeout' } | { kind: 'bad_response'; detail: string }
  | { kind: 'no_coverage' } | { kind: 'aborted' };
```

Todos devuelven `Result` (sin excepciones para errores esperados). Cada adaptador: validación Zod, timeout, `AbortSignal`,
User-Agent/atribución según `PROVIDERS.md`, y tests con fixtures grabadas.

### 4.1 Cadena de fallback de rutas
`Valhalla (valhalla1.openstreetmap.de) → OSRM (routing.openstreetmap.de) → OSRM (router.project-osrm.org) → Worker /api/route (ORS)` (ADR-0008: Valhalla da alternativas reales; los demos OSRM a menudo no).
Circuit breaker simple por proveedor (abre tras N fallos, semiabierto a los 60 s). Throttle ≤ 1 req/s hacia demos públicos.
El orden y los límites son **configuración**, no código.

## 4.2 Meteo: peticiones y caché
1. Cuantizar cada punto de muestreo a celda de 0,1° y deduplicar.
2. Pedir en **una** petición multi-ubicación a Open-Meteo (lista `latitude`/`longitude` separada por comas), `timezone=UTC`, `timeformat=unixtime`, `forecast_days` suficiente para el horizonte pedido, `wind_speed_unit=kmh`.
3. Caché en memoria + IndexedDB, clave `cell`, TTL 30 min, con `fetchedAt`. El selector de hora **solo lee caché**.
4. Si hay > N celdas (p. ej. 60), trocear en lotes con concurrencia 1-2 y backoff ante 429.
5. **Por verificar** (ver `PROVIDERS.md`): cómo cuenta Open-Meteo las llamadas multi-ubicación contra el límite diario.

## 5. Pipeline de cálculo (puro, en `core`)

```
Route ─► resample(25 km + cambios de rumbo) ─► SamplePoint[] (km, rumbo suavizado)
      ─► attachEta(departureMs)                ─► etaMs por punto
HourlyWeather[] ─► sampleWeatherAt(point, etaMs, ±30 min, peor caso)
      ─► relativeWind(headingDeg, windFromDeg, gusts) ─► {head, cross}
      ─► scorePoint(thresholds) ─► PointRisk
      ─► aggregateRoute ─► RouteRisk { worstLevel, worstPoint, kmAtLevel2Plus, minutesAtLevel2Plus, dominantFactor }
```

Todas funciones puras y deterministas; `thresholds` inyectado (valor por defecto en `scoring/thresholds.ts`).
`recompute(departureMs)` reutiliza el muestreo y la caché meteo, así que mover el selector de hora no hace red.

## 6. Worker (apps/worker)

- Framework: **Hono**. Un solo Worker. Rutas: `GET /api/warnings`, `GET /api/route`, `GET /api/health`.
- **CORS** restringido al origen de GitHub Pages (y localhost en dev).
- **Caché**: memoria del isolate + `Cache API` por centro de datos (ADR-0009; la Cache API no está garantizada en `*.workers.dev`). Sin KV en v1: su cuota gratuita de escrituras es mínima.
- **Rate limiting**: binding de rate limiting de Workers por IP (best-effort, no antiabuso estricto) + límite de tamaño de entrada (bbox, nº de puntos).
- **Presupuesto de CPU**: el plan gratuito da 10 ms de CPU por petición y 50 subrequests externas: el Worker **no** procesa geometría pesada ni hace muchas llamadas; reenvía y cachea.
- **Secretos**: `AEMET_API_KEY`, `ORS_API_KEY` con `wrangler secret`. Nunca en `wrangler.toml`.
- **Avisos**: AEMET (varios pasos: la API devuelve una URL a los datos; la clave va en cabecera) y Meteoalarm; normalizar a `Warning` (nivel, tipo, área/polígono, ventana, fuente) y deduplicar.
- **Degradación**: si AEMET falla (límite por minuto, cortes), responder con lo de Meteoalarm y un campo `partial: true`.

## 7. Estado y datos en el cliente

- Estado de aplicación con un store pequeño (Zustand o equivalente) o señales; sin Redux.
- Estado compartible en la URL (`?from=…&to=…&t=…&r=…`), sin servidor.
- IndexedDB solo para caché meteo, última ruta y recientes. `localStorage` solo para tema/idioma, siempre con `try/catch`.

## 8. Errores, observabilidad y privacidad

- Errores esperados → `Result`; inesperados → boundary de UI con mensaje útil y opción de reintentar.
- Sin analítica con cookies. Si se quiere medir uso, valorar un contador sin identificadores (p. ej. el analytics gratuito de Cloudflare Web Analytics) y documentarlo en la política de privacidad.
- Logs del Worker sin coordenadas exactas de usuarios (redondear a 0,1° o no registrar).

## 9. Testing

| Nivel | Qué | Herramienta |
|---|---|---|
| Unit | `core` completo: muestreo, ETA, rumbo, viento relativo, scoring, agregación | Vitest (≥ 90 % líneas) |
| Contrato | Adaptadores contra fixtures reales grabadas + esquemas Zod | Vitest + MSW |
| Integración | Orquestador con proveedores simulados (429, timeout, respuesta rara) | Vitest + MSW |
| E2E | Flujo origen→destino→cambiar hora→comparar, con red simulada | Playwright |
| Visual | Galería de componentes, 3 anchos × 2 temas | Playwright screenshots |
| A11y | `axe` en E2E y galería | @axe-core/playwright |
| Rendimiento | Presupuesto de bundle + Lighthouse CI | size-limit, lhci |

Una **suite "live"** opcional (manual o `workflow_dispatch`) que llama a las APIs reales para detectar cambios de contrato; nunca en cada PR.

## 10. CI/CD (GitHub Actions)

- `ci.yml` (PR y main): install con caché pnpm → `lint` → `typecheck` → `test` → `build` → `test:e2e` → size-limit → lhci.
- `deploy-web.yml` (main): build de `apps/web` → GitHub Pages (`actions/deploy-pages`). `base` de Vite configurado para el nombre del repo (o dominio propio).
- `deploy-worker.yml` (main, cambios en `apps/worker`/`packages/**`): `wrangler deploy` con `CLOUDFLARE_API_TOKEN` como secreto del repo.
- `live-contract.yml` (manual/semanal): comprueba que las APIs externas siguen respondiendo como esperan los esquemas.
- Dependabot semanal; `CODEOWNERS`; protección de `main` (CI obligatorio).
- Conventional Commits; `CHANGELOG` generado.

## 11. Seguridad

- CSP estricta en la web (meta o cabeceras a través de Cloudflare), `connect-src` limitado a los dominios de proveedores.
- Validar y acotar toda entrada del Worker (tipos, rangos, tamaños).
- Dependencias fijadas por lockfile, auditoría en CI (`pnpm audit`/OSV).
- Secretos solo en Cloudflare y GitHub Secrets.

## 12. Evolución prevista
Perfil de vehículo (v2) · motor de rutas propio en VM gratuita (si crece o cambian los términos) · malla meteo precalculada con GitHub Actions · más países vía Meteoalarm.

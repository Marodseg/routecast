# ADR-0003 — Proveedores detrás de interfaces, con fallback

- Estado: aceptada · Fecha: 2026-10-10

## Contexto
Casi todos los servicios gratuitos son demos o tienen términos que cambian (RainViewer recortó su API en 2026; el demo de OSRM no ofrece SLA ni garantías).

## Decisión
`core` y la UI dependen solo de interfaces (`RoutingProvider`, `WeatherProvider`, `WarningsProvider`, `GeocodingProvider`).
Cada adaptador valida con Zod, devuelve `Result<T, ProviderError>`, respeta límites y atribuciones de `PROVIDERS.md`.
Rutas con cadena de fallback y circuit breaker configurables.

## Consecuencias
+ Cambiar de proveedor (p. ej. a OSRM propio en VM gratuita) no toca UI ni `core`.
+ Tests con fixtures y simulación de fallos.
− Algo más de código de adaptación; es el coste de la resiliencia.

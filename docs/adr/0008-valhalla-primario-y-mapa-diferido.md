# ADR-0008 — Valhalla como proveedor primario de rutas y mapa en carga diferida

- Estado: aceptada · Fecha: 2026-10-10

## Contexto
1. ARCHITECTURE §4.1 proponía `OSRM FOSSGIS → OSRM demo → Worker (ORS)`. Al grabar fixtures reales (Málaga → Granada,
   2026-10-10) **ambos demos OSRM devolvieron una sola ruta** pese a `alternatives`; el demo de **Valhalla** (FOSSGIS)
   devolvió A-45 · A-92 y A-7 · A-44 con tiempos por maniobra. Comparar alternativas es el núcleo del producto.
2. DESIGN §8 fijaba ≤ 350 KB gzip de JS «en la carga, MapLibre incluido». MapLibre 6 pesa ≈ 286 KB gzip (más su worker
   en un Web Worker aparte).

## Decisión
- Cadena de rutas: **Valhalla (FOSSGIS) → OSRM FOSSGIS → OSRM demo** (→ ORS vía Worker en fase 4), con throttle
  ≥ 1 s y circuit breaker por proveedor que respeta `Retry-After`. El orden sigue siendo configuración
  (`apps/web/src/app/services.ts`).
- Valhalla se llama por GET con `?json=` para evitar el preflight CORS. Atribución «Valhalla (FOSSGIS)» en la UI.
- **MapLibre se carga de forma diferida** (`import()`), después de que la interfaz sea usable. Presupuestos en
  size-limit: JS inicial ≤ 120 KB gzip (hoy ≈ 66 KB), mapa diferido ≤ 300 KB gzip y worker por separado.

## Consecuencias
+ Alternativas reales en el caso estrella y en la mayoría de trayectos.
+ Primera interacción (buscar origen/destino) no espera al mapa.
− Valhalla demo es «no para producción» y sus límites no están confirmados oficialmente (PROVIDERS.md, [VERIFICAR]):
  dependemos del respaldo OSRM y, en fase 4, de ORS con clave en el Worker.
− El presupuesto de DESIGN §8 se reinterpreta como «hilo principal en la carga inicial»; el mapa llega después.

## Alternativas descartadas
- Alternativas sintéticas (rutas por puntos intermedios desplazados) sobre OSRM: duplica peticiones a un demo de
  1 req/s y produce rodeos poco naturales.
- Mantener OSRM primero: perdería la comparación de rutas en casos tan claros como el de referencia.

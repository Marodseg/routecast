# ADR-0005 — `core` puro y determinista

- Estado: aceptada · Fecha: 2026-10-10

## Contexto
El valor del proyecto está en cómo se calcula el riesgo a lo largo de una ruta. Debe ser testeable, reproducible y reutilizable en web y Worker.

## Decisión
`packages/core` no hace red, no toca DOM y no lee el reloj: recibe `departureMs`/`nowMs` y los umbrales como parámetros.
Regla de lint/dependency-cruiser impide importar `providers` o APIs de navegador desde `core`. Los umbrales viven en un único archivo documentado.

## Consecuencias
+ Tests rápidos y deterministas, tests de propiedades, cobertura alta.
+ Recalcular al cambiar la hora de salida es instantáneo y sin red.
− Hay que pasar explícitamente los datos (coste mínimo frente al beneficio).

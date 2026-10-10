# ADR-0007 — Solid para la UI, CSS Modules y componentes accesibles propios

- Estado: aceptada · Fecha: 2026-10-10

## Contexto
ADR-0001 fijó Vite + TypeScript pero no el modelo de componentes. Restricciones: presupuesto de 350 KB gzip de JS
incluyendo MapLibre (que por sí solo se lleva la mayor parte), animaciones a 60 fps en el DeparturePicker mientras se
arrastra, recálculo en < 100 ms al mover la hora (SPEC §5) y ARCHITECTURE §7 («store pequeño o señales, sin Redux»).

## Decisión
- **Solid** (`solid-js` + `vite-plugin-solid`): señales de grano fino, sin DOM virtual; ≈ 7 KB gzip. Al mover el dial
  solo se actualizan los nodos que dependen de la hora.
- **CSS Modules** + variables CSS generadas desde los tokens (`virtual:tokens.css`); `@layer` y container queries.
- **Componentes accesibles propios** siguiendo los patrones ARIA (slider, combobox 1.2, radiogroup, `<details>`),
  con tests unitarios (Vitest + `@solidjs/testing-library`, jsdom) y E2E con axe. Si un patrón se complica (p. ej.
  diálogos modales), se evaluará Kobalte o Ark UI (headless) en otra ADR.
- `exactOptionalPropertyTypes` desactivado solo en `apps/web` por incompatibilidad con los tipos JSX de Solid; sigue
  activo en `core`, `shared` y `providers`.

## Consecuencias
+ JS de la app en fase 1: ≈ 12 KB gzip; margen amplio para MapLibre.
+ Reactividad sin re-render: el dial y la cinta de ruta se recolorean sin trabajo extra.
− Ecosistema más pequeño que React; menos librerías listas (mitigado: casi toda la UI es propia por diseño).
− Las primitivas accesibles propias exigen disciplina de tests (ya en CI).

## Alternativas descartadas
- **React/Preact + Radix**: Radix solo existe para React (preact/compat añade peso y fricción); React ~45 KB gzip.
- **Svelte 5**: opción válida y ligera; se descarta por homogeneidad TS/JSX con el resto del monorepo y por el modelo
  de señales explícito de Solid, más cercano a «core puro + datos inyectados».
- **Vanilla + Web Components (Lit)**: más código para estado reactivo y peor ergonomía con TS estricto.

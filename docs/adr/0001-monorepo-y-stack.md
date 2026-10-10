# ADR-0001 — Monorepo pnpm y stack TypeScript

- Estado: aceptada · Fecha: 2026-10-10

## Contexto
Proyecto con web, Worker y lógica compartida. Se quiere calidad profesional, coste 0 € y una base que Claude Code pueda mantener con seguridad.

## Decisión
Monorepo con **pnpm workspaces**; **TypeScript strict**; **Vite** (web); **Hono** (Worker); **Zod** para validar datos externos;
**Vitest** y **Playwright**; **Biome** para lint y formato; **GitHub Actions**; **Wrangler**.

## Consecuencias
+ Tipos y esquemas compartidos entre web y Worker; una sola toolchain.
+ Biome es rápido y reduce configuración frente a ESLint+Prettier.
− Más estructura inicial que un único paquete (compensa por la separación `core`/`providers`).

## Alternativas descartadas
Next.js/SSR (innecesario con hosting estático), Turborepo/Nx (sobredimensionado para 5 paquetes), ESLint+Prettier (más piezas).

## Plantilla para futuras ADRs
`Estado · Fecha` / Contexto / Decisión / Consecuencias / Alternativas descartadas.

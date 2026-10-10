# ADR-0006 — Dirección visual «Instrumento» con cartografía de «Carta»

- Estado: aceptada · Fecha: 2026-10-10

## Contexto
DESIGN.md pide identidad propia, que no parezca generada por IA, con dos elementos firma (DeparturePicker y RoadWind).
En la fase 1 se prototiparon dos direcciones sobre la misma pantalla (`design/prototypes/`): **A «Carta»** (carta
náutica impresa, cinta horizontal) y **B «Instrumento»** (instrumento de campo, dial en arco). Ambas pasaron axe,
escala de grises y 375/768/1280 en claro y oscuro. La autocrítica está en `design/prototypes/README.md`.

## Decisión
Base **B «Instrumento»** con la **cartografía de A** (relieve en curvas de nivel, topónimos en cursiva, borde de tinta
en la cinta de ruta):

- **Tipografía**: Familjen Grotesk (titulares y topónimos, con cursiva), Geist (texto), Geist Mono (todas las cifras).
  Autoalojadas con Fontsource (OFL-1.1).
- **Color** (OKLCH, `packages/shared/src/design/tokens.ts`): neutros cálidos piedra/tinta; acento **verde baliza**;
  riesgo gris frío → amarillo → naranja → rojo, cada nivel con patrón (liso, puntos, rayado, rayado cruzado) y forma de
  icono propia. El acento verde no compite con la escala de riesgo cálida.
- **Forma**: radios 0/3/8 px; filetes de 1 px; marcas de registro en las esquinas (`.plate`); elevación solo en paneles
  flotantes sobre el mapa.
- **DeparturePicker**: dial en arco (30° por hora) con aguja fija y una banda de riesgo por ruta.
- **RoadWind**: brújula con carretera, viento y componente cruzada resaltada.

## Consecuencias
+ Escala de riesgo convencional (curva de aprendizaje nula) y sin conflicto con el acento.
+ Comparador denso y legible (tres cifras + perfil por km), coherente con «sin nota opaca» (SPEC §6.4).
+ Fuentes ligeras (≈ 70 KB latinas en total).
+ Contraste AA, gama sRGB y distinguibilidad con protanopía/deuteranopía/tritanopía (ΔE_ok ≥ 0,1) comprobados en tests.
− Riesgo de «dashboard técnico» si se abusa de mayúsculas mono: la voz editorial (copy concreto, topónimos en cursiva)
  es parte de la dirección y se revisa en cada PR de UI.
− El dial ocupa más alto que una cinta horizontal en móvil (~210 px).

## Alternativas descartadas
- **A «Carta» completa**: muy buena identidad, pero el acento ámbar convive mal con la escala de riesgo cálida y su
  ornamentación (mar rayado, cursivas por todas partes) carga el mapa en pantallas pequeñas.
- **A con dial de B**: mezcla dos lenguajes de forma (radios y chasis) sin ganar claridad.

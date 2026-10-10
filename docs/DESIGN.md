# DESIGN — Routecast

Objetivo: una interfaz con identidad propia, moderna y cuidada, que **no parezca generada por IA**, responsive de verdad,
con animación con propósito y componentes memorables. Este documento manda sobre cualquier decisión visual.

> Las elecciones concretas (fuentes, paleta, formas) son una **dirección inicial**. La fase 1 las valida con
> prototipos reales en el navegador y pueden ajustarse; lo que no se negocia son los principios y el checklist anti-"look IA".

## 1. Concepto

**"Instrumento cartográfico-meteorológico"**: la sensación de una carta náutica / instrumento de precisión con
tipografía editorial, no la de una app SaaS genérica. El mapa es el protagonista; la interfaz flota sobre él como un
panel de instrumentos, con datos presentados como **lecturas** (números tabulares, brújulas, perfiles), no como tarjetas decorativas.

Palabras guía: preciso · calmado · táctil · editorial · confiable.
Anti-palabras: brillante · "futurista" genérico · decorativo · ruidoso.

## 2. Checklist anti-"look IA" (obligatorio revisar en cada PR de UI)

- [ ] **Sin** degradados morado→azul, sin blobs difusos, sin "glow" neón de fondo.
- [ ] **Sin** rejilla de tarjetas idénticas con icono emoji + título + frase. Cada bloque tiene jerarquía propia.
- [ ] **Sin** iconos emoji como UI. Iconografía propia o de una familia coherente (Phosphor / Lucide con trazo ajustado) y pictogramas meteorológicos a medida.
- [ ] **Sin** glassmorphism por defecto. Si se usa blur, solo en el panel flotante sobre mapa y con razón funcional.
- [ ] **Sin** esquinas redondeadas uniformes a 12-16 px en todo. Sistema de radios intencionado (p. ej. 2/6/14 px según jerarquía).
- [ ] **Sin** Inter/Roboto/system-ui como única tipografía. Tipografía con carácter + mono tabular para cifras.
- [ ] **Sin** textos de relleno tipo "Descubre", "Potencia tu viaje", "Powered by AI". Copy concreto y sobrio.
- [ ] **Sin** sombras suaves genéricas apiladas. Elevación por contraste, filetes (hairlines) y capas, no por sombra difusa.
- [ ] Hay al menos **un elemento firma** reconocible (ver §6) que no se ve en otras apps.
- [ ] La captura en escala de grises sigue siendo legible y con jerarquía clara.

## 3. Tokens (fuente única en `packages/shared/src/design/tokens.ts` → CSS variables)

### 3.1 Tipografía (dirección inicial; todas con licencia libre y **autoalojadas** vía Fontsource, sin CDN de Google)
- **Display/titulares**: una grotesca con personalidad (candidatas: *Bricolage Grotesque*, *Familjen Grotesk*, *Hanken Grotesk* en pesos altos). Elegir tras probar en prototipo.
- **Texto**: una sans legible de apoyo (candidatas: *Instrument Sans*, *Geist*).
- **Cifras y datos**: mono con numerales tabulares (candidatas: *Geist Mono*, *JetBrains Mono*). Toda hora, km, km/h y mm/h va en mono tabular.
- Escala modular (≈1.2), `clamp()` fluido, `text-wrap: balance` en titulares, `font-variant-numeric: tabular-nums` en datos.
- Variable fonts, `font-display: swap`, subconjunto latino, precarga solo de la fuente crítica.

### 3.2 Color (en OKLCH, tema claro y oscuro, ambos de primera clase)
- Base neutra **cálida** (no gris azulado de plantilla), con papel/tinta en claro y "carta nocturna" en oscuro.
- Un **acento** propio (propuesta: tono naranja-ámbar de baliza/señalización, no azul ni morado) para acción primaria y selección.
- **Escala de riesgo** de 4 niveles (0-3) perceptualmente uniforme y **segura para daltonismo** (probar con simuladores). Cada nivel con color + **patrón/forma + icono**; nunca solo color.
- Contraste AA mínimo en texto, AAA en cifras críticas. Variables CSS semánticas (`--risk-2-fill`, `--surface-raised`…), no hex sueltos.

### 3.3 Forma, espacio y elevación
- Rejilla de 4 px, espaciado en escala. Radios 2/6/14. Filetes de 1 px (hairlines) como protagonista.
- Elevación por capas y contraste; sombra solo para el panel flotante sobre mapa.

### 3.4 Movimiento (ver §5)

## 4. Componentes (galería viva en `/dev/gallery`, sin Storybook)

Cada componente: estados (reposo, hover, foco, activo, deshabilitado, carga, error), variantes de tema, tamaños móvil/escritorio,
accesible por teclado, con test de renderizado y captura de regresión visual.

| Componente | Descripción |
|---|---|
| **DeparturePicker** (firma) | Regla horizontal arrastrable tipo "dial/cinta" con marcas por hora y banda de riesgo detrás; arrastrar cambia la hora y la ruta se repinta en vivo. Háptico en móvil (si disponible) |
| **RouteRibbon** | La ruta en el mapa como cinta con gradiente discreto por riesgo y marcas de hora/ETA cada ~50 km; los puntos críticos son "chinchetas" con valores |
| **RiskProfile** | Perfil a lo largo del km (como un perfil de altitud) con el riesgo como relieve; cursor sincronizado con el mapa |
| **WindRose / RoadWind** (firma) | Mini-brújula que dibuja **el rumbo de la carretera y el vector de viento**, resaltando la componente cruzada. Se entiende de un vistazo sin leer números |
| **RouteCard / Compare** | Tres lecturas (duración, peor punto, km en riesgo) con barras comparativas entre rutas; sin puntuación opaca |
| **CommandSearch** | Buscador origen/destino estilo command palette: teclado, sugerencias con resaltado, recientes locales |
| **BottomSheet** (móvil) | Hoja con puntos de anclaje (peek/half/full), gestos con inercia, `inert` en el fondo cuando está abierta |
| **Legend / RiskChip** | Chips de nivel con icono + patrón + etiqueta; leyenda plegable |
| **Alerts strip** | Banda de avisos oficiales (AEMET/Meteoalarm) con nivel, ventana temporal y tramo afectado |
| **Skeletons / EmptyStates / Toasts** | Con voz propia, concretos y útiles |
| **ThemeToggle, LangToggle** | Sin jerga; persisten en `localStorage` con `try/catch` |

## 5. Animación (con propósito)

Principio: **el movimiento explica cambios de estado**, no decora.

- Librería: **Motion** (motion.dev, ligera) o Web Animations API + CSS; `View Transitions API` para cambios de vista cuando el navegador lo soporte, con fallback sin animación.
- Momentos clave:
  1. **Trazado de rutas**: se "dibujan" siguiendo el camino (stroke-dashoffset / `line-progress`) al llegar los resultados.
  2. **Cambio de hora de salida**: la cinta recolorea con interpolación suave; los números cambian con *odometer*/contador tabular.
  3. **Foco de ruta**: al seleccionar una ruta, las demás se atenúan y la cámara encuadra con `fitBounds` suave.
  4. **Bottom sheet**: física de resorte, sin rebote exagerado.
  5. **Entradas escalonadas** sutiles en listas (< 40 ms de retardo entre elementos).
- Duraciones 120-320 ms; easings propios (nada de `ease-in-out` por defecto); sin parallax ni animaciones en bucle que distraigan.
- **`prefers-reduced-motion`**: se sustituye por fundidos instantáneos/cortos; ninguna información depende de la animación.
- Presupuesto: 60 fps en móvil medio; animar solo `transform`/`opacity`; sin layout thrash.

## 6. Elementos firma (lo que hará que no parezca una plantilla)

1. **DeparturePicker en forma de cinta/dial** con la banda de riesgo detrás (no un `<input type=range>` estándar).
2. **RoadWind**: la brújula que relaciona rumbo de carretera y viento.
3. **Ruta como cinta cartográfica** con marcas de hora, estilo carta náutica, más que línea de GPS.
4. **Voz editorial**: microcopy sobrio y concreto ("Racha cruzada de 62 km/h a las 17:10 cerca de Antequera").

## 7. Responsive

- Móvil primero (≥ 360 px). Breakpoints por contenido, no por dispositivo; `container queries` en componentes.
- **Móvil**: mapa a pantalla completa + `BottomSheet` con tres anclajes; controles al alcance del pulgar; áreas táctiles ≥ 44 px.
- **Tablet/escritorio**: panel lateral izquierdo (resultados) + mapa; `RiskProfile` anclado abajo; atajos de teclado.
- Safe areas (`env(safe-area-inset-*)`), `100dvh`, sin scroll horizontal, orientación horizontal contemplada.
- Pruebas visuales en 375, 768, 1280 y 1920 px, claro/oscuro.

## 8. Rendimiento visual

- Presupuesto inicial: **≤ 350 KB gzip de JS** en la carga (MapLibre incluido), carga diferida de gráficos/galería.
- LCP < 2,5 s en 4G; CLS ≈ 0 (reservar espacio de mapa y sheet); INP < 200 ms.
- Fuentes subconjunto + variables; iconos SVG como sprite o importación por icono; sin imágenes pesadas.
- Estilo del mapa: usar un estilo de OpenFreeMap **recoloreado** a la paleta del proyecto (no el estilo por defecto sin tocar).

## 9. Implementación y proceso

- CSS moderno: variables, `@layer`, `color-mix()`, `:has()`, container queries. **CSS Modules o vanilla-extract/UnoCSS**; evitar una
  librería de componentes con apariencia reconocible. Si se usan primitivas accesibles sin estilo, **Radix Primitives** o **Ark UI**/**Base UI** (headless) para foco, ARIA y teclado.
- No usar plantillas de UI ni kits tipo "shadcn por defecto" sin rediseñarlos a estos tokens.
- Galería interna `/dev/gallery` con todos los componentes y estados. Pruebas de **regresión visual** con Playwright (`toHaveScreenshot`) en 3 anchos y 2 temas.
- Auditorías: `axe` en Playwright, Lighthouse CI en PRs, revisión manual con lector de pantalla en flujos clave.
- Bucle de diseño para Claude Code: implementar → capturas con Playwright (móvil/escritorio, claro/oscuro) → autocrítica contra el checklist de §2 → iterar. Usar el subagente `ui-designer`.
- Si el skill `frontend-design` está disponible en la sesión de Claude Code, cargarlo antes de crear componentes visuales.

## 10. Criterios de aceptación de diseño

- Pasa el checklist de §2 sin excepciones justificadas por escrito.
- Los dos elementos firma (DeparturePicker y RoadWind) están implementados y funcionan con teclado y táctil.
- Claro y oscuro pulidos; contraste AA verificado; daltonismo verificado con simulación.
- Sin saltos de layout; animaciones a 60 fps; `prefers-reduced-motion` respetado.
- Lighthouse móvil: rendimiento ≥ 90, accesibilidad ≥ 95, mejores prácticas ≥ 95.
- Una persona ajena al proyecto, al ver 3 capturas, no las identifica como "otra app hecha con IA" (prueba informal con 3 personas).

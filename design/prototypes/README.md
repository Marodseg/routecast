# Prototipos de dirección visual (fase 1)

Dos direcciones para la misma pantalla —mapa + panel + `DeparturePicker` + `RoadWind`— con datos **ficticios**
(Málaga → Granada, tres rutas). HTML autocontenido, sin build: abre `a-carta.html` o `b-instrumento.html` en el navegador.
Arrastra el selector de hora, usa ← → / Re Pág / Av Pág, pulsa una ruta y prueba el botón de tema.

Capturas (375/768/1280 × claro/oscuro + escala de grises a 1280):

```sh
pnpm --filter @routecast/web exec node scripts/capture-prototypes.mjs   # → design/prototypes/shots/ (no versionado)
```

Comprobado en ambas: sin errores de consola, sin scroll horizontal, `axe` sin violaciones (claro/oscuro, 375/1280),
legibles en escala de grises (niveles distinguibles por patrón), `prefers-reduced-motion` respetado.

## A · «Carta»

Carta náutica impresa: papel cálido, tinta, filetes de 1 px, relieve en curvas de nivel, mar rayado, topónimos en cursiva.

- **Tipografía**: Bricolage Grotesque (titulares, eje óptico) · Instrument Sans (texto) · JetBrains Mono (cifras).
- **Color**: papel `oklch(0.965 0.014 84)` / tinta `oklch(0.23 0.025 55)`; acento ámbar de baliza. Oscuro = «carta nocturna» marrón-negra.
- **Riesgo**: pizarra → ocre (puntos) → bermellón (rayado) → berenjena (rayado cruzado). Evita el ámbar del acento.
- **Radios** 2/6/14 · **elevación** solo en la cinta flotante.
- **DeparturePicker**: cinta horizontal con aguja fija; detrás, una banda de riesgo por ruta (A/B/C) hora a hora.

**Autocrítica**
- ✔ Identidad editorial clara; el panel se lee como una carta, no como un SaaS. Muy buena en escala de grises.
- ✔ La cinta comunica «cuándo salir» para las tres rutas a la vez.
- ✘ El acento ámbar convive con la escala de riesgo cálida: hay que usarlo con mucha disciplina (solo aguja y «ahora»).
- ✘ Más ornamental (mar rayado, cursivas): en pantallas pequeñas el mapa se carga antes.
- ✘ Bricolage pesa 130 KB con todos los ejes; habría que subsetear a `wght`+`opsz`.

## B · «Instrumento»

Instrumento de campo: chasis con marcas de registro en las esquinas, lecturas grandes en mono, fila seleccionada invertida.

- **Tipografía**: Familjen Grotesk (titulares) · Geist (texto) · Geist Mono (cifras).
- **Color**: piedra `oklch(0.93 0.007 80)` / superficie casi blanca / tinta; acento **verde baliza** `oklch(0.55 0.12 160)`.
- **Riesgo**: gris frío → amarillo (puntos) → naranja (rayado) → rojo (rayado cruzado). Convención universal; el acento verde no compite.
- **Radios** 0/3/8 · **elevación** solo en panel flotante y dial.
- **DeparturePicker**: dial en arco (30° por hora) con aguja verde fija; tres bandas concéntricas por ruta.
- Extra: perfil de riesgo por kilómetro en cada fila del comparador (anticipa `RiskProfile`).

**Autocrítica**
- ✔ Más funcional y denso: comparador tabular + perfil por km se entiende de un vistazo. El dial es muy memorable.
- ✔ Escala de riesgo convencional (amarillo/naranja/rojo) → curva de aprendizaje cero.
- ✔ Fuentes ligeras (≈ 70 KB las tres).
- ✘ Riesgo de parecer «dashboard técnico» si se abusa de mayúsculas mono; vigilar la voz editorial.
- ✘ El dial ocupa más alto que la cinta en móvil (≈ 210 px frente a ≈ 150 px).

## Recomendación

**B**, incorporando de A la cartografía con relieve y la tipografía de titular más expresiva en el nombre de los lugares.
Motivos: escala de riesgo sin conflicto con el acento, comparador más útil, dial como elemento firma más distintivo,
menor peso de fuentes. La elección final se registra en `docs/adr/0006-direccion-visual.md`.

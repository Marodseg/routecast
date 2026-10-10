# SPEC — Routecast

Estado: v0.1 · Fecha: 2026-10-10

## 1. Objetivo

Ayudar a decidir **por dónde ir y cuándo salir** en un viaje en coche, mostrando el tiempo previsto **en cada punto de la
ruta a la hora a la que el usuario pasará por él**, y comparando rutas alternativas.

Caso estrella: "Por la A-92 hay rachas de 80 km/h sobre las 17:00 y por la A-44 no; sal ahora o espera 2 h".

## 2. Alcance

### Dentro (v1)
- Búsqueda de origen/destino (autocompletado) y selección en mapa.
- 1-3 rutas alternativas en coche.
- Muestreo de cada ruta, ETA por punto y previsión horaria para esa hora.
- Puntuación de riesgo por tramo y por ruta, con explicación legible.
- Selector de **hora de salida** (ahora, +1 h, +2 h… o fecha/hora concreta dentro del horizonte de previsión).
- Avisos oficiales (AEMET/Meteoalarm) que intersectan la ruta en su ventana temporal.
- ES/EN, responsive, accesible. Instalable como PWA (fase 4).

### Fuera (no-objetivos)
- Navegación giro a giro, tráfico en tiempo real, peajes.
- Radar en directo / nowcasting (no hay opción gratuita fiable en 2026; ver `PROVIDERS.md`).
- Cuentas de usuario, backend con base de datos, monetización.
- Otros modos de transporte (a pie, bici, camión) — posible v2.

## 3. Usuarios y escenarios

1. **Viaje corto-medio (100-500 km)** con una ruta principal y una alternativa. Quiere saber si merece la pena desviarse.
2. **Viaje largo (> 500 km)** que cruza varias zonas. Quiere saber en qué tramo pillará lo peor y si puede cambiar la hora.
3. **Viaje con remolque/caravana/moto**: sensible al viento cruzado. (Umbrales configurables por perfil en v2.)

## 4. Requisitos funcionales

| ID | Requisito | Prioridad |
|---|---|---|
| F1 | Geocodificar texto → coordenadas con sugerencias (Photon) | Must |
| F2 | Obtener hasta 3 rutas alternativas (`RoutingProvider`) | Must |
| F3 | Muestrear ruta cada ~25 km y siempre origen/destino y cambios de rumbo > 45° | Must |
| F4 | Calcular ETA por punto sumando duración acumulada desde la hora de salida | Must |
| F5 | Pedir previsión horaria en lote por celdas de 0,1° y consolidar (deduplicar) | Must |
| F6 | Calcular viento cruzado/frontal usando el rumbo local del tramo | Must |
| F7 | Calcular riesgo por punto (§6), por tramo y por ruta, con explicación | Must |
| F8 | Pintar ruta coloreada por riesgo + icono/patrón (no solo color) | Must |
| F9 | Comparador de rutas: tiempo total, peor punto, resumen de riesgos | Must |
| F10 | Selector de hora de salida con recalculo instantáneo desde caché | Must |
| F11 | Avisos oficiales intersectando ruta × ventana temporal (Worker) | Should |
| F12 | Fallback de proveedor de rutas ante 429/5xx/timeout | Should |
| F13 | Estados de degradación visibles ("sin datos de viento en este tramo") | Must |
| F14 | Compartir ruta por URL (estado en query string, sin servidor) | Should |
| F15 | PWA offline-shell + última ruta en IndexedDB | Could |

## 5. Requisitos no funcionales

- **Coste 0 €** y cumplimiento de términos (ver `PROVIDERS.md`). Sin monetización.
- **Rendimiento**: primera respuesta útil < 4 s en 4G para una ruta de 400 km; recalcular al mover el selector de hora < 100 ms (todo desde caché, sin red).
- **Resiliencia**: la app funciona (degradada) si cae cualquier proveedor excepto el de rutas.
- **Privacidad**: sin cuentas ni analítica con cookies. Las coordenadas viajan solo a los proveedores necesarios. Política de privacidad breve en la web.
- **Accesibilidad**: WCAG 2.2 AA objetivo. Navegable por teclado, lectores de pantalla (resumen textual de cada ruta).
- **Calidad**: cobertura de `core` ≥ 90 % líneas; CI obligatorio; sin `any` implícito.

## 6. Modelo de riesgo (valores INICIALES, a calibrar)

> Estos umbrales son un punto de partida razonable, **no** verdad científica ni normativa. Deben vivir en un único
> archivo de configuración (`packages/core/src/scoring/thresholds.ts`), documentados y cubiertos por tests.
> El subagente `scoring-reviewer` los revisa. Cualquier cambio → ADR o nota en el PR.

### 6.1 Variables por punto y hora (Open-Meteo, `timezone=UTC`)

`precipitation` (mm/h), `rain`, `snowfall`, `weather_code` (WMO), `wind_speed_10m`, `wind_gusts_10m`,
`wind_direction_10m` (grados, **de dónde viene**), `temperature_2m`, `visibility`, `cape`, `lightning_potential`
(si el modelo la ofrece; puede ser nula fuera de ciertos modelos), `freezing_level_height` (opcional).

Para cada punto, tomar el **valor más desfavorable en una ventana de ±30 min** respecto a la ETA (precipitación y rachas: máximo; visibilidad: mínimo).

### 6.2 Viento relativo a la carretera

Sea `h` el rumbo de la ruta en ese punto (grados 0-360, hacia dónde se circula) y `d` la dirección **desde** la que sopla el viento.
Ángulo relativo `θ = d − h`.

- Componente frontal/trasera: `v · cos θ` (positiva = viento de cara).
- Componente cruzada: `v · |sin θ|`.
- Para el scoring se usa la **racha cruzada** = `gusts · |sin θ|`.

El rumbo `h` se calcula con la geometría suavizada (media de rumbos de segmentos en ±2 km) para evitar ruido en curvas.

### 6.3 Puntuación

Cada factor produce un nivel 0-3 (0 = sin riesgo, 1 = precaución, 2 = alto, 3 = severo). El riesgo del punto es el **máximo** de los
niveles, más un pequeño incremento si coinciden ≥ 2 factores en nivel ≥ 2 (acotado a 3). El factor determinante se guarda para explicar.

| Factor | Nivel 1 | Nivel 2 | Nivel 3 |
|---|---|---|---|
| Lluvia (mm/h) | ≥ 2,5 | ≥ 7,5 | ≥ 20 |
| Racha cruzada (km/h) | ≥ 40 | ≥ 60 | ≥ 80 |
| Racha total (km/h) | ≥ 60 | ≥ 80 | ≥ 100 |
| Nieve (cm/h) | > 0 | ≥ 0,5 | ≥ 2 |
| Hielo posible | T ≤ 2 °C con precip. | `weather_code` 56/57/66/67 | — |
| Visibilidad (m) | < 1000 | < 400 | < 100 |
| Tormenta | códigos 95 | códigos 96/99 (con granizo) o CAPE alto + `lightning_potential` alto (solo si el modelo lo da; ver PROVIDERS) | — |

Detalles de implementación (fase 2, revisados con `scoring-reviewer`):
- La ventana ±30 min respeta la semántica de Open-Meteo: lluvia, nieve y rachas son agregados de la hora anterior al
  sello, así que entran los sellos cuyo intervalo solapa la ventana; el resto son instantáneos. Cada hora se puntúa por
  separado (racha cruzada = racha × |sen θ| con la dirección de la misma ventana) y el punto toma la peor hora.
- El incremento por coincidencia se calcula dentro de la misma hora y por **grupos independientes**: racha y racha
  cruzada cuentan como uno (misma medida); lluvia, nieve y visibilidad también (correlacionadas en el modelo).
- Factores esenciales: lluvia, racha y viento cruzado. Si falta uno y lo conocido es 0 → `unknown`. Si falta uno
  secundario (p. ej. visibilidad) → nivel 0 «parcial» y la UI lo indica.
- Un tramo con un extremo en 0 y otro sin datos es `unknown`; con un extremo ≥ 1 hereda ese nivel.
- `kmAtLevel2Plus` es conservador (un punto en nivel 2 tiñe los dos tramos vecinos): la UI lo presenta como
  «hasta X km», no como medida exacta.

Reglas de honestidad:
- Códigos 96/99 y combinación CAPE/rayos significan **"riesgo de tormenta con granizo"**, nunca "granizará".
- Si una variable falta, no se asume 0: el factor queda `unknown` y la UI lo indica.
- La previsión a más de ~48 h se marca con menor confianza.

### 6.4 Agregación

- **Tramo** = intervalo entre muestras consecutivas; hereda el máximo de sus extremos.
- **Ruta** = `{ worstLevel, worstPoint, minutesAtLevel2Plus, kmAtLevel2Plus, dominantFactor }`.
- **Comparador**: ordenar por (`worstLevel` asc, `kmAtLevel2Plus` asc, duración asc) y mostrar los tres números, no una nota opaca.

## 7. UX

### Pantallas / estados
1. **Inicio**: mapa a pantalla completa, buscador origen/destino, hora de salida (por defecto "ahora").
2. **Resultados**: hasta 3 rutas como tarjetas (duración, km, peor tramo, icono del factor dominante) + mapa con rutas coloreadas.
3. **Detalle de ruta**: línea de tiempo/perfil con riesgo a lo largo del km, lista de puntos críticos con hora, causa y valores.
4. **Estados vacío/error/parcial**: proveedor caído, sin cobertura de avisos, previsión fuera de horizonte, 429.

### Principios
- El **deslizador de hora de salida** es la interacción principal: mover y ver cambiar las rutas en vivo.
- Colores + iconos + texto (daltónicos). Leyenda siempre visible.
- Texto claro: "17:10 · A-92 km 41 · rachas 78 km/h (viento cruzado 62 km/h)".
- Atribuciones en pie, siempre visibles (§ PROVIDERS).

## 8. Criterios de aceptación globales (v1)

- Dado un origen y destino en España, se muestran ≥ 1 ruta y, si el motor las ofrece, hasta 3, en < 4 s (red normal).
- Cambiar la hora de salida no hace nuevas peticiones si los datos ya están en caché dentro del horizonte.
- Con Open-Meteo caído, la app lo comunica y no se rompe.
- Con el Worker caído, la app funciona sin avisos oficiales y lo indica.
- Tests: scoring, ETA, viento relativo y muestreo con casos límite (ruta de 5 km, 1.500 km, cruce del antimeridiano no aplica en España pero el muestreo no debe asumir hemisferio).
- Lighthouse móvil ≥ 90 en rendimiento y ≥ 95 en accesibilidad.
- README con capturas, arquitectura y limitaciones honestas.

## 9. Preguntas abiertas

1. ¿Nombre definitivo?
2. ¿Perfil de vehículo (moto/caravana) en v1 o v2? (Propuesta: v2.)
3. ¿Mostrar avisos de AEMET y Meteoalarm por separado o fusionados? (Propuesta: fusionados, deduplicados por área/ventana.)
4. ¿Heatmap de riesgo en mapa además de la ruta coloreada? (Propuesta: no en v1.)

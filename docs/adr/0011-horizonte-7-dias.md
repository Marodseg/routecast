# ADR-0011 — Horizonte de salida de 7 días (día + hora)

- Estado: aceptada · Fecha: 2026-10-11

## Contexto
La salida solo podía elegirse dentro de las próximas 48 h (`HORIZON_MIN`), porque la previsión horaria es fiable más o
menos hasta ahí (SPEC §6.3). Pero un viaje se planifica con días de antelación, y Open-Meteo da 7 días de serie horaria
por defecto (máximo 16) sin coste extra apreciable en la cuota (PROVIDERS.md).

## Decisión
- Se piden `forecast_days=7` y la salida puede ser **hoy o cualquiera de los seis días siguientes**. El fin del horizonte
  es lo primero que llegue de estos dos: el último paso de 10 min del día local «hoy + 6», o el último sello de la serie
  UTC (`apps/web/src/app/time.ts`).
- El día se elige en una fila dentro del `DeparturePicker`, no con un `<input type="date">`. El dial sigue eligiendo la hora.
- A partir del día que cruza las 48 h, la previsión se presenta como **orientativa**:
  - en la fila, con «≈», una raya discontinua y el texto accesible;
  - en una nota visible bajo la fila;
  - en la nota de confianza baja del core.
- Avisos oficiales: con una salida a más de 48 h, una lista vacía no se presenta como «sin avisos». Se explica que aún
  no suelen publicarse.
- Caché: una serie guardada solo vale si llega al fin del horizonte. Si no llega, se vuelve a pedir, y se usa como
  respaldo si la petición falla.
- Las bandas del dial (peor nivel por hora de salida, unas 170 horas por ruta) se calculan a trozos de unos 12 ms, primero
  las horas visibles, para no bloquear el hilo principal.

## Consecuencias
+ Se puede planificar un viaje con días de antelación y comparar rutas por día y hora.
− Respuestas de Open-Meteo unas 2,2 veces mayores.
− Más cálculo en las bandas: se reparte en trozos y `hoursAround` usa búsqueda binaria.
− A partir del día 3-4, `best_match` usa modelos globales y la calidad cae. Por eso la UI lo marca como orientativo y
  nunca lo presenta como certeza.
− En el último día, las salidas tardías de rutas largas quedan en parte fuera de la serie y salen «sin datos» (honesto:
  no se extrapola).

## Alternativas descartadas
- Mantener 48 h: no sirve para planificar.
- 16 días: la calidad horaria a más de una semana no aporta para decidir una ruta y la respuesta crece mucho más.

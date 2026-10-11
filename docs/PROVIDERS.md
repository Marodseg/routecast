# PROVIDERS — límites, términos y notas

Última verificación: **2026-10-11** (búsqueda web). Estos datos cambian. Antes de añadir o modificar una llamada externa,
usa el subagente `provider-auditor` y actualiza este archivo con fecha y fuente. Lo marcado **[VERIFICAR]** no está confirmado.

Contexto de uso: proyecto personal/portfolio **sin monetización**. Si eso cambia, casi todo lo gratuito deja de valer (ver ADR-0004).

## Resumen

| Servicio | Uso | ¿Clave? | Límite gratuito | Condiciones clave |
|---|---|---|---|---|
| Open-Meteo | Previsión horaria | No | 600/min, 5.000/h, 10.000/día (por IP); 300.000/mes publicado pero sin aplicar (Pricing, 2026-10-11) | **No comercial**, atribución CC-BY; CORS abierto |
| OSRM demo | Rutas + alternativas | No | ~1 req/s, sin SLA | No comercial, User-Agent válido, atribución OSRM/OSM (ODbL) |
| Valhalla demo (FOSSGIS) | Rutas (primario: alternativas reales) | No | Uso justo; ~1 req/s por IP y 100 req/s globales **[NO CONFIRMADO, fuente secundaria]** | Uso razonable no comercial; sin SLA; sin cabecera obligatoria conocida |
| OpenRouteService | Rutas (fallback vía Worker) | Sí | Directions 2.000/día, 40/min | No comercial; clave solo en Worker |
| GraphHopper | No usar de entrada | Sí | 500 créditos/día, 5 puntos | No comercial; demasiado limitado |
| AEMET OpenData | Avisos/predicción España | Sí (gratuita) | Sin cifra oficial legible; 50/min según fuente secundaria **[VERIFICAR]** | Citar «Fuente: AEMET» o «© AEMET»; no desnaturalizar; clave solo en Worker; caídas intermitentes |
| Meteoalarm | Avisos Europa | No (feeds/API pública) | No publicado **[VERIFICAR]** | Datos CC-BY (EUMETNET) |
| MET Norway (Locationforecast) | Previsión alternativa | No | "Buena capacidad", sin cifra | User-Agent identificable obligatorio; sin SLA |
| Photon (komoot) | Geocodificación/autocompletado | No | Uso razonable, se limita si se abusa | Sin garantías |
| Nominatim (OSM) | Geocodificación puntual | No | 1 req/s | **Prohibido autocompletado**; User-Agent obligatorio; cachear |
| OpenFreeMap | Teselas vectoriales | No | Sin límites declarados | Atribución OSM/OpenMapTiles; sin búsqueda ni rutas |
| RainViewer | Radar | No | 100 req/IP/min, zoom ≤ 7, sin nowcast | Solo personal/educativo; **recortado en 2026** |
| Cloudflare Workers (free) | Backend fino | — | 100.000 req/día, 10 ms CPU, 50 subrequests externas | Ver abajo |

## Detalles por servicio

### Open-Meteo
- Endpoint: `https://api.open-meteo.com/v1/forecast`. Variables útiles: `precipitation`, `rain`, `snowfall`, `weather_code`, `wind_speed_10m`, `wind_gusts_10m`, `wind_direction_10m`, `temperature_2m`, `visibility`, `cape`, `lightning_potential`, `freezing_level_height`.
- Modelos relevantes: `best_match` por defecto; para España conviene comparar `meteofrance_arome_france_hd` (solo Francia), `icon_eu`, `ecmwf_ifs025`. Cobertura de modelos de alta resolución sobre España **[VERIFICAR]** antes de fijar el modelo.
- `lightning_potential` y otras variables pueden venir `null` según modelo.
- **Semántica temporal (verificado en open-meteo.com/en/docs, 2026-10-10)**: casi todas las variables horarias son
  **instantáneas** en el sello. Excepciones: `precipitation`, `rain`, `showers` y `snowfall` son **suma de la hora
  anterior** y `wind_gusts_10m` es el **máximo de la hora anterior**: el sello t cubre (t − 1 h, t]. `packages/core`
  (`weather.ts → hoursAround`) lo tiene en cuenta. `snowfall` en cm (agua equivalente = cm / 7), `visibility` en m.
- **`lightning_potential` no existe como variable horaria**: solo en datos de 15 min y para algunos modelos
  (verificado 2026-10-10). Con datos horarios el factor tormenta se evalúa por `weather_code` (95/96/99) y la regla
  CAPE + rayos solo actúa si llega el dato.
- **`elevation`**: parámetro opcional para la reducción estadística de escala (por defecto, MDT de 90 m;
  `elevation=nan` la desactiva). Pedir cada celda con la cota real del tramo mejoraría temperatura/nieve/hielo en
  puertos; pendiente en el adaptador (fase 3) **[VERIFICAR coste en multi-ubicación]**.
- No ofrece avisos. Sin nowcasting minuto a minuto en el plan gratuito.
- **El límite es por IP**: llamar desde el navegador (IP de cada usuario). Desde Workers/servidores compartidos se han visto 429 por tráfico ajeno.
- **Conteo de llamadas (revisado 2026-10-11)**: los docs y los términos no publican la fórmula; solo el blog de Open-Meteo, que da peso ≈ ubicaciones × (días/14) × (variables/10). Un comentario del blog dice que 1-7 días no cambian el peso (suelo en 14 días), sin respuesta oficial **[VERIFICAR]**. Presupuesto en el peor caso (suelo de 14 días): un lote de 20 celdas con 9 variables ≈ **18 llamadas** contra 600/min, 5.000/h y 10.000/día (≈ 33 lotes/min, ≈ 555 lotes/día); una consulta de 3 rutas largas (≈ 100 celdas únicas) ≈ 90 llamadas. Sin tope de concurrencia en los términos (los límites son de volumen). El blog habla de hasta 1.000 ubicaciones por petición (no figura en /docs); la longitud de URL no está documentada (un lote de 20 ≈ 500 caracteres). El proyecto usa lotes ≤ 20 celdas, como mucho 3 a la vez y escalonados 250 ms, con caché por celda de 30 min. **Latencia (medida 2026-10-11)**: crece con las ubicaciones de cada petición (1 → 0,8 s, 10 → 3 s, 25 → 6 s, 50 → 14-35 s en un momento de carga; minutos después, 20 celdas × 7 días ≈ 0,1-0,5 s); por eso lotes pequeños en paralelo y timeout por lote de 10 s + 0,6 s por ubicación. Un 429 se reintenta 2 veces respetando `Retry-After` con tope de 10 s; si pide más, se devuelve resultado parcial.
- **Días pedidos (2026-10-11)**: la app pide `forecast_days=7` (por defecto de la API; máximo 16) para poder elegir hoy y los seis días siguientes. Con el suelo de 14 días, 7 días pesan igual que 3; en la lectura literal pesarían algo más que 3 y la mitad que 14 **[VERIFICAR]**. La respuesta es ≈ 2,2× mayor. Una serie cacheada que no llega a ese horizonte se vuelve a pedir. A más de ~2-3 días `best_match` tira de modelos globales (ICON 7,5 d, ECMWF 15 d) en vez de los europeos de alta resolución: la calidad cae, y la UI lo marca como orientativo a partir de 48 h. `visibility` y `cape` pueden venir `null` según el modelo (el adaptador lo tolera).
- Atribución: enlazar a Open-Meteo (CC-BY 4.0). Plan comercial desde ~29 €/mes (no previsto).
- Fuentes: https://open-meteo.com/en/terms · https://open-meteo.com/en/docs · https://open-meteo.com/en/pricing · https://openmeteo.substack.com/p/weather-data-for-multiple-locations · https://github.com/open-meteo/open-meteo/discussions/853

### Valhalla demo (FOSSGIS) — revisado 2026-10-10
- Endpoint: `https://valhalla1.openstreetmap.de/route?json=<URL-encoded>` (GET; también acepta POST). Se usa GET para evitar el preflight CORS.
- La documentación de Valhalla indica que el demo sigue la política de «uso justo» de los demos de OSRM y Nominatim, con límites de tasa. Las cifras ~1 req/s por usuario y ~100 req/s globales vienen de una fuente secundaria **[NO CONFIRMADO]**; el proyecto aplica ≥ 1 s entre peticiones y circuit breaker (`FallbackRouting`), que respeta `Retry-After`.
- Términos oficiales de los servidores FOSSGIS (en alemán): https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/ — no se pudieron leer de forma automática (protección anti-bot) **[VERIFICAR a mano]** si exigen identificación o limitan el uso desde webs de terceros. No se envía `X-Client-Id`: una cabecera propia desde el navegador provoca preflight CORS y no consta como obligatoria.
- Desde el navegador el sitio solo se identifica por `Origin`/`Referer` (automáticos): la web no debe fijar `Referrer-Policy: no-referrer`.
- `alternates` puede devolver menos de las pedidas y no se admite con más de 2 ubicaciones. Se piden 0-2 con 2 ubicaciones.
- Para Málaga → Granada el demo devolvió A-45 · A-92 y A-7 · A-44, mientras que los demos OSRM devolvieron una sola ruta: por eso es el primario.
- Atribución: «Rutas: Valhalla (FOSSGIS)» cuando la ruta procede de este proveedor; datos © OpenStreetMap contributors (ODbL).
- Fuentes: https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/ · https://wiki.openstreetmap.org/wiki/FOSSGIS/Server/Policy

### OSRM demo
- `https://router.project-osrm.org/route/v1/driving/{lng,lat;lng,lat}?alternatives=true&geometries=geojson&overview=full&annotations=duration` y `https://routing.openstreetmap.de/routed-car/route/v1/driving/…` (FOSSGIS: usar el prefijo `routed-car`).
- Máx. 1 req/s; uso razonable y no comercial; sin garantías de disponibilidad, latencia ni datos; puede bloquear por abuso (wiki Demo-server, revisado 2026-10-10).
- Política de uso (wiki Api-usage-policy): User-Agent válido que identifique la aplicación y Referer válido cuando se conoce. Desde el navegador no se puede fijar `User-Agent`; se envían `Referer`/`Origin` automáticamente. El script de fixtures (Node) sí fija un UA propio con contacto.
- `annotation.duration` excluye las penalizaciones de giro: el adaptador las reparte proporcionalmente para que la ETA final cuadre con `duration`.
- Para Málaga → Granada ambos demos devolvieron una sola ruta pese a `alternatives` (2026-10-10).
- Mostrar atribución ODbL y fuente de rutas (OSRM). No meter detrás de muro de pago; no vender acceso.
- `alternatives=true` puede devolver 0-2 alternativas (no garantizado). Para más control: ORS.
- Fuentes: https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server · https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy

### OpenRouteService (vía Worker)
- Plan gratuito estándar: Directions 2.000/día y 40/min (página oficial de planes). Otras fuentes secundarias hablan de >8.000/día en total entre endpoints; **vale la cifra oficial**.
- No comercial. Requiere clave (secreto del Worker). Plan Standard 0 € (límites en https://account.heigit.org/info/plans);
  el plan Collaborative prohíbe uso comercial.
- **`alternative_routes` (revisado 2026-10-11, https://openrouteservice.org/restrictions/)**: distancia máxima documentada
  **100 km** (150 km con áreas a evitar), máx. 3 rutas. En la prueba real Málaga → Granada (126 km) devolvió 3 rutas, así
  que hoy no se aplica de forma estricta, pero no es fiable: el adaptador reintenta sin alternativas ante cualquier 4xx.
  Valores por defecto `weight_factor` 1,4 y `share_factor` 0,6; el proyecto usa 1,6 y 0,6
  (https://ask.openrouteservice.org/t/alternative-routes/5693).
- **Atribución**: los ToS (https://openrouteservice.org/?p=940) exigen atribución adecuada para las APIs gratuitas; texto
  exacto no legible automáticamente **[VERIFICAR]**. Se muestra «openrouteservice» en la ruta que procede de este
  proveedor y en el pie.
- **Tope propio**: el Worker corta en 1.500 peticiones/día (contador por isolate/centro de datos, aproximado) y cachea
  1 h por coordenadas redondeadas a 4 decimales.
- Fuente: https://openrouteservice.org/plans/
- **Verificado 2026-10-11** (petición real, Málaga → Granada): `POST /v2/directions/driving-car/geojson` con
  `Authorization: <clave>` y `alternative_routes: { target_count: 3, weight_factor: 1.6, share_factor: 0.6 }` devolvió
  **3 rutas** (126, 148 y 148 km). Cabeceras observadas: `x-ratelimit-limit: 200`, `x-ratelimit-remaining`,
  `x-ratelimit-reset` (unix). Los tiempos por paso (`steps[].duration` con `way_points`) permiten la ETA por vértice.
  Los nombres de vía de autovías llegan a menudo como `-`. Códigos de error 2009 (sin ruta) / 2010 (punto fuera de la red)
  según la documentación de errores de ORS **[VERIFICAR con una respuesta real]**.
- Desde esta red de desarrollo hubo timeouts de conexión intermitentes a `api.openrouteservice.org` (2026-10-11).

### AEMET OpenData
- Clave gratuita en https://opendata.aemet.es/centrodedescargas/altaUsuario. **Solo en servidor.**
- Patrón de dos pasos: la primera respuesta contiene una URL (`datos`) con los datos reales; hay que pedirla. Reintentos con backoff ante 429; se han observado cortes/caídas sostenidas.
- Avisos por comunidad autónoma y predicción por municipio (códigos INE). Citar a AEMET como origen.
- **Avisos CAP (verificado 2026-10-11)**: `GET /opendata/api/avisos_cap/ultimoelaborado/area/{area}` con cabecera
  `api_key`. Códigos de área (especificación oficial): `esp` España, 61 Andalucía, 62 Aragón, 63 Asturias,
  64 Baleares, 65 Canarias, 66 Cantabria, 67 Castilla y León, 68 Castilla-La Mancha, 69 Cataluña, 70 Extremadura,
  71 Galicia, 72 Madrid, 73 Murcia, 74 Navarra, 75 País Vasco, 76 La Rioja, 77 C. Valenciana, 78 Ceuta, 79 Melilla.
  - Paso 1: JSON `{ descripcion, estado, datos, metadatos }` (Content-Type declara ISO-8859-15; el JSON es ASCII).
    Los errores también llegan con HTTP 200 y `estado` 4xx/5xx en el cuerpo.
  - Paso 2: `datos` (en `opendata.aemet.es`) devuelve `application/x-gtar` con un XML CAP 1.2 **en UTF-8** por
    fenómeno: AT temp. máximas, BT mínimas, CO costeros, NE nevadas, NI nieblas, PR lluvias, TO tormentas, VI vientos,
    VS polvo. Cada fichero lleva un `<info>` por idioma (es-ES, en-GB) y **todas** las zonas, también las de nivel
    «verde» (sin aviso). Nivel en `AEMET-Meteoalerta nivel` (verde/amarillo/naranja/rojo), zona en
    `AEMET-Meteoalerta zona` y polígono `lat,lon` en `<polygon>`. Andalucía ≈ 430 KB, Baleares ≈ 120 KB.
  - El proyecto genera una tabla estática de 233 zonas con `packages/providers/scripts/build-aemet-zones.mjs`.
  - Fuente: https://opendata.aemet.es/AEMET_OpenData_specification.json
- **Condiciones de reutilización (revisado 2026-10-11, https://www.aemet.es/es/nota_legal)**: autorización gratuita y no
  exclusiva para fines comerciales y no comerciales. Atribución obligatoria: «© AEMET» o «Información elaborada por la
  Agencia Estatal de Meteorología»; en servicios de valor añadido, «Fuente: AEMET» o «Información elaborada utilizando,
  entre otras, la obtenida de la Agencia Estatal de Meteorología». Prohibido desnaturalizar el sentido de la información
  y sugerir que AEMET participa, patrocina o respalda el servicio. Conservar la fecha de actualización y los metadatos de
  condiciones cuando aparezcan en el original. El pie de la web dice «Avisos: Fuente: AEMET · Meteoalarm (EUMETNET)».
- **Límite por minuto**: no figura en una fuente oficial legible. Un blog de datos.gob.es (2026-03-18,
  https://datos.gob.es/es/blog/api-en-las-administraciones-publicas-cuales-hay-y-como-utilizarlas) cita 50 peticiones/min;
  la cifra «~80/min» anterior era una observación sin fuente. Tope de diseño: 50/min. FAQ oficial (v1.4, jul-2025):
  https://opendata.aemet.es/centrodedescargas/docs/FAQs170621.pdf **[VERIFICAR a mano, PDF comprimido]**. Cada comunidad
  cuesta 2 peticiones (metadatos + tar): el Worker pide como máximo 4 comunidades por consulta, deduplica descargas
  simultáneas, cachea 10 min y guarda los fallos 60 s (o lo que diga `Retry-After`).
- Fuentes: https://wetterdienst.readthedocs.io/en/latest/data/provider/aemet/observation/index.html · https://glama.ai/mcp/servers/rldona/aemet-mcp

### Meteoalarm
- Portal de API: https://api.meteoalarm.org/ (EDR GeoJSON, MQTT, REST, feeds Atom por país y Europa). Detalle de autenticación y límites **[VERIFICAR]**.
- **Verificado 2026-10-11**: `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-spain` (Atom, sin clave, ~7 KB,
  solo avisos vigentes) con `cap:areaDesc`, `cap:geocode` (EMMA_ID), `cap:severity` (Moderate/Severe/Extreme =
  amarillo/naranja/rojo), `cap:onset`/`cap:expires` y título «Yellow Rain Warning issued for Spain - …». **Sin
  polígonos**: el proyecto los obtiene de la tabla de zonas de AEMET por nombre (Meteoalarm reproduce los avisos de AEMET).
  El JSON `/api/v1/warnings/feeds-spain` pesa ~1,9 MB e incluye avisos caducados: no se usa (CPU del Worker).
- Licencia en el propio feed: «Licensed under terms equivalent to CC BY 4.0, with additional requirements for
  redistributing outlined in our Terms and Conditions». Los términos (https://meteoalarm.org/en/live/page/terms-and-conditions)
  no se pudieron leer de forma automática (página renderizada con JS, ≈ 420 KB; sin texto de redistribución en los
  primeros 300.000 caracteres, revisado 2026-10-11). Existe una categoría «Redistributors» **[VERIFICAR a mano antes de
  publicar]** si hay requisitos de atribución o prohibición de alterar los avisos al reexponerlos desde nuestro Worker.
- Uso previsto: complemento a AEMET y base para extender a Europa.

### MET Norway
- Exige User-Agent con nombre de app y contacto; sin él bloquean. Los navegadores no permiten fijar `User-Agent` desde JS → llamar **desde el Worker** si se usa **[VERIFICAR política para clientes en navegador]**.
- Fuente: https://api.met.no/doc/TermsOfService

### Geocodificación
- **Photon** (`https://photon.komoot.io/api/?q=…`) para autocompletar (debounce ≥ 300 ms, caché, cancelar peticiones obsoletas).
- Photon (revisado 2026-10-11): `lang=es` devuelve 400 («Supported are: default, de, en, fr»), así que no conoce
  exónimos en castellano; por eso el buscador usa primero un nomenclátor propio de Wikidata (ADR-0010). Se envían `bbox`
  de Europa, `location_bias_scale=0.1` y `layer` de lugares cuando la consulta no tiene números.
- Photon `lang`: admite un solo código; si se omite usa `Accept-Language` del navegador. `default` no está documentado, así que no se envía (revisado 2026-10-10, https://github.com/komoot/photon/blob/master/docs/api-v1.md). Sin cifras de límite: «uso razonable», puede limitarse sin aviso.
- **Nominatim** solo para búsquedas explícitas puntuales, nunca autocompletado; 1 req/s; User-Agent propio.
- Fuentes: https://operations.osmfoundation.org/policies/nominatim/ · https://photon.komoot.io

### Wikidata (nomenclátor, ADR-0010)
- SPARQL `https://query.wikidata.org/sparql` solo desde el script manual `apps/web/scripts/build-gazetteer.mjs` (3 consultas,
  User-Agent identificable, reintentos ante 429/504). Datos CC0: no exige atribución; se cita igualmente en la web.
- Fuente: https://www.wikidata.org/wiki/Wikidata:Licensing

### OpenFreeMap
- Estilos en `https://tiles.openfreemap.org/styles/{liberty|bright|positron}`; recolorear a la paleta del proyecto (ver `DESIGN.md`). Atribución OSM/OpenMapTiles. Fuente: https://openfreemap.org

### Radar (fuera de v1)
- RainViewer recortó su API en 2026: sin nowcast, zoom ≤ 7, 100 req/IP/min, solo uso personal/educativo. LibreWXR es una alternativa autoalojable. Fuente: https://rainviewer.com/api/transition-faq.html

## Cloudflare (plan gratuito) — límites que condicionan el diseño

| Recurso | Límite gratuito |
|---|---|
| Workers | 100.000 peticiones/día · 10 ms CPU/petición · 50 subrequests externas y 1.000 a servicios Cloudflare por invocación |
| KV | 100.000 lecturas/día · **1.000 escrituras/día** |
| D1 | 5 M filas leídas/día · 100.000 escritas/día · desde 2026-09-01 las consultas **fallan** al superarlo |
| R2 | 10 GB |

Implicaciones: Worker fino; sin D1 en v1; caché con Cache API antes que KV; no calcular geometría en el Worker.
Fuentes: https://developers.cloudflare.com/changelog/2026-02-11-subrequests-limit · https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/ · https://eastondev.com/blog/en/posts/dev/20260526-cloudflare-free-limits/

## Plan B de infraestructura (si crece o cambian términos)
VM "Always Free" de Oracle (ARM 4 OCPU / 24 GB) con OSRM o Valhalla sobre extracto de España: sin límites de peticiones, a cambio de mantenimiento, tarjeta de verificación y riesgo de falta de capacidad o reclamación por inactividad. Fuente: https://cnx-software.com/?p=90856

## Atribuciones obligatorias en el pie de la web
© OpenStreetMap contributors (ODbL) · OpenFreeMap / OpenMapTiles · Weather data by Open-Meteo.com (CC-BY 4.0) · Rutas: Valhalla (FOSSGIS) / OSRM / OpenRouteService (según el proveedor que responda) · Avisos: AEMET / Meteoalarm (EUMETNET).

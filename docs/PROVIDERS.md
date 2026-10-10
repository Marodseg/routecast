# PROVIDERS — límites, términos y notas

Última verificación: **2026-10-10** (búsqueda web). Estos datos cambian. Antes de añadir o modificar una llamada externa,
usa el subagente `provider-auditor` y actualiza este archivo con fecha y fuente. Lo marcado **[VERIFICAR]** no está confirmado.

Contexto de uso: proyecto personal/portfolio **sin monetización**. Si eso cambia, casi todo lo gratuito deja de valer (ver ADR-0004).

## Resumen

| Servicio | Uso | ¿Clave? | Límite gratuito | Condiciones clave |
|---|---|---|---|---|
| Open-Meteo | Previsión horaria | No | 600/min, 5.000/h, 10.000/día (por IP) | **No comercial**, atribución CC-BY; CORS abierto |
| OSRM demo | Rutas + alternativas | No | ~1 req/s, sin SLA | No comercial, User-Agent válido, atribución OSRM/OSM (ODbL) |
| Valhalla demo (FOSSGIS) | Rutas (alternativa) | No | ~1 req/s por IP, 100 req/s globales | **No para producción**; `X-Client-Id` recomendado |
| OpenRouteService | Rutas (fallback vía Worker) | Sí | Directions 2.000/día, 40/min | No comercial; clave solo en Worker |
| GraphHopper | No usar de entrada | Sí | 500 créditos/día, 5 puntos | No comercial; demasiado limitado |
| AEMET OpenData | Avisos/predicción España | Sí (gratuita) | Límite por minuto estricto (~80/min observado) | Citar AEMET; clave solo en Worker; caídas intermitentes |
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
- No ofrece avisos. Sin nowcasting minuto a minuto en el plan gratuito.
- **El límite es por IP**: llamar desde el navegador (IP de cada usuario). Desde Workers/servidores compartidos se han visto 429 por tráfico ajeno.
- **[VERIFICAR]** cómo se cuentan las llamadas con muchas ubicaciones en una petición contra el límite diario.
- Atribución: enlazar a Open-Meteo (CC-BY 4.0). Plan comercial desde ~29 €/mes (no previsto).
- Fuentes: https://open-meteo.com/en/terms · https://open-meteo.com/en/docs · https://github.com/open-meteo/open-meteo/discussions/853

### OSRM demo
- `https://router.project-osrm.org/route/v1/driving/{lng,lat;lng,lat}?alternatives=true&geometries=geojson&overview=full&annotations=duration` y `https://routing.openstreetmap.de/routed-car/route/v1/driving/…` (FOSSGIS: usar el prefijo `routed-car`).
- Máx. 1 req/s; sin garantías de disponibilidad, latencia o datos; puede bloquear por abuso. User-Agent identificable (no falsear otro).
- Mostrar atribución ODbL y fuente de rutas (OSRM). No meter detrás de muro de pago; no vender acceso.
- `alternatives=true` puede devolver 0-2 alternativas (no garantizado). Para más control: ORS.
- Fuentes: https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server · https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy

### OpenRouteService (vía Worker)
- Plan gratuito estándar: Directions 2.000/día y 40/min (página oficial de planes). Otras fuentes secundarias hablan de >8.000/día en total entre endpoints; **vale la cifra oficial**.
- No comercial. Requiere clave (secreto del Worker). Alternativas de ruta: parámetro `alternative_routes`; límites de distancia/longitud en la API pública **[VERIFICAR]**.
- Fuente: https://openrouteservice.org/plans/

### AEMET OpenData
- Clave gratuita en https://opendata.aemet.es/centrodedescargas/altaUsuario. **Solo en servidor.**
- Patrón de dos pasos: la primera respuesta contiene una URL (`datos`) con los datos reales; hay que pedirla. Reintentos con backoff ante 429; se han observado cortes/caídas sostenidas.
- Avisos por comunidad autónoma y predicción por municipio (códigos INE). Citar a AEMET como origen.
- Fuentes: https://wetterdienst.readthedocs.io/en/latest/data/provider/aemet/observation/index.html · https://glama.ai/mcp/servers/rldona/aemet-mcp

### Meteoalarm
- Portal de API: https://api.meteoalarm.org/ (EDR GeoJSON, MQTT, REST, feeds Atom por país y Europa). Detalle de autenticación y límites **[VERIFICAR]**.
- Uso previsto: complemento a AEMET y base para extender a Europa.

### MET Norway
- Exige User-Agent con nombre de app y contacto; sin él bloquean. Los navegadores no permiten fijar `User-Agent` desde JS → llamar **desde el Worker** si se usa **[VERIFICAR política para clientes en navegador]**.
- Fuente: https://api.met.no/doc/TermsOfService

### Geocodificación
- **Photon** (`https://photon.komoot.io/api/?q=…`) para autocompletar (debounce ≥ 300 ms, caché, cancelar peticiones obsoletas).
- **Nominatim** solo para búsquedas explícitas puntuales, nunca autocompletado; 1 req/s; User-Agent propio.
- Fuentes: https://operations.osmfoundation.org/policies/nominatim/ · https://photon.komoot.io

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
© OpenStreetMap contributors (ODbL) · OpenFreeMap / OpenMapTiles · Weather data by Open-Meteo.com (CC-BY 4.0) · Routing by OSRM/OpenRouteService · Avisos: AEMET / Meteoalarm (EUMETNET).

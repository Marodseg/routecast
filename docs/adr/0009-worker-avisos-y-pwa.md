# ADR-0009 — Worker de avisos (AEMET + Meteoalarm), ORS de respaldo y PWA

- Estado: aceptada · Fecha: 2026-10-11

## Contexto
- AEMET publica los avisos como un **tar de XML CAP** por comunidad autónoma (API en dos pasos, clave en cabecera),
  con un fichero por fenómeno que incluye **todas** las zonas, también en nivel «verde». Andalucía ≈ 430 KB.
  Las zonas traen polígono y código `AEMET-Meteoalerta zona` (verificado 2026-10-11).
- Meteoalarm reproduce los avisos de AEMET para España. Su feed Atom pesa ~7 KB (solo avisos vigentes) pero **sin
  polígonos** (código EMMA_ID y nombre de zona). Su JSON completo pesa ~1,9 MB.
- El plan gratuito de Workers da 10 ms de CPU por petición. La documentación de la Cache API no garantiza que funcione
  en `*.workers.dev`. El binding de rate limiting es por ubicación y aproximado.
- Durante las pruebas, AEMET y ORS tuvieron cortes de conexión intermitentes.

## Decisión
- **Tabla estática de zonas** (233 zonas, ≈ 40 KB gzip) generada a mano con `packages/providers/scripts/build-aemet-zones.mjs`
  a partir de los CAP de AEMET. Da polígonos a los avisos de Meteoalarm (por nombre de zona) y acota qué comunidades
  pedir a AEMET para una caja dada.
- `/api/warnings?bbox&from&to`: AEMET (solo comunidades que tocan la caja, máx. 8) + Meteoalarm Atom, en paralelo.
  Se descartan los ficheros «verde» con un filtro de texto antes de analizar XML (CPU). Se fusionan los duplicados
  (misma zona, fenómeno y ventana solapada; gana el nivel mayor y, a igualdad, AEMET). Si falla una fuente,
  `partial: true`; si fallan las dos, 503.
- Caché en dos capas: **memoria del isolate** (siempre) y **Cache API** si existe; TTL 10 min para avisos y 1 h para rutas.
  Nada de KV.
- `/api/route`: ORS con la clave como secreto, último eslabón de la cadena de rutas (ADR-0008).
- Seguridad: CORS solo para `ALLOWED_ORIGINS`, solo GET, entrada validada con Zod y con límites de tamaño, URL de
  datos de AEMET restringida a `opendata.aemet.es`, rate limiting best-effort (60/min por IP y ubicación), errores
  sin detalles internos.
- En la web, `core.warningsOnRoute` cruza polígonos y hora de paso (± 30 min). Un Worker caído o no configurado se
  muestra como «avisos no disponibles», **nunca** como «sin avisos».
- **PWA**: service worker propio y sin dependencias (shell + `/assets/*` en caché); la última consulta y la previsión
  quedan en IndexedDB para abrirlas sin conexión (con aviso de datos posiblemente desactualizados).
- **CSP** en el HTML construido: `script-src 'self'`, `connect-src` limitado a los proveedores y al Worker.
  `style-src` admite `'unsafe-inline'` porque Solid aplica algunos estilos como atributo; el riesgo de XSS se acota
  con los scripts.

## Consecuencias
+ Worker pequeño (≈ 190 KB gzip) y dentro del presupuesto de CPU en el caso habitual (con caché caliente).
+ Degradación probada: AEMET caído → solo Meteoalarm; Worker caído → la web sigue sin avisos y lo dice.
− La tabla de zonas hay que regenerarla si AEMET cambia su zonificación (raro; el script lo hace en ~1 min).
− Primer acceso por comunidad tras caducar la caché: descarga y filtrado del tar (puede rozar el límite de CPU en
  comunidades grandes con muchos avisos activos). Si ocurre, el siguiente paso es precalcular con un cron.
− `style-src 'unsafe-inline'` es menos estricto de lo ideal.

## Alternativas descartadas
- JSON completo de Meteoalarm (1,9 MB por petición): demasiada CPU para el plan gratuito.
- `area/esp` de AEMET (toda España en un tar): varios MB por consulta.
- Workbox / `vite-plugin-pwa`: más dependencias para un service worker de 60 líneas.

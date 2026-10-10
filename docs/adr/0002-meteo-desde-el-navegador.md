# ADR-0002 — Previsión desde el navegador; Worker fino para claves y avisos

- Estado: aceptada · Fecha: 2026-10-10

## Contexto
Open-Meteo no necesita clave pero limita por IP (600/min, 5.000/h, 10.000/día) y solo permite uso no comercial.
Desde servidores compartidos (Workers, Val Town…) se han visto 429 por tráfico ajeno. El plan gratuito de Cloudflare Workers
da 10 ms de CPU y 50 subrequests externas por petición, y KV solo 1.000 escrituras/día.

## Decisión
- La **previsión** se pide **directamente desde el navegador** (CORS abierto), con una sola petición multi-ubicación por ruta.
- El **Worker** solo hace lo que el navegador no puede: guardar claves (AEMET, ORS), normalizar y cachear avisos oficiales,
  y ser último fallback de rutas.
- Todo el cálculo (muestreo, ETA, viento, riesgo) ocurre en el navegador (`core`).

## Consecuencias
+ Cada usuario consume su propia cuota de IP; el proyecto escala "gratis" con el número de usuarios.
+ Worker pequeño dentro de los límites gratuitos.
− Dependencia de la disponibilidad de Open-Meteo desde el cliente; mitigación: caché local, mensajes de degradación y posibilidad de añadir otro `WeatherProvider`.
− Pendiente verificar cómo cuenta Open-Meteo las llamadas multi-ubicación (PROVIDERS.md).

## Alternativas descartadas
Proxy de todo por Worker (IP compartida, límites de CPU/subrequests); malla precalculada (fase posterior, ver ARCHITECTURE §12).

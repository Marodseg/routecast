# ADR-0010 — Nomenclátor propio (Wikidata) delante de Photon

- Estado: aceptada · Fecha: 2026-10-11

## Contexto
El buscador daba malos resultados en casos normales para un viaje desde España (probado el 2026-10-11):
- «Hendaya» devolvía calles de Chile y caseríos de Hondarribia: el Photon público **no admite `lang=es`** (solo
  `default`, `de`, `en`, `fr`) y no indexa exónimos en castellano (Hendaya, Burdeos, Bayona, Oporto, Londres…).
- «San Sebastián» llevaba a San Sebastián de los Reyes; «La Coruña», «Gerona» u «Orense» no encontraban la ciudad.
- «Granada» o «grana» mezclaban paradas de autobús, tiendas y bares de Madrid (sesgo de ubicación fuerte, sin filtro de tipo).

## Decisión
- **Nomenclátor estático** (`apps/web/public/gazetteer.json`, ≈ 5.000 lugares, ≈ 105 KB gzip) generado a mano con
  `apps/web/scripts/build-gazetteer.mjs` desde **Wikidata (CC0)**: municipios de España ≥ 1.000 hab. (por código INE,
  porque el tipo varía por comunidad), con nombre en castellano, nombres oficiales/cooficiales y alias en castellano;
  municipios de Francia ≥ 8.000 hab., Portugal y Andorra; y grandes ciudades de Europa con su exónimo.
  Se muestra el nombre oficial (A Coruña, Girona, Lleida) salvo si es bilingüe (San Sebastián, Vitoria); todos son buscables.
- Se **carga de forma diferida** al usar el buscador y se puntúa: exacto > empieza por > alguna palabra empieza por;
  nombre > alias; desempate por población.
- **Photon** sigue para pueblos pequeños y direcciones, pero: caja de Europa y Magreb, sesgo suave (`location_bias_scale`
  0,1), solo capas de lugares si no hay números en la consulta, sin POIs ni casas sueltas, ordenado por tipo de lugar.
- Unión: primero el nomenclátor; de Photon solo lo que contiene lo escrito y no está a < 4 km de otro resultado
  (o con el mismo nombre a < 15 km). Si Photon falla, el nomenclátor basta.

## Consecuencias
+ «Hendaya», «Burdeos», «Donostia», «La Coruña», «Gasteiz», «Lérida»… encuentran la ciudad correcta a la primera.
+ Funciona aunque Photon esté caído o limitado.
− ≈ 105 KB más la primera vez que se usa el buscador (no en la carga inicial).
− Hay que regenerarlo de vez en cuando (población, nuevos municipios); el script tarda menos de un minuto.

## Alternativas descartadas
- Nominatim para autocompletar: prohibido por su política de uso.
- Photon propio con `es`: requiere servidor (fuera del coste 0 €).
- Lista manual de exónimos: incompleta y difícil de mantener.

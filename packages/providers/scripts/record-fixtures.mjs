// Graba respuestas reales para los tests de contrato. Ejecutar a mano y con moderación (políticas de uso de cada API):
//   node packages/providers/scripts/record-fixtures.mjs
import { writeFileSync } from 'node:fs';

const OUT = new URL('../test/__fixtures__/', import.meta.url);
const UA = { 'User-Agent': 'Routecast/0.1 (proyecto personal no comercial; fixtures de test)' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function save(name, url) {
  const res = await fetch(url, { headers: UA });
  const body = await res.text();
  writeFileSync(new URL(name, OUT), body);
  console.warn(`${res.status} ${name} (${body.length} B)`);
  await wait(1500); // ≤ 1 req/s hacia demos públicos
}

await save('photon-granada.json', 'https://photon.komoot.io/api/?q=Granada&limit=5&lang=default&lat=40.4&lon=-3.7');
await save(
  'osrm-malaga-granada.json',
  'https://routing.openstreetmap.de/routed-car/route/v1/driving/-4.4214,36.7213;-3.5986,37.1773?alternatives=true&geometries=geojson&overview=full&annotations=duration',
);
const hourly =
  'precipitation,snowfall,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,visibility,cape';
await save(
  'open-meteo-multi.json',
  `https://api.open-meteo.com/v1/forecast?latitude=36.7,37.0,37.2&longitude=-4.4,-4.5,-3.6&hourly=${hourly}&timezone=UTC&timeformat=unixtime&wind_speed_unit=kmh&forecast_days=2`,
);
await save(
  'open-meteo-single.json',
  `https://api.open-meteo.com/v1/forecast?latitude=37.2&longitude=-3.6&hourly=${hourly}&timezone=UTC&timeformat=unixtime&wind_speed_unit=kmh&forecast_days=1`,
);

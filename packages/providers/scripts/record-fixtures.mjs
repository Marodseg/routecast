// Graba respuestas reales para los tests de contrato. Ejecutar a mano y con moderación (políticas de uso de cada API):
//   node packages/providers/scripts/record-fixtures.mjs
import { writeFileSync } from 'node:fs';

const OUT = new URL('../test/__fixtures__/', import.meta.url);
const HEADERS = {
  'User-Agent':
    'Routecast/0.1 (proyecto personal no comercial; fixtures de test; ver README del repositorio routecast)',
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function save(name, url) {
  const res = await fetch(url, { headers: HEADERS });
  const body = await res.text();
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}, no se graba`);
  writeFileSync(new URL(name, OUT), body);
  console.warn(`${res.status} ${name} (${body.length} B)`);
  await wait(1500); // ≤ 1 req/s hacia demos públicos
}

const FROM = { lat: 36.7213, lng: -4.4214 };
const TO = { lat: 37.1773, lng: -3.5986 };
const coords = `${FROM.lng},${FROM.lat};${TO.lng},${TO.lat}`;
const osrmQuery = 'geometries=geojson&overview=full&annotations=duration';
const valhalla = {
  locations: [
    { lat: FROM.lat, lon: FROM.lng },
    { lat: TO.lat, lon: TO.lng },
  ],
  costing: 'auto',
  alternates: 2,
  units: 'kilometers',
  directions_type: 'maneuvers',
  language: 'es-ES',
};
const hourly =
  'precipitation,snowfall,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,visibility,cape';

await save('photon-granada.json', 'https://photon.komoot.io/api/?q=Granada&limit=5&lat=40.2&lon=-3.7');
await save(
  'valhalla-malaga-granada.json',
  `https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify(valhalla))}`,
);
await save(
  'osrm-malaga-granada.json',
  `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coords}?alternatives=true&${osrmQuery}`,
);
await save(
  'osrm-demo-malaga-granada.json',
  `https://router.project-osrm.org/route/v1/driving/${coords}?alternatives=3&${osrmQuery}`,
);
await save(
  'open-meteo-multi.json',
  `https://api.open-meteo.com/v1/forecast?latitude=36.7,37.0,37.2&longitude=-4.4,-4.5,-3.6&hourly=${hourly}&timezone=UTC&timeformat=unixtime&wind_speed_unit=kmh&forecast_days=2`,
);
await save(
  'open-meteo-single.json',
  `https://api.open-meteo.com/v1/forecast?latitude=37.2&longitude=-3.6&hourly=${hourly}&timezone=UTC&timeformat=unixtime&wind_speed_unit=kmh&forecast_days=1`,
);

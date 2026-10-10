import { haversineM } from '@routecast/core';
import { APP_NAME } from '@routecast/shared';

const app = document.querySelector<HTMLElement>('#app');
if (app) {
  const km = Math.round(haversineM({ lat: 40.4168, lng: -3.7038 }, { lat: 41.3874, lng: 2.1686 }) / 1000);
  const h1 = document.createElement('h1');
  h1.textContent = APP_NAME;
  const p = document.createElement('p');
  p.textContent = `Madrid → Barcelona: ${km} km en línea recta. En construcción.`;
  app.append(h1, p);
}

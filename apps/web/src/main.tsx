import './boot';
import { render } from 'solid-js/web';
import { App } from './App';

const root = document.getElementById('app');
if (root) render(() => <App />, root);

// Shell offline (SPEC F15). Solo en producción: en desarrollo interferiría con la recarga en caliente.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Sin service worker la app funciona igual, solo que no offline.
    });
  });
}

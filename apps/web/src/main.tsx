import './boot';
import { render } from 'solid-js/web';
import { Home } from './Home';

const root = document.getElementById('app');
if (root) render(() => <Home />, root);

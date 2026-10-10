import '../boot';
import { render } from 'solid-js/web';
import { Gallery } from './Gallery';

const root = document.getElementById('app');
if (root) render(() => <Gallery />, root);

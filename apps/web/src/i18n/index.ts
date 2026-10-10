import { createRoot, createSignal } from 'solid-js';
import { readPref, writePref } from '../lib/storage';
import { en } from './en';
import { type Dict, es } from './es';

export type Lang = 'es' | 'en';
const dicts: Record<Lang, Dict> = { es, en };

const initial = (): Lang => {
  const saved = readPref('lang');
  if (saved === 'es' || saved === 'en') return saved;
  const nav = globalThis.navigator?.language?.toLowerCase() ?? 'es';
  return nav.startsWith('es') ? 'es' : 'en';
};

const [lang, setLangSignal] = createRoot(() => createSignal<Lang>(initial()));

export function setLang(l: Lang): void {
  setLangSignal(l);
  writePref('lang', l);
  document.documentElement.lang = l;
}

export function initLang(): void {
  document.documentElement.lang = lang();
}

/** Diccionario activo (reactivo). */
export const t = (): Dict => dicts[lang()];
export type { Dict };
export { lang };

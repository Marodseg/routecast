import { createSignal } from 'solid-js';
import { readPref, writePref } from './storage';

export type ThemePref = 'system' | 'light' | 'dark';

const initial = (): ThemePref => {
  const v = readPref('theme');
  return v === 'light' || v === 'dark' ? v : 'system';
};

const [theme, setThemeSignal] = createSignal<ThemePref>(initial());

function apply(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
}

export function setTheme(pref: ThemePref): void {
  setThemeSignal(pref);
  writePref('theme', pref);
  apply(pref);
}

/** Aplica la preferencia guardada al arrancar (antes de pintar para evitar parpadeo). */
export function initTheme(): void {
  apply(theme());
}

export const systemPrefersDark = (): boolean =>
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

export const effectiveTheme = (): 'light' | 'dark' => {
  const t = theme();
  return t === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : t;
};

export { theme };

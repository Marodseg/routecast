import { createUniqueId, For } from 'solid-js';
import { lang, setLang, t } from '../../i18n';
import { setTheme, type ThemePref, theme } from '../../lib/theme';
import { Icon, type IconName } from '../Icon/Icon';
import s from './Toggles.module.css';

const OPTIONS: { value: ThemePref; icon: IconName }[] = [
  { value: 'system', icon: 'system' },
  { value: 'light', icon: 'sun' },
  { value: 'dark', icon: 'moon' },
];

/** Tema en tres estados (sistema/claro/oscuro) como grupo de radio: flechas para moverse, una sola parada de tabulación. */
export function ThemeToggle() {
  const name = `theme-${createUniqueId()}`;
  return (
    <fieldset class={s.group}>
      <legend class="visually-hidden">{t().theme.label}</legend>
      <For each={OPTIONS}>
        {(o) => (
          <label class={s.option} title={t().theme[o.value]}>
            <input
              class="visually-hidden"
              type="radio"
              name={name}
              value={o.value}
              checked={theme() === o.value}
              onChange={() => setTheme(o.value)}
            />
            <Icon name={o.icon} size={15} />
            <span class="visually-hidden">{t().theme[o.value]}</span>
          </label>
        )}
      </For>
    </fieldset>
  );
}

export function LangToggle() {
  return (
    <button
      type="button"
      class={s.lang}
      lang={lang() === 'es' ? 'en' : 'es'}
      aria-label={`${t().lang.short} · ${t().lang.switchTo}`}
      onClick={() => setLang(lang() === 'es' ? 'en' : 'es')}
    >
      {t().lang.short}
    </button>
  );
}

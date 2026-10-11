import type { Place } from '@routecast/shared';
import { createEffect, createSignal, createUniqueId, For, Match, on, onCleanup, Show, Switch } from 'solid-js';
import { t } from '../../i18n';
import { Icon } from '../Icon/Icon';
import s from './CommandSearch.module.css';

export type SearchFn = (query: string, signal: AbortSignal) => Promise<Place[]>;

export interface CommandSearchProps {
  label: string;
  value?: Place | null;
  onSelect: (place: Place | null) => void;
  search: SearchFn;
  recent?: Place[];
  /** ms de espera tras teclear antes de buscar (≥ 300 por política de Photon). */
  debounceMs?: number;
  autofocus?: boolean;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

/** Partes de `text` que coinciden con `query` (sin distinguir mayúsculas ni tildes) para resaltarlas. */
export function highlight(text: string, query: string): { text: string; match: boolean }[] {
  const norm = (x: string) =>
    x
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  const q = norm(query.trim());
  if (!q) return [{ text, match: false }];
  const idx = norm(text).indexOf(q);
  if (idx < 0) return [{ text, match: false }];
  return [
    { text: text.slice(0, idx), match: false },
    { text: text.slice(idx, idx + q.length), match: true },
    { text: text.slice(idx + q.length), match: false },
  ].filter((p) => p.text);
}

/** Buscador estilo paleta de comandos: patrón combobox ARIA 1.2 con lista emergente. */
export function CommandSearch(props: CommandSearchProps) {
  const uid = createUniqueId();
  const [query, setQuery] = createSignal(props.value?.name ?? '');
  const [open, setOpen] = createSignal(false);
  const [status, setStatus] = createSignal<Status>('idle');
  const [results, setResults] = createSignal<Place[]>([]);
  const [active, setActive] = createSignal(-1);
  let input!: HTMLInputElement;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ctrl: AbortController | undefined;
  let blurTimer: ReturnType<typeof setTimeout> | undefined;
  /** Hay un lugar elegido cuyo nombre está en el campo; editar el texto lo invalida. */
  let hasSelection = !!props.value;

  /** Cancela búsqueda pendiente o en vuelo para que no pise el estado después. */
  const cancel = () => {
    clearTimeout(timer);
    ctrl?.abort();
    ctrl = undefined;
    setResults([]);
    setStatus('idle');
  };

  createEffect(
    on(
      () => props.value,
      (v) => {
        hasSelection = !!v;
        setQuery(v?.name ?? '');
      },
      { defer: true },
    ),
  );

  const optionId = (i: number) => `${uid}-opt-${i}`;
  const showingRecent = () => query().trim().length < 2;
  const options = () => (showingRecent() ? (props.recent ?? []) : results());

  const run = (q: string) => {
    cancel();
    if (q.trim().length < 2) return;
    setStatus('loading');
    timer = setTimeout(
      async () => {
        const c = new AbortController();
        ctrl = c;
        try {
          const found = await props.search(q.trim(), c.signal);
          if (c.signal.aborted) return;
          setResults(found);
          setStatus('done');
          setActive(found.length ? 0 : -1);
        } catch (err) {
          if (c.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
          setStatus('error');
        }
      },
      Math.max(300, props.debounceMs ?? 300),
    );
  };
  onCleanup(() => {
    cancel();
    clearTimeout(blurTimer);
  });

  // La opción activa siempre visible al navegar con flechas.
  createEffect(() => {
    const i = active();
    if (i >= 0) document.getElementById(optionId(i))?.scrollIntoView?.({ block: 'nearest' });
  });

  const choose = (place: Place) => {
    cancel();
    hasSelection = true;
    setQuery(place.name);
    setOpen(false);
    setActive(-1);
    props.onSelect(place);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const n = options().length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setOpen(true);
        if (n) setActive((a) => (a + 1) % n);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setOpen(true);
        if (n) setActive((a) => (a <= 0 ? n - 1 : a - 1));
        break;
      case 'Enter': {
        const opt = options()[active()];
        if (open() && opt) {
          e.preventDefault();
          choose(opt);
        }
        break;
      }
      case 'Escape':
        if (open()) {
          e.preventDefault();
          setOpen(false);
        } else if (query()) {
          cancel();
          hasSelection = false;
          setQuery('');
          props.onSelect(null);
        }
        break;
      default:
    }
  };

  const expanded = () => open() && (options().length > 0 || status() !== 'idle');

  return (
    <div class={s.search}>
      <label class={`label ${s.label}`} for={`${uid}-input`}>
        {props.label}
      </label>
      <div class={s.field}>
        <Icon name="search" size={16} class={s.icon} />
        <input
          ref={input}
          id={`${uid}-input`}
          class={s.input}
          type="text"
          size={1}
          role="combobox"
          autocomplete="off"
          spellcheck={false}
          autofocus={props.autofocus}
          placeholder={t().search.placeholder}
          aria-autocomplete="list"
          aria-expanded={expanded()}
          aria-controls={`${uid}-list`}
          aria-activedescendant={expanded() && active() >= 0 ? optionId(active()) : undefined}
          value={query()}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            if (hasSelection) {
              hasSelection = false;
              props.onSelect(null);
            }
            setOpen(true);
            setActive(-1);
            run(e.currentTarget.value);
          }}
          onFocus={() => {
            clearTimeout(blurTimer);
            setOpen(true);
          }}
          onBlur={() => {
            clearTimeout(blurTimer);
            blurTimer = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
        />
        <Show when={query()}>
          <button
            type="button"
            class={s.clear}
            aria-label={t().search.clear}
            onClick={() => {
              cancel();
              hasSelection = false;
              setQuery('');
              props.onSelect(null);
              input.focus();
            }}
          >
            <Icon name="close" size={14} />
          </button>
        </Show>
      </div>
      <div class={s.popover} hidden={!expanded()}>
        <Show when={showingRecent() && options().length}>
          <p class={`label ${s.groupLabel}`} id={`${uid}-recent`}>
            {t().search.recent}
          </p>
        </Show>
        <ul
          id={`${uid}-list`}
          class={s.list}
          role="listbox"
          aria-label={props.label}
          aria-labelledby={showingRecent() ? `${uid}-recent` : undefined}
        >
          <For each={options()}>
            {(place, i) => (
              <li
                id={optionId(i())}
                role="option"
                class={s.option}
                aria-selected={i() === active()}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(place)}
                onPointerMove={() => setActive(i())}
              >
                <Icon name={showingRecent() ? 'clock' : 'pin'} size={16} class={s.optIcon} />
                <span class={s.optText}>
                  <span class={s.optName}>
                    <For each={highlight(place.name, query())}>
                      {(part) => (part.match ? <mark>{part.text}</mark> : part.text)}
                    </For>
                  </span>
                  <Show when={place.detail}>
                    <span class={s.optDetail}>{place.detail}</span>
                  </Show>
                </span>
              </li>
            )}
          </For>
        </ul>
        <div class={s.status} role="status" aria-live="polite">
          <Switch>
            <Match when={!showingRecent() && status() === 'loading'}>{t().search.loading}</Match>
            <Match when={!showingRecent() && status() === 'error'}>
              <span class={s.error}>{t().search.error}</span>
            </Match>
            <Match when={!showingRecent() && status() === 'done' && results().length === 0}>
              {t().search.noResults(query())}
            </Match>
          </Switch>
        </div>
      </div>
    </div>
  );
}

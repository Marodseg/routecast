import { createRoot, createSignal, For, type JSX, onCleanup, Show } from 'solid-js';
import { t } from '../../i18n';
import { Icon, type IconName } from '../Icon/Icon';
import s from './Feedback.module.css';

/** Bloque de carga con la forma del contenido final (evita saltos de layout). */
export function Skeleton(props: { lines?: number; height?: number; label?: string }) {
  return (
    <div class={s.skeleton} role="status" aria-label={props.label ?? t().search.loading}>
      <For each={Array.from({ length: props.lines ?? 3 })}>
        {(_, i) => (
          <span class={s.bone} style={{ height: `${props.height ?? 14}px`, width: `${[92, 70, 84, 58][i() % 4]}%` }} />
        )}
      </For>
    </div>
  );
}

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
  tone?: 'neutral' | 'warning';
}

/** Estados vacío/error con voz propia: qué pasa y qué puede hacer la persona. */
export function EmptyState(props: EmptyStateProps) {
  return (
    <section class={`${s.empty} plate`} data-tone={props.tone ?? 'neutral'}>
      <Icon name={props.icon} size={28} class={s.emptyIcon} />
      <h3 class={s.emptyTitle}>{props.title}</h3>
      <p class={s.emptyBody}>{props.body}</p>
      <Show when={props.action}>
        {(a) => (
          <button type="button" class={s.action} onClick={() => a().onClick()}>
            {a().label}
          </button>
        )}
      </Show>
    </section>
  );
}

export type ToastTone = 'info' | 'warning' | 'error';
interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
  ms: number;
}

/** Errores: no se cierran solos (WCAG 2.2.1). Resto: 6 s, con pausa mientras se señala o enfoca. */
const DEFAULT_MS: Record<ToastTone, number> = { info: 6000, warning: 6000, error: 0 };

const store = createRoot(() => {
  const [items, setItems] = createSignal<ToastItem[]>([]);
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let seq = 0;
  const stop = (id: number) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
  };
  const dismiss = (id: number) => {
    stop(id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  };
  const start = (id: number, ms: number) => {
    stop(id);
    if (ms > 0)
      timers.set(
        id,
        setTimeout(() => dismiss(id), ms),
      );
  };
  const push = (text: string, tone: ToastTone = 'info', ms = DEFAULT_MS[tone]) => {
    const id = ++seq;
    setItems((xs) => {
      const keep = xs.slice(-2);
      for (const old of xs.slice(0, -2)) stop(old.id);
      return [...keep, { id, tone, text, ms }];
    });
    start(id, ms);
    return id;
  };
  return { items, push, dismiss, pause: stop, resume: (it: ToastItem) => start(it.id, it.ms) };
});

export const toast = store.push;
export const dismissToast = store.dismiss;

const toneIcon: Record<ToastTone, IconName> = { info: 'info', warning: 'warning', error: 'error' };

function ToastView(props: { item: ToastItem }) {
  return (
    <li
      class={s.toast}
      data-tone={props.item.tone}
      onPointerEnter={() => store.pause(props.item.id)}
      onPointerLeave={() => store.resume(props.item)}
      onFocusIn={() => store.pause(props.item.id)}
      onFocusOut={() => store.resume(props.item)}
    >
      <Icon name={toneIcon[props.item.tone]} size={16} />
      <span>{props.item.text}</span>
      <button
        type="button"
        class={s.dismiss}
        aria-label={t().toast.dismiss}
        onClick={() => store.dismiss(props.item.id)}
      >
        <Icon name="close" size={14} />
      </button>
    </li>
  );
}

/**
 * Avisos breves. Dos regiones vivas montadas siempre (los lectores no anuncian regiones creadas ya llenas):
 * educada para info/avisos y asertiva para errores. Montar una sola vez en la app.
 */
export function Toaster(): JSX.Element {
  onCleanup(() => {
    for (const it of store.items()) store.dismiss(it.id);
  });
  return (
    <div class={s.toaster}>
      <div aria-live="polite" aria-relevant="additions">
        <ol class={s.stack}>
          <For each={store.items().filter((x) => x.tone !== 'error')}>{(it) => <ToastView item={it} />}</For>
        </ol>
      </div>
      <div role="alert" aria-relevant="additions">
        <ol class={s.stack}>
          <For each={store.items().filter((x) => x.tone === 'error')}>{(it) => <ToastView item={it} />}</For>
        </ol>
      </div>
    </div>
  );
}

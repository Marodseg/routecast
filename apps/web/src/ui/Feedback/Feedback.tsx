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
}

const store = createRoot(() => {
  const [items, setItems] = createSignal<ToastItem[]>([]);
  let seq = 0;
  const dismiss = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));
  const push = (text: string, tone: ToastTone = 'info', ms = 5000) => {
    const id = ++seq;
    setItems((xs) => [...xs.slice(-2), { id, tone, text }]);
    if (ms > 0) setTimeout(() => dismiss(id), ms);
    return id;
  };
  return { items, push, dismiss };
});

export const toast = store.push;
export const dismissToast = store.dismiss;

const toneIcon: Record<ToastTone, IconName> = { info: 'l0', warning: 'l2', error: 'l3' };

/** Región viva de avisos breves. Montar una sola vez en la app. */
export function Toaster(): JSX.Element {
  onCleanup(() => {
    for (const it of store.items()) store.dismiss(it.id);
  });
  return (
    <ol class={s.toaster} aria-live="polite" aria-relevant="additions">
      <For each={store.items()}>
        {(it) => (
          <li class={s.toast} data-tone={it.tone} role={it.tone === 'error' ? 'alert' : 'status'}>
            <Icon name={toneIcon[it.tone]} size={16} />
            <span>{it.text}</span>
            <button type="button" class={s.dismiss} aria-label={t().toast.dismiss} onClick={() => store.dismiss(it.id)}>
              <Icon name="close" size={14} />
            </button>
          </li>
        )}
      </For>
    </ol>
  );
}

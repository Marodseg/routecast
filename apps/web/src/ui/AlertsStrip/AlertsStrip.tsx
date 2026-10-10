import { createMemo, For, Show } from 'solid-js';
import { t } from '../../i18n';
import { Icon } from '../Icon/Icon';
import s from './AlertsStrip.module.css';

export type WarningLevel = 'yellow' | 'orange' | 'red';

export interface StripWarning {
  id: string;
  level: WarningLevel;
  /** Fenómeno ya traducido («Viento», «Lluvias»). */
  phenomenon: string;
  /** Zona o tramo afectado («A-92 entre Antequera y Loja»). */
  area: string;
  from: string;
  to: string;
  source: 'AEMET' | 'Meteoalarm';
}

export interface AlertsStripProps {
  warnings: StripWarning[];
  /** Algún proveedor de avisos falló: se indica sin ocultar lo que sí llegó. */
  partial?: boolean;
}

const RANK: Record<WarningLevel, number> = { yellow: 1, orange: 2, red: 3 };

/** Banda de avisos oficiales que afectan a la ruta en su ventana temporal. */
export function AlertsStrip(props: AlertsStripProps) {
  const sorted = createMemo(() => [...props.warnings].sort((a, b) => RANK[b.level] - RANK[a.level]));
  const top = () => sorted()[0]?.level;

  return (
    <Show
      when={props.warnings.length}
      fallback={
        <p class={s.none} role="status">
          <Icon name="l0" size={14} /> {t().alerts.none}
          <Show when={props.partial}> {t().alerts.partial}</Show>
        </p>
      }
    >
      <details class={s.strip} data-level={top()}>
        <summary class={s.summary}>
          <span class={`${s.bar} risk-fill-${RANK[top() ?? 'yellow']}`} aria-hidden="true" />
          <Icon name="warning" size={16} />
          <span class={s.count}>{t().alerts.count(props.warnings.length)}</span>
          <span class={`label ${s.title}`}>{t().alerts.title}</span>
        </summary>
        <ul class={s.list}>
          <For each={sorted()}>
            {(w) => (
              <li class={s.item}>
                <span class={`${s.swatch} risk-fill-${RANK[w.level]}`} aria-hidden="true" />
                <span class={s.level}>{t().alerts.levels[w.level]}</span>
                <span class={s.what}>
                  <b>{w.phenomenon}</b> · {w.area}
                </span>
                <span class={`${s.when} mono`}>{t().alerts.window(w.from, w.to)}</span>
                <span class={s.src}>{t().alerts.source(w.source)}</span>
              </li>
            )}
          </For>
        </ul>
        <Show when={props.partial}>
          <p class={s.partial}>{t().alerts.partial}</p>
        </Show>
      </details>
    </Show>
  );
}

import { RISK_LEVEL_VALUES } from '@routecast/shared';
import { For } from 'solid-js';
import { t } from '../../i18n';
import { RiskChip } from '../RiskChip/RiskChip';
import s from './Legend.module.css';

export interface LegendProps {
  /** Plegada por defecto en móvil; abierta en escritorio. */
  open?: boolean;
}

/** Leyenda de niveles, plegable con <details> nativo (teclado y lector de pantalla sin JS extra). */
export function Legend(props: LegendProps) {
  return (
    <details class={s.legend} open={props.open}>
      <summary class={s.summary}>
        <span class="label">{t().risk.legend}</span>
      </summary>
      <ul class={s.list}>
        <For each={RISK_LEVEL_VALUES}>
          {(level) => (
            <li>
              <RiskChip level={level} />
            </li>
          )}
        </For>
        <li>
          <RiskChip level="unknown" />
        </li>
      </ul>
      <p class={s.note}>{t().risk.legendNote}</p>
    </details>
  );
}

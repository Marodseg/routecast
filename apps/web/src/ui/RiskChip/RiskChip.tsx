import type { RiskLevelOrUnknown } from '@routecast/shared';
import { Show } from 'solid-js';
import { t } from '../../i18n';
import { Icon, levelIcon } from '../Icon/Icon';
import s from './RiskChip.module.css';

export interface RiskChipProps {
  level: RiskLevelOrUnknown;
  /** Texto corto («Alto») en vez del largo («Alto»/«Sin riesgo»). */
  short?: boolean;
  /** Solo muestra muestra + icono; el texto queda para lectores de pantalla. */
  compact?: boolean;
  /** Sin pictograma de forma (cuando el espacio es mínimo; color + patrón + texto siguen presentes). */
  noIcon?: boolean;
  class?: string;
}

/** Nivel de riesgo con color + patrón + forma + texto (DESIGN §3.2). */
export function RiskChip(props: RiskChipProps) {
  const text = () =>
    props.level === 'unknown' ? t().risk.unknown : (props.short ? t().risk.short : t().risk.levels)[props.level];
  return (
    <span class={`${s.chip} ${props.class ?? ''}`} data-level={props.level}>
      <span class={`${s.swatch} risk-fill-${props.level}`} aria-hidden="true" />
      <Show when={!props.noIcon}>
        <Icon name={levelIcon(props.level)} size={14} class={s.icon} />
      </Show>
      <span class={props.compact ? 'visually-hidden' : s.text}>{text()}</span>
    </span>
  );
}

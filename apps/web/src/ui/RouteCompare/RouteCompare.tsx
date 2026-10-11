import type { RiskLevelOrUnknown } from '@routecast/shared';
import { For, Show } from 'solid-js';
import { t } from '../../i18n';
import { duration } from '../../lib/format';
import { Icon } from '../Icon/Icon';
import { Odometer } from '../Odometer/Odometer';
import { RiskChip } from '../RiskChip/RiskChip';
import { type ProfileSegment, RiskProfile } from '../RiskProfile/RiskProfile';
import s from './RouteCompare.module.css';

export interface CompareRoute {
  id: string;
  name: string;
  via: string;
  distanceKm: number;
  durationMin: number;
  arrival: string;
  worst: RiskLevelOrUnknown;
  kmHigh: number;
  profile: ProfileSegment[];
  /** «17:24 · Racha cruzada de 62 km/h (racha 82)»; vacío si no hay riesgo. */
  worstText?: string;
  /** Avisos oficiales en la ruta a la hora de paso. */
  alerts?: number;
}

export interface RouteCompareProps {
  /** Ya ordenadas por core (peor nivel, km en riesgo alto, duración; SPEC §6.4). */
  routes: CompareRoute[];
  selected?: string;
  onSelect?: (id: string) => void;
  loading?: boolean;
}

/** Comparador: tres lecturas por ruta (tiempo, peor nivel, km en riesgo alto) + perfil. Sin nota opaca. */
export function RouteCompare(props: RouteCompareProps) {
  return (
    <section class={s.compare} aria-busy={props.loading ? 'true' : undefined}>
      <h2 class="visually-hidden">{t().compare.caption}</h2>
      <div class={s.head} aria-hidden="true">
        <span class="label">{t().compare.route}</span>
        <span class="label">{t().compare.time}</span>
        <span class="label">{t().compare.worst}</span>
        <span class="label">{t().compare.high}</span>
      </div>
      <ol class={s.list}>
        <For each={props.routes}>
          {(r, i) => (
            <li class={s.item} style={{ '--i': i() }}>
              <button
                type="button"
                class={s.row}
                classList={{ [s.selected ?? '']: r.id === props.selected }}
                aria-pressed={r.id === props.selected}
                onClick={() => props.onSelect?.(r.id)}
              >
                <span class={s.name}>
                  <span class={s.id}>{r.id}</span>
                  <span class={s.roads}>{r.name}</span>
                </span>
                <span class={s.num}>{duration(r.durationMin)}</span>
                <span class={s.risk}>
                  <RiskChip level={r.worst} short noIcon />
                </span>
                <span class={s.num}>
                  <Odometer value={String(r.kmHigh)} />
                  <small> {t().units.km}</small>
                  <span class="visually-hidden">{t().compare.kmHigh(r.kmHigh)}</span>
                </span>
                <span class={s.sub}>
                  {r.via} · {r.distanceKm} {t().units.km} · {t().compare.arrival('')}
                  <Odometer value={r.arrival} />
                </span>
                <span class={s.profile}>
                  <RiskProfile segments={r.profile} totalKm={r.distanceKm} routeId={r.id} variant="mini" />
                </span>
                <Show when={r.alerts}>
                  <span class={s.alerts}>
                    <Icon name="warning" size={14} /> {t().alerts.onRoute(r.alerts ?? 0)}
                  </span>
                </Show>
                <span class={s.worst}>
                  <Show when={r.worstText} fallback={t().compare.noRisk}>
                    {r.worstText}
                  </Show>
                </span>
              </button>
            </li>
          )}
        </For>
      </ol>
    </section>
  );
}

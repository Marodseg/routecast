import type { Factor, RiskLevelOrUnknown } from '@routecast/shared';
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
  /** Qué es el peligro del peor punto («Poca visibilidad»): el nivel solo no dice nada. */
  cause?: { factor: Factor; label: string };
  /** La previsión acaba antes del destino (salida tardía del último día): el nivel solo vale hasta este km. */
  dataUntilKm?: number;
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
                <Show
                  when={!props.loading}
                  fallback={
                    <>
                      <span class={[s.risk, s.pending].join(' ')}>{t().compare.pending}</span>
                      <span class={[s.num, s.pending].join(' ')} aria-hidden="true">
                        —
                      </span>
                    </>
                  }
                >
                  <span class={[s.risk, s.reveal].join(' ')}>
                    <RiskChip level={r.worst} short noIcon />
                    <Show when={r.cause}>
                      {(c) => (
                        <span class={s.cause}>
                          <Icon name={c().factor} size={13} />
                          {c().label}
                        </span>
                      )}
                    </Show>
                    <Show when={r.dataUntilKm !== undefined}>
                      <span class={s.cause}>
                        <Icon name="unknown" size={13} />
                        {t().compare.dataUntil(r.dataUntilKm ?? 0)}
                      </span>
                    </Show>
                  </span>
                  <span class={[s.num, s.reveal].join(' ')}>
                    <Odometer value={String(r.kmHigh)} />
                    <small> {t().units.km}</small>
                    <span class="visually-hidden">{t().compare.kmHigh(r.kmHigh)}</span>
                  </span>
                </Show>
                <span class={s.sub}>
                  {r.via} · {r.distanceKm} {t().units.km} · {t().compare.arrival('')}
                  <Odometer value={r.arrival} />
                </span>
                <span class={s.profile}>
                  <Show when={!props.loading} fallback={<span class={s.scan} aria-hidden="true" />}>
                    <span class={s.reveal}>
                      <RiskProfile
                        segments={r.profile}
                        totalKm={r.distanceKm}
                        routeId={r.id}
                        variant="mini"
                        thin={r.worst === 0}
                      />
                    </span>
                  </Show>
                </span>
                <Show when={r.alerts}>
                  <span class={s.alerts}>
                    <Icon name="warning" size={14} /> {t().alerts.onRoute(r.alerts ?? 0)}
                  </span>
                </Show>
                {/* Solo con un riesgo concreto: «Bajo» o «Sin datos» ya lo dice el nivel, en texto. */}
                <Show when={!props.loading && r.worstText}>
                  <span class={[s.worst, s.reveal].join(' ')}>{r.worstText}</span>
                </Show>
              </button>
            </li>
          )}
        </For>
      </ol>
    </section>
  );
}

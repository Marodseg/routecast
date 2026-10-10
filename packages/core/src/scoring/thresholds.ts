import type { Factor } from '@routecast/shared';

/**
 * Umbrales de riesgo — ÚNICA fuente (SPEC §6.3).
 *
 * Son VALORES INICIALES razonables para un turismo en carretera, no verdad científica ni normativa. Cualquier
 * cambio pasa por `scoring-reviewer` y queda anotado en el PR o en una ADR. Cada borde tiene test exacto
 * (≥ frente a >) en `test/scoring.test.ts`.
 *
 * Convención: `levels` = [nivel 1, nivel 2, nivel 3]; un valor alcanza el nivel cuando cumple la comparación.
 */
export interface Thresholds {
  /** Precipitación (mm/h), ≥. Referencia orientativa: «fuerte» ≥ 15-30 mm/h según el servicio; 2,5 ya reduce adherencia y visibilidad. */
  rainMmH: readonly [number, number, number];
  /** Racha × |sen θ| (km/h), ≥. Turismos se desestabilizan ~60-80 km/h de lateral; furgonetas y motos antes (perfil de vehículo en v2). */
  crossGustKmH: readonly [number, number, number];
  /** Racha total (km/h), ≥. Orientativo: AEMET fija umbrales de aviso por zona (Meteoalerta); pendiente contrastar. */
  gustKmH: readonly [number, number, number];
  /** Nieve (cm/h): nivel 1 con cualquier valor > 0; niveles 2 y 3, ≥. */
  snowCmH: { readonly anyAbove: number; readonly level2: number; readonly level3: number };
  /** Visibilidad (m), <. 1000 m = niebla (definición OMM); 100 m ≈ límite para circular con seguridad. */
  visibilityM: readonly [number, number, number];
  ice: {
    /** Temperatura (°C) ≤ con precipitación → nivel 1 (posible hielo/aguanieve). */
    readonly maxTempC: number;
    /** Precipitación mínima (mm/h) para considerar «con precipitación» (0,1 daba falsos positivos con llovizna). */
    readonly minPrecipMmH: number;
    /** Códigos WMO de llovizna/lluvia engelante → nivel 2. */
    readonly freezingCodes: readonly number[];
  };
  storm: {
    /** WMO 95: tormenta → nivel 1. */
    readonly thunderCodes: readonly number[];
    /** WMO 96/99: tormenta con granizo → nivel 2 y marca de RIESGO de granizo (nunca certeza). */
    readonly hailCodes: readonly number[];
    /**
     * CAPE (J/kg) ≥ … y potencial de rayos ≥ … → nivel 2 (riesgo de tormenta fuerte o con granizo). A calibrar.
     * Open-Meteo solo da `lightning_potential` en datos de 15 min y para algunos modelos: con datos horarios suele faltar
     * y la tormenta se evalúa solo por código WMO.
     */
    readonly capeHigh: number;
    readonly lightningHigh: number;
  };
  /** Nº de grupos independientes en nivel ≥ 2, en la misma hora, que suben un nivel al punto (acotado a 3). */
  coincidenceFactors: number;
  /**
   * Factores que salen de la misma medida o están correlacionados en el modelo y cuentan como uno en el bonus:
   * racha y racha cruzada (misma racha); lluvia, nieve y visibilidad (la visibilidad modelada depende de la precipitación).
   */
  coincidenceGroups: readonly (readonly Factor[])[];
  /**
   * Factores sin los que no se puede afirmar «sin riesgo». Si falta uno y lo conocido es 0, el punto es `unknown`;
   * si falta otro factor, el punto es 0 «parcial» y la UI lo indica.
   */
  essentialFactors: readonly Factor[];
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  rainMmH: [2.5, 7.5, 20],
  crossGustKmH: [40, 60, 80],
  gustKmH: [60, 80, 100],
  snowCmH: { anyAbove: 0, level2: 0.5, level3: 2 },
  visibilityM: [1000, 400, 100],
  ice: { maxTempC: 2, minPrecipMmH: 0.2, freezingCodes: [56, 57, 66, 67] },
  storm: { thunderCodes: [95], hailCodes: [96, 99], capeHigh: 1500, lightningHigh: 2 },
  coincidenceFactors: 2,
  coincidenceGroups: [['gust', 'crosswind'], ['rain', 'snow', 'visibility'], ['ice'], ['storm']],
  essentialFactors: ['rain', 'gust', 'crosswind'],
};

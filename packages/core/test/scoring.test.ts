import { describe, expect, it } from 'vitest';
import { scoreHour, scorePoint } from '../src/scoring/score';
import { DEFAULT_THRESHOLDS as TH } from '../src/scoring/thresholds';
import { calmHour } from './fixtures';

const HEADING = 0; // circulando hacia el norte

describe('scoreHour: niveles por factor en los bordes exactos (SPEC §6.3)', () => {
  it.each([
    [2.4, 0],
    [2.5, 1],
    [7.4, 1],
    [7.5, 2],
    [19.9, 2],
    [20, 3],
  ])('lluvia %d mm/h → nivel %d', (mm, level) => {
    expect(scoreHour(calmHour(undefined, { precipitationMmH: mm, tempC: 15 }), HEADING, TH).factors.rain).toBe(level);
  });

  it.each([
    [39.9, 0],
    [40, 1],
    [60, 2],
    [80, 3],
  ])('racha cruzada %d km/h (viento del este, 90°) → nivel %d', (gust, level) => {
    const f = scoreHour(calmHour(undefined, { gustsKmH: gust, windFromDeg: 90 }), HEADING, TH).factors;
    expect(f.crosswind).toBe(level);
  });

  it('la misma racha de frente no es viento cruzado', () => {
    const f = scoreHour(calmHour(undefined, { gustsKmH: 85, windFromDeg: 0 }), HEADING, TH).factors;
    expect(f.crosswind).toBe(0);
    expect(f.gust).toBe(2);
  });

  it.each([
    [59.9, 0],
    [60, 1],
    [80, 2],
    [100, 3],
  ])('racha total %d km/h → nivel %d', (gust, level) => {
    expect(scoreHour(calmHour(undefined, { gustsKmH: gust }), HEADING, TH).factors.gust).toBe(level);
  });

  it.each([
    [0, 0],
    [0.01, 1],
    [0.5, 2],
    [2, 3],
  ])('nieve %d cm/h → nivel %d', (cm, level) => {
    expect(scoreHour(calmHour(undefined, { snowfallCmH: cm, tempC: -1 }), HEADING, TH).factors.snow).toBe(level);
  });

  it.each([
    [1000, 0],
    [999, 1],
    [400, 1],
    [399, 2],
    [100, 2],
    [99, 3],
  ])('visibilidad %d m → nivel %d', (m, level) => {
    expect(scoreHour(calmHour(undefined, { visibilityM: m }), HEADING, TH).factors.visibility).toBe(level);
  });

  it('hielo: T ≤ 2 °C con precipitación → 1; códigos de lluvia/llovizna engelante → 2', () => {
    expect(scoreHour(calmHour(undefined, { tempC: 2, precipitationMmH: 0.2 }), HEADING, TH).factors.ice).toBe(1);
    expect(scoreHour(calmHour(undefined, { tempC: 2.1, precipitationMmH: 0.2 }), HEADING, TH).factors.ice).toBe(0);
    expect(scoreHour(calmHour(undefined, { tempC: 1, precipitationMmH: 0 }), HEADING, TH).factors.ice).toBe(0);
    for (const code of [56, 57, 66, 67]) {
      expect(scoreHour(calmHour(undefined, { weatherCode: code }), HEADING, TH).factors.ice).toBe(2);
    }
  });

  it('tormenta: 95 → 1; 96/99 → 2 y se marca como RIESGO de granizo, no certeza', () => {
    expect(scoreHour(calmHour(undefined, { weatherCode: 95 }), HEADING, TH).factors.storm).toBe(1);
    for (const code of [96, 99]) {
      const r = scoreHour(calmHour(undefined, { weatherCode: code }), HEADING, TH);
      expect(r.factors.storm).toBe(2);
      expect(r.hailRisk).toBe(true);
    }
    expect(scoreHour(calmHour(undefined, { weatherCode: 95 }), HEADING, TH).hailRisk).toBe(false);
  });

  it('tormenta: CAPE alto + potencial de rayos alto → 2 aunque el código no sea de tormenta', () => {
    const r = scoreHour(
      calmHour(undefined, { cape: TH.storm.capeHigh, lightningPotential: TH.storm.lightningHigh }),
      HEADING,
      TH,
    );
    expect(r.factors.storm).toBe(2);
    expect(r.hailRisk).toBe(true);
  });
});

describe('scoreHour: datos ausentes', () => {
  it('sin racha o sin dirección → viento cruzado unknown; sin racha → racha unknown', () => {
    const noGust = scoreHour(calmHour(undefined, { gustsKmH: null }), HEADING, TH).factors;
    expect(noGust.crosswind).toBe('unknown');
    expect(noGust.gust).toBe('unknown');
    const noDir = scoreHour(calmHour(undefined, { windFromDeg: null }), HEADING, TH).factors;
    expect(noDir.crosswind).toBe('unknown');
    expect(noDir.gust).toBe(0);
  });

  it('nunca trata un null como 0', () => {
    const f = scoreHour(
      calmHour(undefined, { precipitationMmH: null, visibilityM: null, snowfallCmH: null }),
      HEADING,
      TH,
    ).factors;
    expect(f.rain).toBe('unknown');
    expect(f.visibility).toBe('unknown');
    expect(f.snow).toBe('unknown');
  });

  it('código de tiempo ausente → tormenta unknown salvo que CAPE+rayos ya den nivel', () => {
    expect(scoreHour(calmHour(undefined, { weatherCode: null }), HEADING, TH).factors.storm).toBe('unknown');
  });

  it('hielo: con código engelante basta; sin temperatura ni código, unknown', () => {
    expect(scoreHour(calmHour(undefined, { tempC: null, weatherCode: 66 }), HEADING, TH).factors.ice).toBe(2);
    expect(scoreHour(calmHour(undefined, { tempC: null, weatherCode: null }), HEADING, TH).factors.ice).toBe('unknown');
  });

  it('hielo: por encima de 2 °C es 0 aunque falte la precipitación (B1)', () => {
    expect(scoreHour(calmHour(undefined, { tempC: 5, precipitationMmH: null }), HEADING, TH).factors.ice).toBe(0);
  });
});

describe('scorePoint: combinación (SPEC §6.3)', () => {
  it('sin horas → unknown con todos los factores desconocidos', () => {
    const p = scorePoint([], HEADING, TH);
    expect(p.level).toBe('unknown');
    expect(p.unknownFactors).toHaveLength(7);
  });

  it('el nivel es el máximo de los factores y guarda el determinante', () => {
    const p = scorePoint([calmHour(undefined, { precipitationMmH: 8, tempC: 15 })], HEADING, TH);
    expect(p.level).toBe(2);
    expect(p.dominant).toBe('rain');
    expect(p.values.precipitationMmH).toBe(8);
  });

  it('dos grupos independientes en nivel ≥ 2 en la misma hora suben un nivel, acotado a 3', () => {
    const two = scorePoint(
      [calmHour(undefined, { precipitationMmH: 8, tempC: 15, gustsKmH: 85, windFromDeg: 0 })],
      HEADING,
      TH,
    );
    expect(two.factors.rain).toBe(2);
    expect(two.factors.gust).toBe(2);
    expect(two.level).toBe(3);
    const already3 = scorePoint([calmHour(undefined, { precipitationMmH: 25, tempC: 15, gustsKmH: 105 })], HEADING, TH);
    expect(already3.level).toBe(3);
  });

  it('racha y racha cruzada salen de la misma medida: no se suman en el bonus (S1)', () => {
    // 85 km/h a 60° del rumbo: racha nivel 2 y cruzada 73,6 km/h nivel 2 → sigue siendo 2.
    const p = scorePoint([calmHour(undefined, { gustsKmH: 85, windFromDeg: 60 })], HEADING, TH);
    expect(p.factors.gust).toBe(2);
    expect(p.factors.crosswind).toBe(2);
    expect(p.level).toBe(2);
  });

  it('lluvia y visibilidad están correlacionadas en el modelo: no se suman en el bonus', () => {
    const p = scorePoint([calmHour(undefined, { precipitationMmH: 8, tempC: 15, visibilityM: 300 })], HEADING, TH);
    expect(p.level).toBe(2);
  });

  it('el bonus se calcula dentro de cada hora, no mezclando horas distintas (B5)', () => {
    const p = scorePoint(
      [calmHour(undefined, { precipitationMmH: 8, tempC: 15 }), calmHour(undefined, { gustsKmH: 85, windFromDeg: 0 })],
      HEADING,
      TH,
    );
    expect(p.factors.rain).toBe(2);
    expect(p.factors.gust).toBe(2);
    expect(p.level).toBe(2);
  });

  it('el peor caso de la ventana se toma por factor (lluvia de una hora, racha de otra)', () => {
    const p = scorePoint(
      [calmHour(undefined, { precipitationMmH: 3, tempC: 15 }), calmHour(undefined, { gustsKmH: 85, windFromDeg: 90 })],
      HEADING,
      TH,
    );
    expect(p.factors.rain).toBe(1);
    expect(p.factors.crosswind).toBe(3);
    expect(p.values.crossGustKmH).toBe(85);
    expect(p.values.windFromDeg).toBe(90);
    expect(p.level).toBe(3);
    expect(p.dominant).toBe('crosswind');
  });

  it('con riesgo 0 conocido pero un factor ESENCIAL desconocido (viento, lluvia) el punto es unknown', () => {
    const p = scorePoint([calmHour(undefined, { gustsKmH: null })], HEADING, TH);
    expect(p.level).toBe('unknown');
    expect(p.unknownFactors).toEqual(expect.arrayContaining(['crosswind', 'gust']));
  });

  it('con riesgo ≥ 1 conocido se informa ese nivel y se listan los desconocidos', () => {
    const p = scorePoint([calmHour(undefined, { gustsKmH: null, precipitationMmH: 8, tempC: 15 })], HEADING, TH);
    expect(p.level).toBe(2);
    expect(p.unknownFactors).toEqual(expect.arrayContaining(['crosswind', 'gust']));
  });

  it('si solo falta un factor secundario (visibilidad) el punto es 0 parcial, no unknown (M2)', () => {
    const p = scorePoint([calmHour(undefined, { visibilityM: null })], HEADING, TH);
    expect(p.level).toBe(0);
    expect(p.partial).toBe(true);
    expect(p.unknownFactors).toEqual(['visibility']);
  });

  it('una hora en calma total es nivel 0 sin factor determinante', () => {
    const p = scorePoint([calmHour()], HEADING, TH);
    expect(p.level).toBe(0);
    expect(p.dominant).toBeUndefined();
  });
});

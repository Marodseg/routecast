import { describe, expect, it } from 'vitest';
import {
  horizonEndMs,
  localMidnightMs,
  localMidnightPlus,
  nextStep,
  seriesCoversHorizon,
  seriesEndMs,
  toMinutes,
  toMs,
} from './time';

describe('tiempo del dial', () => {
  it('redondea «ahora» al siguiente múltiplo de 10 min', () => {
    const t = Date.UTC(2026, 9, 10, 14, 41, 5);
    expect(nextStep(t)).toBe(Date.UTC(2026, 9, 10, 14, 50));
    expect(nextStep(Date.UTC(2026, 9, 10, 14, 40))).toBe(Date.UTC(2026, 9, 10, 14, 40));
  });

  it('minutos ↔ ms son inversos respecto a la medianoche local', () => {
    const now = Date.UTC(2026, 9, 10, 14, 40);
    const day = localMidnightMs(now);
    expect(toMs(toMinutes(now, day), day)).toBe(now);
    expect(new Date(day).getHours()).toBe(0);
  });

  it('el horizonte llega varios días y no se sale de la serie de 7 días', () => {
    const now = Date.UTC(2026, 9, 11, 15, 9);
    const end = horizonEndMs(now);
    expect(end).toBeGreaterThanOrEqual(nextStep(now));
    expect(end).toBeLessThanOrEqual(seriesEndMs(now));
    expect(end - now).toBeGreaterThan(5 * 24 * 3_600_000);
    expect(end - now).toBeLessThanOrEqual(7 * 24 * 3_600_000);
    expect(seriesCoversHorizon(seriesEndMs(now), now)).toBe(true);
    expect(seriesCoversHorizon(now + 2 * 24 * 3_600_000, now)).toBe(false);
  });
});

describe('cambio de hora (Europe/Madrid)', () => {
  it('las medianoches de calendario cruzan el 25 de octubre (día de 25 h) y el 29 de marzo (23 h)', () => {
    const oct = localMidnightMs(new Date(2026, 9, 24, 12).getTime());
    const d25 = localMidnightPlus(oct, 1);
    const d26 = localMidnightPlus(oct, 2);
    expect(new Date(d25).getDate()).toBe(25);
    expect(new Date(d26).getHours()).toBe(0);
    expect(d26 - d25).toBe(25 * 3_600_000);

    const mar = localMidnightMs(new Date(2026, 2, 28, 12).getTime());
    const d29 = localMidnightPlus(mar, 1);
    expect(localMidnightPlus(mar, 2) - d29).toBe(23 * 3_600_000);
  });

  it('el horizonte se calcula igual con un cambio de hora dentro de la semana', () => {
    const now = new Date(2026, 9, 20, 15, 9).getTime();
    const end = horizonEndMs(now);
    expect(end).toBeLessThanOrEqual(seriesEndMs(now));
    expect(new Date(end).getMinutes() % 10).toBe(0);
  });
});

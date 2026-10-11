import { describe, expect, it } from 'vitest';
import { localMidnightMs, nextStep, toMinutes, toMs } from './time';

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
});

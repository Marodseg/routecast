import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { setLang } from '../../i18n';
import { mergeSegments, RiskProfile } from './RiskProfile';

const segments = [
  { fromKm: 0, toKm: 20, level: 0 as const },
  { fromKm: 20, toKm: 60, level: 3 as const },
  { fromKm: 60, toKm: 100, level: 1 as const },
];

describe('mergeSegments', () => {
  it('une tramos contiguos del mismo nivel y respeta los cambios', () => {
    expect(
      mergeSegments([
        { fromKm: 0, toKm: 5, level: 0 },
        { fromKm: 5, toKm: 10, level: 0 },
        { fromKm: 10, toKm: 15, level: 2 },
        { fromKm: 15, toKm: 20, level: 'unknown' },
        { fromKm: 20, toKm: 25, level: 'unknown' },
      ]),
    ).toEqual([
      { fromKm: 0, toKm: 10, level: 0 },
      { fromKm: 10, toKm: 15, level: 2 },
      { fromKm: 15, toKm: 25, level: 'unknown' },
    ]);
  });

  it('no modifica la entrada', () => {
    const input = [
      { fromKm: 0, toKm: 5, level: 1 as const },
      { fromKm: 5, toKm: 10, level: 1 as const },
    ];
    mergeSegments(input);
    expect(input[0]?.toKm).toBe(5);
  });
});

describe('RiskProfile', () => {
  it('sin cursor no inventa un valor y resume los tramos de riesgo', () => {
    setLang('es');
    render(() => <RiskProfile segments={segments} totalKm={100} routeId="A" variant="full" />);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuetext')).toMatch(/flechas/);
    expect(document.getElementById(slider.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Riesgo alto o severo en km 20–60.',
    );
  });

  it('el teclado mueve el cursor y anuncia km y nivel', () => {
    setLang('es');
    render(() => <RiskProfile segments={segments} totalKm={100} routeId="A" variant="full" />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider.getAttribute('aria-valuenow')).toBe('100');
    fireEvent.keyDown(slider, { key: 'Home' });
    fireEvent.keyDown(slider, { key: 'PageUp' });
    expect(slider.getAttribute('aria-valuetext')).toBe('km 10: Sin riesgo');
    fireEvent.keyDown(slider, { key: 'PageUp' });
    fireEvent.keyDown(slider, { key: 'PageUp' });
    expect(slider.getAttribute('aria-valuetext')).toBe('km 30: Severo');
    fireEvent.keyDown(slider, { key: 'Escape' });
    expect(slider.getAttribute('aria-valuetext')).toMatch(/flechas/);
  });
});

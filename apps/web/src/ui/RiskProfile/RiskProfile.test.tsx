import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { setLang } from '../../i18n';
import { RiskProfile } from './RiskProfile';

const segments = [
  { fromKm: 0, toKm: 20, level: 0 as const },
  { fromKm: 20, toKm: 60, level: 3 as const },
  { fromKm: 60, toKm: 100, level: 1 as const },
];

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

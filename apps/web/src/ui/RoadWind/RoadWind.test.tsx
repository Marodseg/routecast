import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { setLang } from '../../i18n';
import { RoadWind } from './RoadWind';

describe('RoadWind', () => {
  it('describe la componente cruzada en texto accesible', () => {
    setLang('es');
    render(() => <RoadWind headingDeg={52} windFromDeg={281} gustKmH={82} readout />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/62 km\/h empujan de lado/);
  });

  it('un dato ausente (NaN) se muestra como sin datos, sin lanzar', () => {
    setLang('es');
    render(() => <RoadWind headingDeg={52} windFromDeg={Number.NaN} gustKmH={82} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Sin datos/);
  });
});

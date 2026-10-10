import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { setLang } from '../../i18n';
import { type CompareRoute, RouteCompare } from './RouteCompare';

const routes: CompareRoute[] = [
  {
    id: 'B',
    name: 'A-7 · A-44',
    via: 'por Motril',
    distanceKm: 171,
    durationMin: 106,
    arrival: '18:46',
    worst: 1,
    kmHigh: 0,
    profile: [{ fromKm: 0, toKm: 171, level: 1 }],
    worstText: '18:10 · Lluvia de 3,4 mm/h',
  },
  {
    id: 'A',
    name: 'A-45 · A-92',
    via: 'por Antequera',
    distanceKm: 128,
    durationMin: 84,
    arrival: '18:24',
    worst: 3,
    kmHigh: 58,
    profile: [{ fromKm: 0, toKm: 128, level: 3 }],
  },
];

describe('RouteCompare', () => {
  it('muestra las tres lecturas por ruta en el orden recibido', () => {
    setLang('es');
    render(() => <RouteCompare routes={routes} selected="A" />);
    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('1 h 46');
    expect(rows[0]?.textContent).toContain('Precaución');
    expect(rows[1]?.textContent).toContain('Severo');
    expect(rows[1]?.textContent).toContain('58 km en riesgo alto o severo');
  });

  it('marca la seleccionada con aria-pressed y avisa al pulsar otra', () => {
    const onSelect = vi.fn();
    render(() => <RouteCompare routes={routes} selected="A" onSelect={onSelect} />);
    const [b, a] = screen.getAllByRole('button');
    expect(a?.getAttribute('aria-pressed')).toBe('true');
    expect(b?.getAttribute('aria-pressed')).toBe('false');
    if (b) fireEvent.click(b);
    expect(onSelect).toHaveBeenCalledWith('B');
  });

  it('sin riesgo lo dice en texto, no solo con color', () => {
    render(() => <RouteCompare routes={routes} />);
    expect(screen.getAllByRole('button')[1]?.textContent).toContain('Sin tramos con riesgo a esta hora');
  });
});

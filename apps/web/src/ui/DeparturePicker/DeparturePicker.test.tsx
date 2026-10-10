import { fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { DeparturePicker } from './DeparturePicker';

function setup(initial = 17 * 60, disabled = false) {
  const [value, setValue] = createSignal(initial);
  render(() => (
    <DeparturePicker
      value={value()}
      onChange={setValue}
      min={15 * 60 + 40}
      max={23 * 60 + 50}
      now={15 * 60 + 40}
      bands={[{ id: 'A', levels: [0, 1, 2, 3, 'unknown', 0, 0, 0, 0] }]}
      selected="A"
      valueText={(v) => `valor ${v}`}
      disabled={disabled}
    />
  ));
  return { slider: screen.getByRole('slider'), value };
}

describe('DeparturePicker', () => {
  it('expone un slider accesible con valor y texto', () => {
    const { slider } = setup();
    expect(slider.getAttribute('aria-valuenow')).toBe('1020');
    expect(slider.getAttribute('aria-valuemin')).toBe('940');
    expect(slider.getAttribute('aria-valuemax')).toBe('1430');
    expect(slider.getAttribute('aria-valuetext')).toBe('valor 1020');
  });

  it('flechas mueven 10 min y Re Pág / Av Pág una hora', () => {
    const { slider, value } = setup();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(value()).toBe(1030);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(value()).toBe(1010);
    fireEvent.keyDown(slider, { key: 'PageUp' });
    expect(value()).toBe(1070);
    fireEvent.keyDown(slider, { key: 'PageDown' });
    expect(value()).toBe(1010);
  });

  it('Inicio vuelve a «ahora» y Fin va al máximo; nunca se sale del rango', () => {
    const { slider, value } = setup();
    fireEvent.keyDown(slider, { key: 'End' });
    expect(value()).toBe(1430);
    fireEvent.keyDown(slider, { key: 'PageUp' });
    expect(value()).toBe(1430);
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(value()).toBe(940);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(value()).toBe(940);
  });

  it('el botón «Ahora» vuelve a la hora actual', () => {
    const { value } = setup();
    fireEvent.click(screen.getByRole('button', { name: /ahora|now/i }));
    expect(value()).toBe(940);
  });

  it('deshabilitado no responde al teclado ni es tabulable', () => {
    const { slider, value } = setup(1020, true);
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(value()).toBe(1020);
    expect(slider.getAttribute('tabindex')).toBe('-1');
    expect(slider.getAttribute('aria-disabled')).toBe('true');
  });
});

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

  it('la fila cambia de día, conserva el minuto y marca el día orientativo', () => {
    const epoch = new Date(2026, 9, 11).setHours(0, 0, 0, 0);
    const at = (offset: number) => {
      const d = new Date(epoch);
      d.setDate(d.getDate() + offset);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    const days = [
      { startMs: at(0), orientative: false },
      { startMs: at(1), orientative: false },
      { startMs: at(2), orientative: true },
    ];
    const [value, setValue] = createSignal(17 * 60);
    render(() => (
      <DeparturePicker
        value={value()}
        onChange={setValue}
        min={15 * 60}
        max={6 * 1440}
        now={15 * 60}
        epochMs={epoch}
        days={days}
        onDay={(start) => {
          const cur = new Date(epoch + value() * 60_000);
          const next = new Date(start);
          next.setHours(cur.getHours(), cur.getMinutes(), 0, 0);
          setValue(Math.round((next.getTime() - epoch) / 60_000));
        }}
      />
    ));
    const tomorrow = screen.getByRole('radio', { name: /mañana|tomorrow/i });
    if (!(tomorrow instanceof HTMLInputElement)) throw new Error('el día no es un radio');
    expect(tomorrow.checked).toBe(false);
    fireEvent.click(tomorrow);
    expect(value()).toBe(1440 + 17 * 60);
    expect(tomorrow.checked).toBe(true);
    fireEvent.keyDown(tomorrow, { key: 'ArrowRight' });
    const guide = screen.getByRole('radio', { name: /orientativa|guide/i });
    if (!(guide instanceof HTMLInputElement)) throw new Error('el día no es un radio');
    expect(guide.checked).toBe(true);
    expect(value()).toBe(2 * 1440 + 17 * 60);
  });

  it('deshabilitado no responde al teclado ni es tabulable', () => {
    const { slider, value } = setup(1020, true);
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(value()).toBe(1020);
    expect(slider.getAttribute('tabindex')).toBe('-1');
    expect(slider.getAttribute('aria-disabled')).toBe('true');
  });
});

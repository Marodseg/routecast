import { fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { setLang } from '../../i18n';
import { BottomSheet, type Snap } from './BottomSheet';

function setup(initial: Snap = 'peek') {
  setLang('es');
  const [snap, setSnap] = createSignal<Snap>(initial);
  const bg = document.createElement('div');
  document.body.appendChild(bg);
  render(() => (
    <div style={{ position: 'relative', height: '600px' }}>
      <BottomSheet snap={snap()} onSnap={setSnap} inertTarget={() => bg}>
        <button type="button">dentro</button>
      </BottomSheet>
    </div>
  ));
  return { snap, bg, handle: screen.getByRole('button', { name: /panel/i }) };
}

describe('BottomSheet', () => {
  it('el asa recorre peek → half → full → peek', () => {
    const { snap, handle } = setup();
    fireEvent.click(handle);
    expect(snap()).toBe('half');
    fireEvent.click(handle);
    expect(snap()).toBe('full');
    fireEvent.click(handle);
    expect(snap()).toBe('peek');
  });

  it('tras un arrastre, la siguiente activación sí funciona', () => {
    const { snap, handle } = setup('half');
    fireEvent.pointerDown(handle, { button: 0, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 340, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.click(handle); // clic sintético del propio arrastre: se ignora
    const after = snap();
    fireEvent.click(handle); // activación real (p. ej. Enter)
    expect(snap()).not.toBe(after);
  });

  it('con la hoja completa el fondo es inert y Escape la pliega', () => {
    const { snap, bg, handle } = setup('full');
    expect(bg.inert).toBe(true);
    expect(handle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(snap()).toBe('half');
    expect(bg.inert).toBe(false);
  });

  it('en peek el contenido fuera de pantalla no es alcanzable', () => {
    setup('peek');
    const inner = screen.getByRole('button', { name: 'dentro', hidden: true });
    expect(inner.closest('[inert]')).not.toBeNull();
  });
});

import { fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLang } from '../../i18n';
import { dismissToast, Toaster, toast } from './Feedback';

beforeEach(() => {
  vi.useFakeTimers();
  setLang('es');
});
afterEach(() => vi.useRealTimers());

describe('Toaster', () => {
  it('las regiones vivas existen antes de que llegue ningún aviso', () => {
    const { container } = render(() => <Toaster />);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('info se cierra sola; el error persiste hasta cerrarlo', async () => {
    render(() => <Toaster />);
    toast('hecho');
    const err = toast('fallo', 'error');
    await vi.advanceTimersByTimeAsync(7000);
    expect(screen.queryByText('hecho')).toBeNull();
    expect(screen.getByText('fallo')).toBeTruthy();
    dismissToast(err);
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.queryByText('fallo')).toBeNull();
  });

  it('se pausa mientras el puntero está encima', async () => {
    render(() => <Toaster />);
    toast('pausable');
    const li = screen.getByText('pausable').closest('li') as HTMLElement;
    fireEvent.pointerEnter(li);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(screen.getByText('pausable')).toBeTruthy();
    fireEvent.pointerLeave(li);
    await vi.advanceTimersByTimeAsync(6000);
    expect(screen.queryByText('pausable')).toBeNull();
  });
});

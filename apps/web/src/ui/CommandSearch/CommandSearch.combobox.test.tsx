import type { Place } from '@routecast/shared';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLang } from '../../i18n';
import { CommandSearch, type SearchFn } from './CommandSearch';

const granada: Place = { id: 'g', name: 'Granada', detail: 'Andalucía', at: { lat: 37.18, lng: -3.6 } };
const malaga: Place = { id: 'm', name: 'Málaga', at: { lat: 36.72, lng: -4.42 } };

beforeEach(() => {
  vi.useFakeTimers();
  setLang('es');
});
afterEach(() => vi.useRealTimers());

const flush = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
};

describe('CommandSearch (combobox)', () => {
  it('busca tras el debounce y no antes', async () => {
    const search = vi.fn<SearchFn>(async () => [granada]);
    render(() => <CommandSearch label="Origen" search={search} onSelect={() => {}} />);
    const box = screen.getByRole('combobox');
    fireEvent.focus(box);
    fireEvent.input(box, { target: { value: 'gra' } });
    await flush(299);
    expect(search).not.toHaveBeenCalled();
    await flush(1);
    expect(search).toHaveBeenCalledWith('gra', expect.any(AbortSignal));
    await flush();
    expect(screen.getByRole('option', { name: /Granada/ })).toBeTruthy();
  });

  it('aborta la petición anterior al seguir tecleando', async () => {
    const signals: AbortSignal[] = [];
    const search: SearchFn = (_q, signal) => {
      signals.push(signal);
      return new Promise(() => {});
    };
    render(() => <CommandSearch label="Origen" search={search} onSelect={() => {}} />);
    const box = screen.getByRole('combobox');
    fireEvent.input(box, { target: { value: 'gr' } });
    await flush(300);
    fireEvent.input(box, { target: { value: 'gra' } });
    expect(signals[0]?.aborted).toBe(true);
  });

  it('una respuesta que llega tras borrar no pisa el estado', async () => {
    let resolve: (p: Place[]) => void = () => {};
    const search: SearchFn = () =>
      new Promise((r) => {
        resolve = r;
      });
    const onSelect = vi.fn();
    render(() => <CommandSearch label="Origen" search={search} recent={[malaga]} onSelect={onSelect} />);
    const box = screen.getByRole('combobox');
    fireEvent.focus(box);
    fireEvent.input(box, { target: { value: 'gra' } });
    await flush(300);
    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));
    resolve([granada]);
    await flush();
    expect(screen.queryByRole('option', { name: /Granada/ })).toBeNull();
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('editar el texto tras elegir invalida la selección', () => {
    const onSelect = vi.fn();
    render(() => <CommandSearch label="Origen" value={granada} search={async () => []} onSelect={onSelect} />);
    const box = screen.getByRole('combobox');
    fireEvent.input(box, { target: { value: 'Granad' } });
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('volver a enfocar antes de 120 ms no cierra la lista', async () => {
    render(() => <CommandSearch label="Origen" search={async () => []} recent={[malaga]} onSelect={() => {}} />);
    const box = screen.getByRole('combobox');
    fireEvent.focus(box);
    expect(box.getAttribute('aria-expanded')).toBe('true');
    fireEvent.blur(box);
    await flush(50);
    fireEvent.focus(box);
    await flush(200);
    expect(box.getAttribute('aria-expanded')).toBe('true');
  });

  it('flechas + Enter eligen la opción activa anunciada con aria-activedescendant', () => {
    const onSelect = vi.fn();
    render(() => (
      <CommandSearch label="Origen" search={async () => []} recent={[malaga, granada]} onSelect={onSelect} />
    ));
    const box = screen.getByRole('combobox');
    fireEvent.focus(box);
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    const active = box.getAttribute('aria-activedescendant');
    expect(active && document.getElementById(active)?.textContent).toContain('Granada');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(granada);
    expect(box.getAttribute('aria-expanded')).toBe('false');
  });

  it('error del proveedor: mensaje, no excepción', async () => {
    render(() => <CommandSearch label="Origen" search={() => Promise.reject(new Error('x'))} onSelect={() => {}} />);
    const box = screen.getByRole('combobox');
    fireEvent.focus(box);
    fireEvent.input(box, { target: { value: 'gra' } });
    await flush(300);
    await flush();
    expect(screen.getByRole('status').textContent).toMatch(/no responde/);
  });
});

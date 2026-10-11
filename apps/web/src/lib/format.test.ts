import { describe, expect, it } from 'vitest';
import { ahead, localWhen } from './format';

describe('formato de salida', () => {
  const thu = new Date(2026, 9, 15, 17, 40).getTime();
  const sameMorning = new Date(2026, 9, 15, 9, 0).getTime();
  const sunday = new Date(2026, 9, 11, 12, 0).getTime();

  it('en el mismo día solo muestra la hora', () => {
    expect(localWhen(thu, sameMorning, 'es-ES')).toBe('17:40');
    expect(localWhen(thu, sameMorning, 'en-GB')).toBe('17:40');
  });

  it('si el día cambia, lo nombra en es y en en', () => {
    expect(localWhen(thu, sunday, 'es-ES')).toBe('jue 15 · 17:40');
    expect(localWhen(thu, sunday, 'en-GB')).toBe('thu 15 · 17:40');
  });

  it('a partir de un día el desfase no se queda en horas sueltas', () => {
    expect(ahead(45)).toBe('45 min');
    expect(ahead(24 * 60)).toBe('1 d');
    expect(ahead(2 * 24 * 60 + 3 * 60)).toBe('2 d 3 h');
  });
});

import { describe, expect, it } from 'vitest';
import { highlight } from './CommandSearch';

describe('highlight', () => {
  it('marca la coincidencia sin distinguir mayúsculas ni tildes', () => {
    expect(highlight('Málaga', 'mala')).toEqual([
      { text: 'Mála', match: true },
      { text: 'ga', match: false },
    ]);
    expect(highlight('Alhama de Granada', 'GRAN')).toEqual([
      { text: 'Alhama de ', match: false },
      { text: 'Gran', match: true },
      { text: 'ada', match: false },
    ]);
  });

  it('sin consulta o sin coincidencia devuelve el texto entero', () => {
    expect(highlight('Loja', '')).toEqual([{ text: 'Loja', match: false }]);
    expect(highlight('Loja', 'xyz')).toEqual([{ text: 'Loja', match: false }]);
  });
});

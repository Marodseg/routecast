import { describe, expect, it } from 'vitest';
import * as providers from '../src/index';

describe('providers', () => {
  it('carga el módulo', () => {
    expect(providers).toBeDefined();
  });
});

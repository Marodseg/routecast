import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../src/index';

describe('shared', () => {
  it('expone el nombre de la app', () => {
    expect(APP_NAME).toBe('Routecast');
  });
});

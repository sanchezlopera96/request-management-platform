import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/config.js';

describe('loadConfig', () => {
  it('sin secretos configurados genera unos aleatorios en cada arranque', () => {
    const first = loadConfig({});
    const second = loadConfig({});

    expect(first.jwtSecret.length).toBeGreaterThanOrEqual(32);
    expect(first.cursorSecret.length).toBeGreaterThanOrEqual(32);
    expect(first.jwtSecret).not.toBe(first.cursorSecret);
    expect(second.jwtSecret).not.toBe(first.jwtSecret);
  });

  it('usa los secretos de las variables de entorno cuando existen', () => {
    const config = loadConfig({ JWT_SECRET: 'jwt-from-env-0123456789', CURSOR_SECRET: 'cursor-from-env-0123456789' });
    expect(config.jwtSecret).toBe('jwt-from-env-0123456789');
    expect(config.cursorSecret).toBe('cursor-from-env-0123456789');
  });
});

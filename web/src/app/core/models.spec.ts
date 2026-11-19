import { HttpErrorResponse } from '@angular/common/http';
import { errorMessage, normalizeFolio } from './models';

describe('normalizeFolio', () => {
  it('acepta folio completo, sin ceros o solo el número', () => {
    expect(normalizeFolio('SOL-000123')).toBe('SOL-000123');
    expect(normalizeFolio('sol-123')).toBe('SOL-000123');
    expect(normalizeFolio(' 123 ')).toBe('SOL-000123');
  });

  it('rechaza lo que no es un folio', () => {
    expect(normalizeFolio('')).toBeNull();
    expect(normalizeFolio('abc')).toBeNull();
    expect(normalizeFolio('SOL-1234567')).toBeNull();
  });
});

describe('errorMessage', () => {
  it('usa el mensaje del backend', () => {
    const err = new HttpErrorResponse({
      status: 409,
      error: { error: { code: 'REQUEST_CLOSED', message: 'La solicitud SOL-000001 está cerrada y no admite cambios.' } },
    });
    expect(errorMessage(err)).toBe('La solicitud SOL-000001 está cerrada y no admite cambios.');
  });

  it('explica cuando no hay conexión con el servidor', () => {
    expect(errorMessage(new HttpErrorResponse({ status: 0 }))).toContain('No pudimos conectar con el servidor');
  });
});

import { describe, expect, it } from 'vitest';
import { claimsToPrincipal } from '../../src/http/auth.js';
import { UnauthenticatedError } from '../../src/domain/errors.js';

describe('claimsToPrincipal', () => {
  it('lee los claims de los tokens de desarrollo', () => {
    expect(claimsToPrincipal({ sub: 'laura', name: 'Laura', role: 'TENANT_USER', tenantId: 'andina', tenants: [] })).toEqual({
      userId: 'laura',
      name: 'Laura',
      role: 'TENANT_USER',
      tenantId: 'andina',
      tenants: [],
    });
  });

  it('lee los atributos personalizados de Cognito (custom:*)', () => {
    expect(
      claimsToPrincipal({ sub: 'uuid-1', 'custom:role': 'ANALYST', 'custom:tenants': 'andina, caribe' }),
    ).toEqual({ userId: 'uuid-1', name: 'uuid-1', role: 'ANALYST', tenants: ['andina', 'caribe'] });

    expect(claimsToPrincipal({ sub: 'uuid-2', 'custom:role': 'TENANT_USER', 'custom:tenantId': 'caribe' })).toMatchObject({
      role: 'TENANT_USER',
      tenantId: 'caribe',
      tenants: [],
    });
  });

  it('un usuario de filial nunca hereda filiales asignadas, aunque el token las traiga', () => {
    const principal = claimsToPrincipal({ sub: 'x', role: 'TENANT_USER', tenantId: 'andina', tenants: ['caribe'] });
    expect(principal.tenants).toEqual([]);
  });

  it.each([
    ['sin rol', { sub: 'x' }],
    ['con un rol desconocido', { sub: 'x', role: 'ADMIN' }],
    ['usuario de filial sin filial', { sub: 'x', role: 'TENANT_USER' }],
    ['sin sujeto', { role: 'ANALYST', tenants: ['andina'] }],
  ])('rechaza un token %s', (_name, payload) => {
    expect(() => claimsToPrincipal(payload)).toThrow(UnauthenticatedError);
  });
});

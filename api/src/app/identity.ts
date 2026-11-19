import type { Role } from '../domain/request.js';
import { TenantNotAssignedError, UnauthenticatedError, ValidationError } from '../domain/errors.js';

export interface Principal {
  userId: string;
  name: string;
  role: Role;
  tenantId?: string;
  tenants: string[];
}

export function resolveTenantScope(principal: Principal, requestedTenantId?: string): string {
  if (principal.role === 'TENANT_USER') {
    if (!principal.tenantId) {
      throw new UnauthenticatedError('Tu usuario no tiene una filial asociada.');
    }
    return principal.tenantId;
  }

  if (!requestedTenantId) {
    throw new ValidationError(
      'Como analista, indica la filial con la que vas a trabajar (encabezado X-Tenant-Id).',
    );
  }
  if (!principal.tenants.includes(requestedTenantId)) {
    throw new TenantNotAssignedError(requestedTenantId);
  }
  return requestedTenantId;
}

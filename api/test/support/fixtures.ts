import type { Principal } from '../../src/app/identity.js';

export const TENANT_A = 'tenant-a';
export const TENANT_B = 'tenant-b';

export const userA: Principal = { userId: 'user-a', name: 'Usuaria A', role: 'TENANT_USER', tenantId: TENANT_A, tenants: [] };
export const userB: Principal = { userId: 'user-b', name: 'Usuario B', role: 'TENANT_USER', tenantId: TENANT_B, tenants: [] };

export const analystA: Principal = { userId: 'analyst-a', name: 'Analista A', role: 'ANALYST', tenants: [TENANT_A] };

export const CURSOR_SECRET = 'test-cursor-secret-0123456789';

export const sampleInput = {
  subject: 'Pago a proveedor',
  description: 'Factura 123 pendiente de pago',
  category: 'PURCHASING' as const,
};

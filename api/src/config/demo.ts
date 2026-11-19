import type { Principal } from '../app/identity.js';

export interface DemoTenant {
  id: string;
  name: string;
}

export const DEMO_TENANTS: DemoTenant[] = [
  { id: 'andina', name: 'Filial Andina' },
  { id: 'caribe', name: 'Filial Caribe' },
  { id: 'pacifico', name: 'Filial Pacífico' },
];

export const DEMO_USERS: Principal[] = [
  { userId: 'laura', name: 'Laura · Filial Andina', role: 'TENANT_USER', tenantId: 'andina', tenants: [] },
  { userId: 'carlos', name: 'Carlos · Filial Caribe', role: 'TENANT_USER', tenantId: 'caribe', tenants: [] },
  { userId: 'paula', name: 'Paula · Filial Pacífico', role: 'TENANT_USER', tenantId: 'pacifico', tenants: [] },
  { userId: 'sofia', name: 'Sofía · Analista', role: 'ANALYST', tenants: ['andina', 'caribe'] },
];

export function tenantName(id: string): string {
  return DEMO_TENANTS.find((t) => t.id === id)?.name ?? id;
}

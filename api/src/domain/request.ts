export const STATUSES = ['REGISTERED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type Status = (typeof STATUSES)[number];

export const ACTIONS = ['START', 'RESOLVE', 'CONFIRM', 'REJECT'] as const;
export type Action = (typeof ACTIONS)[number];

export const ROLES = ['TENANT_USER', 'ANALYST'] as const;
export type Role = (typeof ROLES)[number];

export const CATEGORIES = ['PURCHASING', 'PAYROLL', 'ACCOUNTING'] as const;
export type Category = (typeof CATEGORIES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  REGISTERED: 'Registrada',
  IN_PROGRESS: 'En atención',
  RESOLVED: 'Resuelta',
  CLOSED: 'Cerrada',
};

export const ACTION_LABELS: Record<Action, string> = {
  START: 'atender',
  RESOLVE: 'resolver',
  CONFIRM: 'confirmar la solución de',
  REJECT: 'rechazar la solución de',
};

export const ROLE_LABELS: Record<Role, string> = {
  TENANT_USER: 'la filial',
  ANALYST: 'el analista',
};

export interface ServiceRequest {
  tenantId: string;
  folio: string;
  subject: string;
  description: string;
  category: Category;
  status: Status;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface RequestEvent {
  tenantId: string;
  folio: string;
  version: number;
  action: Action | 'CREATE';
  fromStatus: Status | null;
  toStatus: Status;
  actorId: string;
  actorRole: Role;
  comment?: string;
  at: string;
}

export const FOLIO_PREFIX = 'SOL-';
export const FOLIO_DIGITS = 6;
export const FOLIO_PATTERN = /^SOL-\d{6}$/;

export function formatFolio(sequence: number): string {
  return `${FOLIO_PREFIX}${String(sequence).padStart(FOLIO_DIGITS, '0')}`;
}

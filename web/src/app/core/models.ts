import { HttpErrorResponse } from '@angular/common/http';

export type Status = 'REGISTERED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type Action = 'START' | 'RESOLVE' | 'CONFIRM' | 'REJECT';
export type Role = 'TENANT_USER' | 'ANALYST';
export type Category = 'PURCHASING' | 'PAYROLL' | 'ACCOUNTING';

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
  availableActions: Action[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface RequestEvent {
  version: number;
  action: Action | 'CREATE';
  fromStatus: Status | null;
  toStatus: Status;
  actorId: string;
  actorRole: Role;
  at: string;
}

export interface Me {
  userId: string;
  name: string;
  role: Role;
  tenants: { id: string; name: string }[];
}

export interface DemoUser {
  userId: string;
  name: string;
  role: Role;
}

export const STATUSES: Status[] = ['REGISTERED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export const STATUS_LABELS: Record<Status, string> = {
  REGISTERED: 'Registrada',
  IN_PROGRESS: 'En atención',
  RESOLVED: 'Resuelta',
  CLOSED: 'Cerrada',
};

export const ACTION_LABELS: Record<Action | 'CREATE', string> = {
  CREATE: 'Registrada',
  START: 'Atender',
  RESOLVE: 'Marcar como resuelta',
  CONFIRM: 'Confirmar solución',
  REJECT: 'No estoy conforme',
};

export const CATEGORY_LABELS: Record<Category, string> = {
  PURCHASING: 'Compras',
  PAYROLL: 'Nómina',
  ACCOUNTING: 'Contabilidad',
};

export const ROLE_LABELS: Record<Role, string> = {
  TENANT_USER: 'Filial',
  ANALYST: 'Analista',
};

export function normalizeFolio(input: string): string | null {
  const match = /^(?:sol-?)?0*(\d{1,6})$/i.exec(input.trim());
  return match ? `SOL-${match[1]!.padStart(6, '0')}` : null;
}

export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
    }
    const message = (error.error as { error?: { message?: string } } | null)?.error?.message;
    if (message) return message;
    if (error.status >= 500) return 'El servidor tuvo un problema. Inténtalo de nuevo en unos minutos.';
  }
  return 'Ocurrió un error inesperado.';
}

export function errorCode(error: unknown): string | undefined {
  return error instanceof HttpErrorResponse
    ? (error.error as { error?: { code?: string } } | null)?.error?.code
    : undefined;
}

import {
  ACTION_LABELS,
  ACTIONS,
  ROLE_LABELS,
  STATUS_LABELS,
  type Action,
  type Role,
  type Status,
} from './request.js';
import { InvalidTransitionError, RequestClosedError, RoleNotAllowedError } from './errors.js';

export const INITIAL_STATUS: Status = 'REGISTERED';
export const TERMINAL_STATUSES: readonly Status[] = ['CLOSED'];

interface TransitionRule {
  from: Status;
  to: Status;
  allowedRole: Role;
}

export const TRANSITIONS: Readonly<Record<Action, TransitionRule>> = {
  START: { from: 'REGISTERED', to: 'IN_PROGRESS', allowedRole: 'ANALYST' },
  RESOLVE: { from: 'IN_PROGRESS', to: 'RESOLVED', allowedRole: 'ANALYST' },
  CONFIRM: { from: 'RESOLVED', to: 'CLOSED', allowedRole: 'TENANT_USER' },
  REJECT: { from: 'RESOLVED', to: 'IN_PROGRESS', allowedRole: 'TENANT_USER' },
};

export function transition(current: Status, action: Action, role: Role, folio = 'la solicitud'): Status {
  if (TERMINAL_STATUSES.includes(current)) {
    throw new RequestClosedError(folio);
  }

  const rule = TRANSITIONS[action];

  if (rule.allowedRole !== role) {
    throw new RoleNotAllowedError(
      `Solo ${ROLE_LABELS[rule.allowedRole]} puede ${ACTION_LABELS[action]} una solicitud; ` +
        `${ROLE_LABELS[role]} no puede hacerlo.`,
    );
  }

  if (rule.from !== current) {
    throw new InvalidTransitionError(
      `No se puede ${ACTION_LABELS[action]} una solicitud en estado "${STATUS_LABELS[current]}". ` +
        `Esa acción solo aplica a solicitudes en estado "${STATUS_LABELS[rule.from]}".`,
    );
  }

  return rule.to;
}

export function availableActions(current: Status, role: Role): Action[] {
  return ACTIONS.filter((action) => {
    const rule = TRANSITIONS[action];
    return rule.from === current && rule.allowedRole === role;
  });
}

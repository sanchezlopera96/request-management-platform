import { describe, expect, it } from 'vitest';
import {
  INITIAL_STATUS,
  TRANSITIONS,
  availableActions,
  transition,
} from '../../src/domain/state-machine.js';
import { ACTIONS, ROLES, STATUSES, type Action, type Role, type Status } from '../../src/domain/request.js';
import {
  InvalidTransitionError,
  RequestClosedError,
  RoleNotAllowedError,
} from '../../src/domain/errors.js';

describe('Máquina de estados del proceso acordado', () => {
  it('una solicitud nueva queda en la primera etapa (REGISTERED)', () => {
    expect(INITIAL_STATUS).toBe('REGISTERED');
  });

  describe('avanza solo a la etapa siguiente', () => {
    it.each<[Status, Action, Role, Status]>([
      ['REGISTERED', 'START', 'ANALYST', 'IN_PROGRESS'],
      ['IN_PROGRESS', 'RESOLVE', 'ANALYST', 'RESOLVED'],
      ['RESOLVED', 'CONFIRM', 'TENANT_USER', 'CLOSED'],
    ])('%s --%s (%s)--> %s', (from, action, role, to) => {
      expect(transition(from, action, role)).toBe(to);
    });

    it('recorre el camino feliz completo', () => {
      let status = INITIAL_STATUS;
      status = transition(status, 'START', 'ANALYST');
      status = transition(status, 'RESOLVE', 'ANALYST');
      status = transition(status, 'CONFIRM', 'TENANT_USER');
      expect(status).toBe('CLOSED');
    });
  });

  describe('no permite saltarse etapas', () => {
    it.each<[Status, Action, Role]>([
      ['REGISTERED', 'RESOLVE', 'ANALYST'],
      ['REGISTERED', 'CONFIRM', 'TENANT_USER'],
      ['IN_PROGRESS', 'CONFIRM', 'TENANT_USER'],
      ['IN_PROGRESS', 'START', 'ANALYST'],
      ['RESOLVED', 'RESOLVE', 'ANALYST'],
      ['REGISTERED', 'REJECT', 'TENANT_USER'],
    ])('rechaza %s --%s (%s) con un mensaje que explica por qué', (from, action, role) => {
      expect(() => transition(from, action, role)).toThrow(InvalidTransitionError);
      expect(() => transition(from, action, role)).toThrow(/No se puede .* en estado/);
    });

    it('cualquier combinación fuera de la tabla de transiciones se rechaza', () => {
      for (const status of STATUSES) {
        for (const action of ACTIONS) {
          for (const role of ROLES) {
            const rule = TRANSITIONS[action];
            const isValid = status !== 'CLOSED' && rule.from === status && rule.allowedRole === role;
            if (isValid) {
              expect(transition(status, action, role)).toBe(rule.to);
            } else {
              expect(() => transition(status, action, role)).toThrow();
            }
          }
        }
      }
    });
  });

  describe('la confirmación la hace la filial, no el analista', () => {
    it('el analista no puede confirmar la solución', () => {
      expect(() => transition('RESOLVED', 'CONFIRM', 'ANALYST')).toThrow(RoleNotAllowedError);
      expect(() => transition('RESOLVED', 'CONFIRM', 'ANALYST')).toThrow(
        'Solo la filial puede confirmar la solución de una solicitud; el analista no puede hacerlo.',
      );
    });

    it('el analista no puede rechazar la solución en nombre de la filial', () => {
      expect(() => transition('RESOLVED', 'REJECT', 'ANALYST')).toThrow(RoleNotAllowedError);
    });

    it('la filial no puede atender ni resolver su propia solicitud', () => {
      expect(() => transition('REGISTERED', 'START', 'TENANT_USER')).toThrow(RoleNotAllowedError);
      expect(() => transition('IN_PROGRESS', 'RESOLVE', 'TENANT_USER')).toThrow(RoleNotAllowedError);
    });

    it('al confirmar, la solicitud se cierra', () => {
      expect(transition('RESOLVED', 'CONFIRM', 'TENANT_USER')).toBe('CLOSED');
    });
  });

  it('si la filial no queda conforme, la solicitud vuelve a atención', () => {
    expect(transition('RESOLVED', 'REJECT', 'TENANT_USER')).toBe('IN_PROGRESS');
    expect(transition('IN_PROGRESS', 'RESOLVE', 'ANALYST')).toBe('RESOLVED');
  });

  describe('una solicitud cerrada no admite cambios', () => {
    it.each(ACTIONS.flatMap((action) => ROLES.map((role) => [action, role] as const)))(
      'rechaza %s por %s',
      (action, role) => {
        expect(() => transition('CLOSED', action, role, 'SOL-000042')).toThrow(RequestClosedError);
        expect(() => transition('CLOSED', action, role, 'SOL-000042')).toThrow(
          'La solicitud SOL-000042 está cerrada y no admite cambios.',
        );
      },
    );
  });

  describe('availableActions (ayuda para la interfaz, no autoriza)', () => {
    it.each<[Status, Role, Action[]]>([
      ['REGISTERED', 'ANALYST', ['START']],
      ['REGISTERED', 'TENANT_USER', []],
      ['IN_PROGRESS', 'ANALYST', ['RESOLVE']],
      ['RESOLVED', 'TENANT_USER', ['CONFIRM', 'REJECT']],
      ['RESOLVED', 'ANALYST', []],
      ['CLOSED', 'TENANT_USER', []],
      ['CLOSED', 'ANALYST', []],
    ])('%s / %s -> %j', (status, role, expected) => {
      expect(availableActions(status, role)).toEqual(expected);
    });
  });
});

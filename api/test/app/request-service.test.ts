import { beforeEach, describe, expect, it } from 'vitest';
import { RequestService } from '../../src/app/request-service.js';
import { CursorCodec } from '../../src/app/cursor.js';
import { InMemoryRequestRepository } from '../../src/infra/memory-request-repository.js';
import {
  ConcurrentModificationError,
  InvalidCursorError,
  InvalidTransitionError,
  RequestClosedError,
  RequestNotFoundError,
  RoleNotAllowedError,
  TenantNotAssignedError,
  ValidationError,
} from '../../src/domain/errors.js';
import { CURSOR_SECRET, TENANT_A, TENANT_B, analystA, sampleInput, userA, userB } from '../support/fixtures.js';

describe('RequestService', () => {
  let repository: InMemoryRequestRepository;
  let service: RequestService;

  beforeEach(() => {
    repository = new InMemoryRequestRepository();
    service = new RequestService(repository, new CursorCodec(CURSOR_SECRET));
  });

  describe('creación', () => {
    it('una solicitud nueva queda REGISTERED, con folio secuencial por filial y evento de creación', async () => {
      const first = await service.create(userA, sampleInput);
      const second = await service.create(userA, sampleInput);
      const otherTenant = await service.create(userB, sampleInput);

      expect(first).toMatchObject({ folio: 'SOL-000001', status: 'REGISTERED', version: 1, tenantId: TENANT_A });
      expect(second.folio).toBe('SOL-000002');
      expect(otherTenant).toMatchObject({ folio: 'SOL-000001', tenantId: TENANT_B });

      const history = await service.history(userA, first.folio);
      expect(history).toEqual([
        expect.objectContaining({ action: 'CREATE', fromStatus: null, toStatus: 'REGISTERED', actorId: 'user-a' }),
      ]);
    });

    it('la filial de la solicitud la decide el token, no el cliente', async () => {
      const created = await service.create(userA, sampleInput, TENANT_B);
      expect(created.tenantId).toBe(TENANT_A);
    });
  });

  describe('proceso completo con persistencia', () => {
    it('registrada -> en atención -> resuelta -> rechazada -> resuelta -> cerrada, con historial', async () => {
      const { folio } = await service.create(userA, sampleInput);
      const scope = { tenantId: TENANT_A };

      await service.applyAction(analystA, folio, 'START', scope);
      await service.applyAction(analystA, folio, 'RESOLVE', scope);
      const rejected = await service.applyAction(userA, folio, 'REJECT', { comment: 'Falta el soporte' });
      expect(rejected.status).toBe('IN_PROGRESS');
      await service.applyAction(analystA, folio, 'RESOLVE', scope);
      const closed = await service.applyAction(userA, folio, 'CONFIRM');

      expect(closed).toMatchObject({ status: 'CLOSED', version: 6, availableActions: [] });
      const history = await service.history(userA, folio);
      expect(history.map((e) => `${e.fromStatus ?? '-'}>${e.toStatus}`)).toEqual([
        '->REGISTERED',
        'REGISTERED>IN_PROGRESS',
        'IN_PROGRESS>RESOLVED',
        'RESOLVED>IN_PROGRESS',
        'IN_PROGRESS>RESOLVED',
        'RESOLVED>CLOSED',
      ]);
      expect(history[3]).toMatchObject({ action: 'REJECT', comment: 'Falta el soporte', actorRole: 'TENANT_USER' });
    });
  });

  describe('todo intento inválido se rechaza y la solicitud queda como estaba', () => {
    it.each([
      ['saltar de REGISTERED a RESOLVED', analystA, 'RESOLVE', InvalidTransitionError],
      ['la filial intenta atender', userA, 'START', RoleNotAllowedError],
      ['cerrar sin resolver', userA, 'CONFIRM', InvalidTransitionError],
    ] as const)('%s', async (_name, actor, action, errorType) => {
      const created = await service.create(userA, sampleInput);
      const before = await repository.findByFolio(TENANT_A, created.folio);
      const eventsBefore = await repository.listEvents(TENANT_A, created.folio);

      await expect(service.applyAction(actor, created.folio, action, { tenantId: TENANT_A })).rejects.toThrow(
        errorType,
      );

      expect(await repository.findByFolio(TENANT_A, created.folio)).toEqual(before);
      expect(await repository.listEvents(TENANT_A, created.folio)).toEqual(eventsBefore);
    });

    it('el analista no puede confirmar el cierre, aunque la solicitud esté resuelta', async () => {
      const { folio } = await service.create(userA, sampleInput);
      await service.applyAction(analystA, folio, 'START', { tenantId: TENANT_A });
      await service.applyAction(analystA, folio, 'RESOLVE', { tenantId: TENANT_A });

      await expect(service.applyAction(analystA, folio, 'CONFIRM', { tenantId: TENANT_A })).rejects.toThrow(
        RoleNotAllowedError,
      );
      expect((await service.get(userA, folio)).status).toBe('RESOLVED');
    });

    it('una solicitud cerrada no admite cambios', async () => {
      const { folio } = await service.create(userA, sampleInput);
      await service.applyAction(analystA, folio, 'START', { tenantId: TENANT_A });
      await service.applyAction(analystA, folio, 'RESOLVE', { tenantId: TENANT_A });
      await service.applyAction(userA, folio, 'CONFIRM');
      const before = await repository.findByFolio(TENANT_A, folio);

      await expect(service.applyAction(userA, folio, 'REJECT')).rejects.toThrow(RequestClosedError);
      await expect(service.applyAction(analystA, folio, 'START', { tenantId: TENANT_A })).rejects.toThrow(
        RequestClosedError,
      );
      expect(await repository.findByFolio(TENANT_A, folio)).toEqual(before);
    });
  });

  describe('concurrencia (bloqueo optimista)', () => {
    it('si la solicitud cambió desde que se leyó, la escritura se rechaza y no se pierde el cambio previo', async () => {
      const { folio } = await service.create(userA, sampleInput);
      const stale = (await repository.findByFolio(TENANT_A, folio))!;

      await service.applyAction(analystA, folio, 'START', { tenantId: TENANT_A });

      const event = {
        tenantId: TENANT_A,
        folio,
        version: 2,
        action: 'START' as const,
        fromStatus: 'REGISTERED' as const,
        toStatus: 'IN_PROGRESS' as const,
        actorId: 'analyst-2',
        actorRole: 'ANALYST' as const,
        at: new Date().toISOString(),
      };
      await expect(
        repository.saveTransition({ ...stale, status: 'IN_PROGRESS', version: 2 }, stale.version, event),
      ).rejects.toThrow(ConcurrentModificationError);
      expect((await repository.listEvents(TENANT_A, folio)).length).toBe(2);
    });
  });

  describe('alcance por filial', () => {
    it('una filial no ve ni modifica solicitudes de otra aunque conozca el folio', async () => {
      await service.create(userB, sampleInput);
      await service.create(userB, sampleInput);
      await service.create(userA, sampleInput);

      await expect(service.get(userA, 'SOL-000002')).rejects.toThrow(RequestNotFoundError);
      await expect(service.get(userA, 'SOL-000002', TENANT_B)).rejects.toThrow(RequestNotFoundError);
      await expect(service.applyAction(userA, 'SOL-000002', 'CONFIRM', { tenantId: TENANT_B })).rejects.toThrow(
        RequestNotFoundError,
      );
      await expect(service.history(userA, 'SOL-000002')).rejects.toThrow(RequestNotFoundError);

      const list = await service.list(userA, { tenantId: TENANT_B });
      expect(list.items.every((r) => r.tenantId === TENANT_A)).toBe(true);
      expect(list.items).toHaveLength(1);
    });

    it('un folio mal formado responde igual que uno inexistente', async () => {
      await expect(service.get(userA, '../../TENANT#tenant-b')).rejects.toThrow(RequestNotFoundError);
    });

    it('el analista debe indicar una filial asignada', async () => {
      await expect(service.list(analystA)).rejects.toThrow(ValidationError);
      await expect(service.list(analystA, { tenantId: TENANT_B })).rejects.toThrow(TenantNotAssignedError);
      await expect(service.list(analystA, { tenantId: TENANT_A })).resolves.toBeDefined();
    });
  });

  describe('listado y paginación', () => {
    beforeEach(async () => {
      for (let i = 0; i < 7; i++) await service.create(userA, sampleInput);
      await service.applyAction(analystA, 'SOL-000003', 'START', { tenantId: TENANT_A });
      await service.applyAction(analystA, 'SOL-000005', 'START', { tenantId: TENANT_A });
    });

    it('pagina con cursor, más recientes primero, sin repetir ni saltar', async () => {
      const first = await service.list(userA, { limit: 3 });
      const second = await service.list(userA, { limit: 3, cursor: first.nextCursor! });
      const third = await service.list(userA, { limit: 3, cursor: second.nextCursor! });

      expect([...first.items, ...second.items, ...third.items].map((r) => r.folio)).toEqual([
        'SOL-000007', 'SOL-000006', 'SOL-000005', 'SOL-000004', 'SOL-000003', 'SOL-000002', 'SOL-000001',
      ]);
      expect(third.nextCursor).toBeNull();
    });

    it('filtra por estado', async () => {
      const inProgress = await service.list(userA, { status: 'IN_PROGRESS' });
      expect(inProgress.items.map((r) => r.folio)).toEqual(['SOL-000005', 'SOL-000003']);
    });

    it('un cursor de otra filial, de otro filtro o alterado se rechaza', async () => {
      const page = await service.list(userA, { limit: 2 });
      const cursor = page.nextCursor!;

      await service.create(userB, sampleInput);
      await expect(service.list(userB, { cursor })).rejects.toThrow(InvalidCursorError);
      await expect(service.list(userA, { cursor, status: 'CLOSED' })).rejects.toThrow(InvalidCursorError);
      await expect(service.list(userA, { cursor: `${cursor}x` })).rejects.toThrow(InvalidCursorError);
      await expect(service.list(userA, { cursor: 'basura' })).rejects.toThrow(InvalidCursorError);
    });

    it('un cursor fabricado por el cliente, sin la firma del servidor, se rechaza', async () => {
      const forgedBody = Buffer.from(JSON.stringify({ t: TENANT_A, s: null, k: { folio: 'SOL-000004' } })).toString('base64url');
      await expect(service.list(userA, { cursor: `${forgedBody}.firma-inventada` })).rejects.toThrow(InvalidCursorError);
    });

    it('expone las acciones disponibles según el rol', async () => {
      const asAnalyst = await service.get(analystA, 'SOL-000001', TENANT_A);
      const asTenant = await service.get(userA, 'SOL-000001');
      expect(asAnalyst.availableActions).toEqual(['START']);
      expect(asTenant.availableActions).toEqual([]);
    });
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CreateTableCommand, DeleteTableCommand, waitUntilTableExists } from '@aws-sdk/client-dynamodb';
import { createDynamoClients } from '../../src/infra/dynamodb/client.js';
import { tableDefinition } from '../../src/infra/dynamodb/table.js';
import { DynamoRequestRepository } from '../../src/infra/dynamodb/dynamo-request-repository.js';
import { ConcurrentModificationError } from '../../src/domain/errors.js';
import { formatFolio, type RequestEvent, type ServiceRequest, type Status } from '../../src/domain/request.js';

const endpoint = process.env['DYNAMODB_ENDPOINT'];

describe.skipIf(!endpoint)('DynamoRequestRepository [DynamoDB Local]', () => {
  const { client, doc } = createDynamoClients({ region: 'us-east-1', endpoint });
  const tableName = `it-repo-${Date.now()}`;
  const repository = new DynamoRequestRepository(doc, tableName);
  const A = 'tenant-a';
  const B = 'tenant-b';

  const request = (tenantId: string, seq: number, status: Status = 'REGISTERED'): ServiceRequest => {
    const createdAt = new Date(Date.UTC(2026, 10, seq)).toISOString();
    return {
      tenantId,
      folio: formatFolio(seq),
      subject: `Solicitud ${seq}`,
      description: 'Detalle',
      category: 'PAYROLL',
      status,
      version: 1,
      createdAt,
      updatedAt: createdAt,
      createdBy: 'test',
    };
  };

  const creation = (r: ServiceRequest): RequestEvent => ({
    tenantId: r.tenantId,
    folio: r.folio,
    version: 1,
    action: 'CREATE',
    fromStatus: null,
    toStatus: 'REGISTERED',
    actorId: 'test',
    actorRole: 'TENANT_USER',
    at: r.createdAt,
  });

  const start = (r: ServiceRequest): { updated: ServiceRequest; event: RequestEvent } => ({
    updated: { ...r, status: 'IN_PROGRESS', version: r.version + 1 },
    event: {
      tenantId: r.tenantId,
      folio: r.folio,
      version: r.version + 1,
      action: 'START',
      fromStatus: r.status,
      toStatus: 'IN_PROGRESS',
      actorId: 'analyst',
      actorRole: 'ANALYST',
      at: r.createdAt,
    },
  });

  beforeAll(async () => {
    await client.send(new CreateTableCommand(tableDefinition(tableName)));
    await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: tableName });

    for (const seq of [1, 2, 3]) {
      const r = request(A, seq);
      await repository.create(r, creation(r));
    }
    const other = request(B, 1);
    await repository.create(other, creation(other));
  });

  afterAll(async () => {
    await client.send(new DeleteTableCommand({ TableName: tableName }));
  });

  it('el contador de folios es atómico e independiente por filial', async () => {
    expect(await repository.nextSequence('counter-x')).toBe(1);
    expect(await repository.nextSequence('counter-x')).toBe(2);
    expect(await repository.nextSequence('counter-y')).toBe(1);
  });

  it('la lectura por folio siempre está acotada a la filial', async () => {
    expect(await repository.findByFolio(A, 'SOL-000002')).toMatchObject({ tenantId: A, folio: 'SOL-000002' });
    expect(await repository.findByFolio(B, 'SOL-000002')).toBeNull();
  });

  it('lista solo las solicitudes de la filial, más recientes primero, sin eventos ni contador', async () => {
    const page = await repository.list(A, { limit: 10 });
    expect(page.items.map((r) => r.folio)).toEqual(['SOL-000003', 'SOL-000002', 'SOL-000001']);
    expect(page.items.every((r) => r.tenantId === A)).toBe(true);
    expect(page.items[0]).not.toHaveProperty('PK');
  });

  it('pagina con LastEvaluatedKey sin repetir ni saltar', async () => {
    const first = await repository.list(A, { limit: 2 });
    const second = await repository.list(A, { limit: 2, startKey: first.lastKey });
    expect([...first.items, ...second.items].map((r) => r.folio)).toEqual([
      'SOL-000003',
      'SOL-000002',
      'SOL-000001',
    ]);
  });

  it('filtra por estado con el índice, y la solicitud cambia de partición al cambiar de estado', async () => {
    const current = (await repository.findByFolio(A, 'SOL-000001'))!;
    const { updated, event } = start(current);
    await repository.saveTransition(updated, current.version, event);

    const inProgress = await repository.list(A, { status: 'IN_PROGRESS', limit: 10 });
    const registered = await repository.list(A, { status: 'REGISTERED', limit: 10 });
    expect(inProgress.items.map((r) => r.folio)).toEqual(['SOL-000001']);
    expect(registered.items.map((r) => r.folio)).toEqual(['SOL-000003', 'SOL-000002']);
  });

  it('una transición con versión vieja se rechaza y no escribe nada', async () => {
    const current = (await repository.findByFolio(A, 'SOL-000002'))!;
    const first = start(current);
    await repository.saveTransition(first.updated, current.version, first.event);

    const stale = start(current);
    await expect(repository.saveTransition(stale.updated, current.version, stale.event)).rejects.toThrow(
      ConcurrentModificationError,
    );
    expect((await repository.findByFolio(A, 'SOL-000002'))?.version).toBe(2);
    expect(await repository.listEvents(A, 'SOL-000002')).toHaveLength(2);
  });

  it('devuelve el historial en orden cronológico', async () => {
    const events = await repository.listEvents(A, 'SOL-000001');
    expect(events.map((e) => e.action)).toEqual(['CREATE', 'START']);
    expect(await repository.listEvents(B, 'SOL-000001')).toEqual([
      expect.objectContaining({ tenantId: B, action: 'CREATE' }),
    ]);
  });
});

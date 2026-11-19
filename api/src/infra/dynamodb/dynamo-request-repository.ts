import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import type { RequestEvent, ServiceRequest } from '../../domain/request.js';
import { ConcurrentModificationError } from '../../domain/errors.js';
import type { ListQuery, Page, RequestRepository } from '../../app/ports.js';
import { GSI_BY_STATUS, keys } from './table.js';

type Item = Record<string, unknown>;

const KEY_ATTRIBUTES = ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'entity'];

export function toRequestItem(request: ServiceRequest): Item {
  return {
    PK: keys.tenant(request.tenantId),
    SK: keys.request(request.folio),
    GSI1PK: keys.byStatus(request.tenantId, request.status),
    GSI1SK: keys.byStatusSort(request.createdAt, request.folio),
    entity: 'REQUEST',
    ...request,
  };
}

export function toEventItem(event: RequestEvent): Item {
  return {
    PK: keys.tenant(event.tenantId),
    SK: keys.event(event.folio, event.version),
    entity: 'EVENT',
    ...event,
  };
}

function strip<T>(item: Item): T {
  const copy = { ...item };
  for (const attribute of KEY_ATTRIBUTES) delete copy[attribute];
  return copy as T;
}

export class DynamoRequestRepository implements RequestRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async nextSequence(tenantId: string): Promise<number> {
    const result = await this.doc.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: keys.tenant(tenantId), SK: keys.counter },
        UpdateExpression: 'ADD #seq :one',
        ExpressionAttributeNames: { '#seq': 'seq' },
        ExpressionAttributeValues: { ':one': 1 },
        ReturnValues: 'UPDATED_NEW',
      }),
    );
    return Number(result.Attributes?.['seq']);
  }

  async create(request: ServiceRequest, event: RequestEvent): Promise<void> {
    await this.transact(request.folio, [
      {
        Put: {
          TableName: this.tableName,
          Item: toRequestItem(request),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          TableName: this.tableName,
          Item: toEventItem(event),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ]);
  }

  async findByFolio(tenantId: string, folio: string): Promise<ServiceRequest | null> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: keys.tenant(tenantId), SK: keys.request(folio) },
        ConsistentRead: true,
      }),
    );
    return result.Item ? strip<ServiceRequest>(result.Item) : null;
  }

  async list(tenantId: string, query: ListQuery): Promise<Page<ServiceRequest>> {
    const base = {
      TableName: this.tableName,
      Limit: query.limit,
      ScanIndexForward: false,
      ...(query.startKey ? { ExclusiveStartKey: query.startKey } : {}),
    };

    const command = query.status
      ? new QueryCommand({
          ...base,
          IndexName: GSI_BY_STATUS,
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: { ':pk': keys.byStatus(tenantId, query.status) },
        })
      : new QueryCommand({
          ...base,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': keys.tenant(tenantId), ':prefix': keys.requestPrefix },
        });

    const result = await this.doc.send(command);
    return {
      items: (result.Items ?? []).map((item) => strip<ServiceRequest>(item)),
      ...(result.LastEvaluatedKey ? { lastKey: result.LastEvaluatedKey } : {}),
    };
  }

  async saveTransition(updated: ServiceRequest, expectedVersion: number, event: RequestEvent): Promise<void> {
    await this.transact(updated.folio, [
      {
        Put: {
          TableName: this.tableName,
          Item: toRequestItem(updated),
          ConditionExpression: 'attribute_exists(PK) AND #version = :expected',
          ExpressionAttributeNames: { '#version': 'version' },
          ExpressionAttributeValues: { ':expected': expectedVersion },
        },
      },
      {
        Put: {
          TableName: this.tableName,
          Item: toEventItem(event),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ]);
  }

  async listEvents(tenantId: string, folio: string): Promise<RequestEvent[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': keys.tenant(tenantId), ':prefix': keys.eventPrefix(folio) },
        ScanIndexForward: true,
      }),
    );
    return (result.Items ?? []).map((item) => strip<RequestEvent>(item));
  }

  private async transact(
    folio: string,
    items: NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']>,
  ): Promise<void> {
    try {
      await this.doc.send(new TransactWriteCommand({ TransactItems: items }));
    } catch (error) {
      if (error instanceof TransactionCanceledException) {
        const conditionFailed = error.CancellationReasons?.some((r) => r.Code === 'ConditionalCheckFailed');
        if (conditionFailed) throw new ConcurrentModificationError(folio);
      }
      throw error;
    }
  }
}

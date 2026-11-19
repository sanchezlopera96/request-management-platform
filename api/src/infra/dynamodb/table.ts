import type { CreateTableCommandInput } from '@aws-sdk/client-dynamodb';
import type { Status } from '../../domain/request.js';

export const DEFAULT_TABLE_NAME = 'service-requests';
export const GSI_BY_STATUS = 'GSI1';

export const keys = {
  tenant: (tenantId: string) => `TENANT#${tenantId}`,
  request: (folio: string) => `REQ#${folio}`,
  requestPrefix: 'REQ#',
  event: (folio: string, version: number) => `EVT#${folio}#${String(version).padStart(6, '0')}`,
  eventPrefix: (folio: string) => `EVT#${folio}#`,
  counter: 'COUNTER',
  byStatus: (tenantId: string, status: Status) => `TENANT#${tenantId}#ST#${status}`,
  byStatusSort: (createdAt: string, folio: string) => `${createdAt}#${folio}`,
};

export function tableDefinition(tableName: string): CreateTableCommandInput {
  return {
    TableName: tableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: GSI_BY_STATUS,
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  };
}

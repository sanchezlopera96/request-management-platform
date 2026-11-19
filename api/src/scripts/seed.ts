import { BatchWriteCommand, GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CATEGORIES, formatFolio, type Action, type Category, type RequestEvent, type ServiceRequest, type Status } from '../domain/request.js';
import { TRANSITIONS } from '../domain/state-machine.js';
import { keys } from '../infra/dynamodb/table.js';
import { ensureTable } from '../infra/dynamodb/ensure-table.js';
import { toEventItem, toRequestItem } from '../infra/dynamodb/dynamo-request-repository.js';
import { DEMO_TENANTS } from '../config/demo.js';
import { arg, scriptContext } from './context.js';

const BATCH_SIZE = 25;
const CONCURRENCY = 8;
const HISTORY_THRESHOLD = 1000;

const SUBJECTS: Record<Category, string[]> = {
  PURCHASING: [
    'Orden de compra de repuestos para planta',
    'Creación de proveedor nuevo',
    'Cotización de transporte de material',
    'Pago pendiente a proveedor',
    'Actualización de cuenta bancaria de proveedor',
    'Compra de equipos de protección personal',
  ],
  PAYROLL: [
    'Ajuste de horas extra del mes',
    'Certificado laboral para trámite bancario',
    'Liquidación de vacaciones',
    'Novedad de incapacidad',
    'Descuento de nómina no reconocido',
    'Ingreso de personal temporal',
  ],
  ACCOUNTING: [
    'Conciliación bancaria del mes',
    'Causación de factura de servicios',
    'Reclasificación de centro de costos',
    'Soporte para cierre contable',
    'Anulación de nota crédito',
    'Certificado de retención en la fuente',
  ],
};

const PATH_TO: Record<Status, Action[]> = {
  REGISTERED: [],
  IN_PROGRESS: ['START'],
  RESOLVED: ['START', 'RESOLVE'],
  CLOSED: ['START', 'RESOLVE', 'CONFIRM'],
};

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function pickStatus(progress: number, rnd: number): Status {
  if (progress < 0.9) {
    if (rnd < 0.94) return 'CLOSED';
    if (rnd < 0.98) return 'RESOLVED';
    return 'IN_PROGRESS';
  }
  if (rnd < 0.3) return 'REGISTERED';
  if (rnd < 0.65) return 'IN_PROGRESS';
  if (rnd < 0.88) return 'RESOLVED';
  return 'CLOSED';
}

export function generate(tenantId: string, count: number, now = new Date('2026-11-18T12:00:00Z')) {
  const random = mulberry32(hash(tenantId));
  const spanMs = 3 * 365 * 24 * 3600 * 1000;
  const start = now.getTime() - spanMs;
  const requests: ServiceRequest[] = [];
  const events: RequestEvent[] = [];

  for (let i = 1; i <= count; i++) {
    const progress = i / count;
    const createdAt = new Date(start + Math.floor(spanMs * progress) - Math.floor(random() * 60_000));
    const category = CATEGORIES[Math.floor(random() * CATEGORIES.length)]!;
    const options = SUBJECTS[category];
    const subject = options[Math.floor(random() * options.length)]!;
    const status = pickStatus(progress, random());
    const path = PATH_TO[status];
    const folio = formatFolio(i);
    const updatedAt = new Date(createdAt.getTime() + path.length * 3_600_000).toISOString();

    requests.push({
      tenantId,
      folio,
      subject,
      description: `${subject}. Solicitud generada para pruebas de volumen.`,
      category,
      status,
      version: path.length + 1,
      createdAt: createdAt.toISOString(),
      updatedAt,
      createdBy: 'seed',
    });

    if (count <= HISTORY_THRESHOLD) {
      events.push({
        tenantId, folio, version: 1, action: 'CREATE', fromStatus: null, toStatus: 'REGISTERED',
        actorId: 'seed', actorRole: 'TENANT_USER', at: createdAt.toISOString(),
      });
      path.forEach((action, index) => {
        const rule = TRANSITIONS[action];
        events.push({
          tenantId, folio, version: index + 2, action, fromStatus: rule.from, toStatus: rule.to,
          actorId: rule.allowedRole === 'ANALYST' ? 'sofia' : 'seed', actorRole: rule.allowedRole,
          at: new Date(createdAt.getTime() + (index + 1) * 3_600_000).toISOString(),
        });
      });
    }
  }
  return { requests, events };
}

async function batchWrite(doc: DynamoDBDocumentClient, tableName: string, items: Record<string, unknown>[]) {
  let pending = items.map((Item) => ({ PutRequest: { Item } }));
  for (let attempt = 0; pending.length > 0; attempt++) {
    const result = await doc.send(new BatchWriteCommand({ RequestItems: { [tableName]: pending } }));
    pending = (result.UnprocessedItems?.[tableName] ?? []) as typeof pending;
    if (pending.length > 0) await new Promise((r) => setTimeout(r, Math.min(50 * 2 ** attempt, 2000)));
  }
}

async function writeAll(doc: DynamoDBDocumentClient, tableName: string, items: Record<string, unknown>[]) {
  const batches: Record<string, unknown>[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) batches.push(items.slice(i, i + BATCH_SIZE));

  let next = 0;
  let done = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (next < batches.length) {
      const batch = batches[next++]!;
      await batchWrite(doc, tableName, batch);
      done++;
      if (done % 200 === 0) console.info(`  ${done * BATCH_SIZE}/${items.length} ítems`);
    }
  });
  await Promise.all(workers);
}

async function seedTenant(doc: DynamoDBDocumentClient, tableName: string, tenantId: string, count: number, force: boolean) {
  const counter = await doc.send(
    new GetCommand({ TableName: tableName, Key: { PK: keys.tenant(tenantId), SK: keys.counter } }),
  );
  const current = Number(counter.Item?.['seq'] ?? 0);
  if (!force && current >= count) {
    console.info(`Filial "${tenantId}": ya tiene ${current} solicitudes; no se recarga.`);
    return;
  }

  const startedAt = Date.now();
  console.info(`Filial "${tenantId}": generando ${count} solicitudes...`);
  const { requests, events } = generate(tenantId, count);
  await writeAll(doc, tableName, [...requests.map(toRequestItem), ...events.map(toEventItem)]);
  await doc.send(
    new PutCommand({
      TableName: tableName,
      Item: { PK: keys.tenant(tenantId), SK: keys.counter, seq: Math.max(count, current) },
    }),
  );
  console.info(`Filial "${tenantId}": ${count} solicitudes en ${((Date.now() - startedAt) / 1000).toFixed(1)} s.`);
}

const { client, doc, tableName, endpoint } = scriptContext();
const tenantArg = arg('tenant');
const countArg = arg('count');
const force = process.argv.includes('--force');

const targets = tenantArg
  ? [{ id: tenantArg, seedCount: Number(countArg ?? 50_000) }]
  : DEMO_TENANTS.filter((t) => t.seedCount > 0);

console.info(`Cargando datos de prueba en ${endpoint} (tabla ${tableName})`);
await ensureTable(client, tableName);
for (const tenant of targets) {
  await seedTenant(doc, tableName, tenant.id, tenant.seedCount, force);
}
console.info('Datos de prueba listos.');

import { STATUSES } from '../domain/request.js';
import { arg } from './context.js';

const baseUrl = arg('url') ?? process.env['API_URL'] ?? 'http://localhost:3000';
const userId = arg('user') ?? 'laura';
const runs = Number(arg('runs') ?? 50);

interface Page {
  items: { folio: string; status: string }[];
  nextCursor: string | null;
}

async function getToken(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/dev/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error(`No se pudo obtener token: ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

async function measure(name: string, fn: () => Promise<unknown>) {
  await fn();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return { name, p50: percentile(samples, 50), p95: percentile(samples, 95), max: samples.at(-1) ?? 0 };
}

const token = await getToken();
const headers = { authorization: `Bearer ${token}` };

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const first = await getJson<Page>('/api/requests?limit=25');
if (first.items.length === 0) throw new Error('La filial no tiene datos. Ejecuta primero el seed.');

let deepCursor = first.nextCursor;
for (let i = 0; i < 200 && deepCursor; i++) {
  deepCursor = (await getJson<Page>(`/api/requests?limit=25&cursor=${encodeURIComponent(deepCursor)}`)).nextCursor;
}

const total = Number(first.items[0]!.folio.slice(4));
const results = [
  await measure('Primera página (25, más recientes)', () => getJson('/api/requests?limit=25')),
];
for (const status of STATUSES) {
  results.push(await measure(`Filtro estado=${status}`, () => getJson(`/api/requests?status=${status}&limit=25`)));
}
if (deepCursor) {
  const cursor = encodeURIComponent(deepCursor);
  results.push(await measure('Página 200 por cursor', () => getJson(`/api/requests?limit=25&cursor=${cursor}`)));
}
results.push(
  await measure('Buscar por folio (aleatorio)', async () => {
    const folio = `SOL-${String(1 + Math.floor(Math.random() * total)).padStart(6, '0')}`;
    await getJson(`/api/requests/${folio}`);
  }),
);

console.info(`\nAPI ${baseUrl} · usuario ${userId} · ${total} solicitudes en la filial · ${runs} mediciones por escenario\n`);
console.info('| Escenario | p50 (ms) | p95 (ms) | máx (ms) |');
console.info('|---|---:|---:|---:|');
for (const r of results) {
  console.info(`| ${r.name} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.max.toFixed(1)} |`);
}

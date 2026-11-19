import { loadConfig } from './config/config.js';
import { createDependencies } from './container.js';
import { buildApp } from './http/app.js';

const config = loadConfig();
const app = await buildApp(createDependencies(config));

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ host: '0.0.0.0', port: config.port });

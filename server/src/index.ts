import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { assertConfig, config } from './config.js';
import { migrate } from './db.js';
import { caseRoutes } from './routes/cases.js';
import { modelRoutes } from './routes/models.js';
import { evalRoutes } from './routes/evals.js';
import { blindRoutes } from './routes/blind.js';

async function main() {
  assertConfig();
  const applied = await migrate();
  if (applied.length) console.log(`[migrate] 已应用: ${applied.join(', ')}`);
  else console.log('[migrate] 无新迁移');

  const app = Fastify({ logger: true });
  await app.register(sensible);
  await app.register(cors, { origin: true });

  app.get('/api/health', async () => ({ ok: true, ts: Date.now() }));
  await app.register(caseRoutes);
  await app.register(modelRoutes);
  await app.register(evalRoutes);
  await app.register(blindRoutes);

  await app.listen({ port: config.port, host: config.host });
  console.log(`[server] http://${config.host}:${config.port}`);
}

main().catch((e) => {
  console.error('启动失败:', e);
  process.exit(1);
});

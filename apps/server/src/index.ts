import { resolve } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { TOTAL_ROUNDS } from '@beer/game';

const PORT = Number(process.env.PORT ?? 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
// Resolved from apps/server/dist (bundled) or apps/server/src (tsx) alike.
const WEB_DIST = resolve(import.meta.dirname, '../../web/dist');

const app = Fastify({ logger: true });

app.get('/api/health', async () => ({ ok: true, totalRounds: TOTAL_ROUNDS }));

// In development Vite serves the client and proxies /api and /ws to us.
if (IS_PRODUCTION) {
  await app.register(fastifyStatic, { root: WEB_DIST });

  // Client-side routes such as /game/ABC123 all load the SPA shell.
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not found' });
  });
}

await app.listen({ port: PORT, host: '0.0.0.0' });

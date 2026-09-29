import Fastify from 'fastify';
import { TOTAL_ROUNDS } from '@beer/game';

const PORT = Number(process.env.PORT ?? 3000);

const app = Fastify({ logger: true });

app.get('/api/health', async () => ({ ok: true, totalRounds: TOTAL_ROUNDS }));

await app.listen({ port: PORT, host: '0.0.0.0' });

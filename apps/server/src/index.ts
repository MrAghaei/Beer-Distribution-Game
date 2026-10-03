import { resolve } from 'node:path';
import { buildApp } from './app';

const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DB_PATH ?? 'data/beer-game.db';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
// Resolved from apps/server/dist (bundled) or apps/server/src (tsx) alike.
const WEB_DIST = resolve(import.meta.dirname, '../../web/dist');

const app = await buildApp({ dbPath: DB_PATH, webDist: IS_PRODUCTION ? WEB_DIST : undefined });

// Close sockets and the database cleanly when tsx restarts us or Ctrl+C is pressed.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
}

await app.listen({ port: PORT, host: '0.0.0.0' });

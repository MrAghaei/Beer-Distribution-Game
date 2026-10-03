import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { openGameStore } from './db';
import { GameService } from './gameService';
import { Hub } from './hub';
import { apiRoutes } from './routes';
import { wsRoutes } from './ws';

export type AppOptions = {
  /** SQLite file, or ':memory:'. */
  dbPath: string;
  /** Built client to serve. Left out in development, where Vite serves it. */
  webDist?: string;
  logger?: boolean;
};

export async function buildApp({ dbPath, webDist, logger = true }: AppOptions) {
  const app = Fastify({ logger });

  const store = openGameStore(dbPath);
  const hub = new Hub();
  const games = new GameService(store, (state) => hub.broadcast(state));
  app.addHook('onClose', async () => store.close());

  // Client messages are a few dozen bytes; anything large is not one of ours.
  await app.register(fastifyWebsocket, { options: { maxPayload: 4096 } });
  await app.register(apiRoutes, { prefix: '/api', games });
  await app.register(wsRoutes, { games, hub });

  if (webDist) {
    await app.register(fastifyStatic, { root: webDist });

    // Client-side routes such as /game/ABC123 all load the SPA shell.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  }

  return app;
}

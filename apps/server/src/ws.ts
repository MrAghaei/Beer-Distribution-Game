import type { FastifyPluginAsync } from 'fastify';
import type { RawData } from 'ws';
import { ClientMessageSchema, findRoleByToken, toPlayerView, type ClientMessage } from '@beer/game';
import { SERVICE_ERROR_MESSAGES, type GameService } from './gameService';
import { send, type Hub } from './hub';

/** The game one socket watches. `token` is only kept once it has been matched to a role. */
type Session = { code: string; token: string | null };

export const wsRoutes: FastifyPluginAsync<{ games: GameService; hub: Hub }> = async (app, { games, hub }) => {
  app.get('/ws', { websocket: true }, (socket, request) => {
    let session: Session | null = null;

    // Errors go only to the socket that caused them; state changes go to everyone via the hub.
    const fail = (message: string) => send(socket, { type: 'error', message });

    const hello = ({ code, token }: Extract<ClientMessage, { type: 'hello' }>) => {
      const state = games.get(code);
      if (!state) return fail(SERVICE_ERROR_MESSAGES.game_not_found);

      // An unknown or missing token is not an error: the socket simply watches as a spectator.
      const role = token ? findRoleByToken(state, token) : null;
      if (session) hub.leave(session.code, socket);
      session = { code, token: role && token ? token : null };
      hub.join(code, socket, role);
      send(socket, { type: 'state', view: toPlayerView(state, role) });
    };

    const order = ({ quantity }: Extract<ClientMessage, { type: 'placeOrder' }>) => {
      if (!session?.token) return fail(SERVICE_ERROR_MESSAGES.unknown_player);

      // On success the hub has already pushed the new view to this socket too.
      const result = games.placeOrder(session.code, session.token, quantity);
      if (!result.ok) fail(SERVICE_ERROR_MESSAGES[result.error]);
    };

    socket.on('message', (raw) => {
      const parsed = parseMessage(raw);
      if (!parsed.ok) return fail(parsed.error);

      try {
        switch (parsed.message.type) {
          case 'hello':
            return hello(parsed.message);
          case 'placeOrder':
            return order(parsed.message);
        }
      } catch (err) {
        // A throw inside a socket listener would take the whole process down.
        request.log.error({ err }, 'websocket message failed');
        fail('Something went wrong on the server.');
      }
    });

    socket.on('close', () => {
      if (session) hub.leave(session.code, socket);
    });

    socket.on('error', (err) => request.log.warn({ err }, 'websocket error'));
  });
};

function parseMessage(raw: RawData): { ok: true; message: ClientMessage } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(String(raw));
  } catch {
    return { ok: false, error: 'Messages must be JSON.' };
  }

  const result = ClientMessageSchema.safeParse(data);
  if (!result.success) return { ok: false, error: `Invalid message: ${result.error.issues[0]?.message}` };
  return { ok: true, message: result.data };
}

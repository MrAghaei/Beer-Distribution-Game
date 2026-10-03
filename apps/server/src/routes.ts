import type { FastifyError, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  GameCodeSchema,
  JoinRequestSchema,
  TOTAL_ROUNDS,
  type CreateGameResponse,
  type JoinRequest,
  type JoinResponse,
} from '@beer/game';
import { SERVICE_ERROR_MESSAGES, type GameService, type ServiceError } from './gameService';

const HTTP_STATUS: Record<ServiceError, number> = {
  game_not_found: 404,
  role_taken: 409,
  game_not_in_lobby: 409,
  no_human_player: 409,
  game_not_playing: 409,
  already_submitted: 409,
  invalid_quantity: 400,
  unknown_player: 403,
};

const GameParamsSchema = z.object({ code: GameCodeSchema });

export const apiRoutes: FastifyPluginAsync<{ games: GameService }> = async (app, { games }) => {
  // Route schemas in this plugin are zod schemas; a failed parse becomes a 400.
  app.setValidatorCompiler<z.ZodType>(({ schema }) => (data) => {
    const result = schema.safeParse(data);
    return result.success ? { value: result.data } : { error: result.error };
  });

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ error: `Invalid ${error.validationContext}: ${describeIssues(error)}` });
    }
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'request failed');
      return reply.code(500).send({ error: 'Internal server error' });
    }
    return reply.code(statusCode).send({ error: error.message });
  });

  app.get('/health', async () => ({ ok: true, totalRounds: TOTAL_ROUNDS }));

  app.post('/games', async (_request, reply) => {
    const { code } = games.create();
    return reply.code(201).send({ code } satisfies CreateGameResponse);
  });

  app.post<{ Params: z.infer<typeof GameParamsSchema>; Body: JoinRequest }>(
    '/games/:code/join',
    { schema: { params: GameParamsSchema, body: JoinRequestSchema } },
    async (request, reply) => {
      const { code } = request.params;
      const { role } = request.body;

      const result = games.join(code, role);
      if (!result.ok) {
        return reply.code(HTTP_STATUS[result.error]).send({ error: SERVICE_ERROR_MESSAGES[result.error] });
      }
      return { token: result.token, role } satisfies JoinResponse;
    },
  );
};

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length ? `${issue.path.map(String).join('.')}: ${issue.message}` : issue.message))
    .join('; ');
}

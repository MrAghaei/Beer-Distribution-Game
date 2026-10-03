import type { z } from 'zod';
import {
  CreateGameResponseSchema,
  ErrorResponseSchema,
  JoinResponseSchema,
  type CreateGameResponse,
  type JoinRequest,
  type JoinResponse,
  type Role,
} from '@beer/game';

export function createGame(): Promise<CreateGameResponse> {
  return post('/api/games', CreateGameResponseSchema);
}

export function joinGame(code: string, role: Role): Promise<JoinResponse> {
  return post(`/api/games/${code}/join`, JoinResponseSchema, { role } satisfies JoinRequest);
}

async function post<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    // Fastify rejects an empty body that claims to be JSON, so only send the header with a body.
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = ErrorResponseSchema.safeParse(data);
    throw new Error(error.success ? error.data.error : `Request failed (${response.status}).`);
  }
  return schema.parse(data);
}

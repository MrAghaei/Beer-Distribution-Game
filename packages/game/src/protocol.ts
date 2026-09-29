import { z } from 'zod';
import { MAX_ORDER, ROLES } from './types';

// Everything that crosses the network is described here, so server and client
// validate against the same schemas.

export const RoleSchema = z.enum(ROLES);
export const GameCodeSchema = z.string().regex(/^[A-Z0-9]{6}$/, 'Invalid game code');
export const TokenSchema = z.string().min(1).max(100);
export const OrderQuantitySchema = z.number().int().min(0).max(MAX_ORDER);

const perRole = <T extends z.ZodType>(value: T) => z.record(RoleSchema, value);

/** What one player is allowed to see. Built only by `toPlayerView`. */
export const PlayerViewSchema = z.object({
  code: GameCodeSchema,
  status: z.enum(['lobby', 'playing', 'finished']),
  round: z.number().int(),
  totalRounds: z.number().int(),
  /** The role this connection plays, or null for someone who has not joined yet. */
  myRole: RoleSchema.nullable(),
  rolesTaken: perRole(z.boolean()),
  /** Who has ordered this round. Booleans only, never the amounts. */
  submitted: perRole(z.boolean()),
  /** Own numbers for the current round; null in the lobby or without a role. */
  me: z
    .object({
      shipmentArrived: z.number(),
      incomingOrder: z.number(),
      shipped: z.number(),
      inventory: z.number(),
      backlog: z.number(),
      roundCost: z.number(),
      totalCost: z.number(),
      /** The order placed last round. */
      lastOrder: z.number(),
      /** This round's order once submitted. */
      pendingOrder: z.number().nullable(),
    })
    .nullable(),
  /** Revealed only when the game is finished. */
  results: z
    .object({
      costs: perRole(z.number()),
      total: z.number(),
    })
    .nullable(),
});
export type PlayerView = z.infer<typeof PlayerViewSchema>;

// HTTP

export const CreateGameResponseSchema = z.object({ code: GameCodeSchema });
export type CreateGameResponse = z.infer<typeof CreateGameResponseSchema>;

export const JoinRequestSchema = z.object({ role: RoleSchema });
export type JoinRequest = z.infer<typeof JoinRequestSchema>;

export const JoinResponseSchema = z.object({ token: TokenSchema, role: RoleSchema });
export type JoinResponse = z.infer<typeof JoinResponseSchema>;

export const ErrorResponseSchema = z.object({ error: z.string() });

// WebSocket

export const ClientMessageSchema = z.discriminatedUnion('type', [
  /** Subscribe to a game. Without a (valid) token the socket only watches the lobby. */
  z.object({ type: z.literal('hello'), code: GameCodeSchema, token: TokenSchema.optional() }),
  z.object({ type: z.literal('placeOrder'), quantity: OrderQuantitySchema }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('state'), view: PlayerViewSchema }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

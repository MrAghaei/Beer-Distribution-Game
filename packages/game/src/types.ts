/** Roles in chain order: each role ships to the one before it and orders from the one after it. */
export const ROLES = ['retailer', 'wholesaler', 'distributor', 'factory'] as const;
export type Role = (typeof ROLES)[number];

export const TOTAL_ROUNDS = 20;
export const HOLDING_COST = 0.5;
export const BACKLOG_COST = 1;
/** Upper bound on a single order; only there to reject absurd input. */
export const MAX_ORDER = 10_000;

export const STARTING_INVENTORY = 12;
/** Shipments already on the way at the start: arriving in round 1 and round 2. */
export const STARTING_IN_TRANSIT = [4, 4];
/** The order every role is assumed to have placed before round 1. */
export const STARTING_LAST_ORDER = 4;

/** What the Retailer receives from the customer in a given round (1-based). */
export function customerDemand(round: number): number {
  return round <= 4 ? 4 : 8;
}

/** One role's numbers for one round, after steps 1–4 (same shape as the fixture). */
export type RoundRecord = {
  shipmentArrived: number;
  incomingOrder: number;
  shipped: number;
  inventory: number;
  backlog: number;
  roundCost: number;
  totalCost: number;
  /** Filled in once every player has ordered for this round. */
  orderPlaced: number | null;
};

export type RoleState = {
  inventory: number;
  backlog: number;
  /** Shipments on the way; index 0 arrives in step 1 of the next round. Always length 2 between rounds. */
  inTransit: number[];
  /** The order placed last round; upstream reads it as its incoming order. */
  lastOrder: number;
  /** This round's submitted order, or null while the player is still deciding. */
  pendingOrder: number | null;
  totalCost: number;
  /** One entry per played round; history[round - 1]. */
  history: RoundRecord[];
};

export type GameStatus = 'lobby' | 'playing' | 'finished';

export type GameState = {
  code: string;
  status: GameStatus;
  /** 0 in the lobby, then 1..TOTAL_ROUNDS. */
  round: number;
  /** Secret per-player tokens. Never sent to clients. */
  players: Partial<Record<Role, { token: string }>>;
  roles: Record<Role, RoleState>;
};

export type RuleError =
  | 'game_not_in_lobby'
  | 'role_taken'
  | 'game_not_playing'
  | 'invalid_quantity'
  | 'already_submitted';

export type RuleResult = { ok: true; state: GameState } | { ok: false; error: RuleError };

export const RULE_ERROR_MESSAGES: Record<RuleError, string> = {
  game_not_in_lobby: 'The game has already started.',
  role_taken: 'That role is already taken.',
  game_not_playing: 'The game is not in progress.',
  invalid_quantity: `An order must be a whole number between 0 and ${MAX_ORDER}.`,
  already_submitted: 'You have already ordered this round.',
};

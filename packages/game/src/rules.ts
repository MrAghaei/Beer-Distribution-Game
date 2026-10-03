import { botOrder } from './bot';
import {
  BACKLOG_COST,
  customerDemand,
  HOLDING_COST,
  MAX_ORDER,
  ROLES,
  STARTING_IN_TRANSIT,
  STARTING_INVENTORY,
  STARTING_LAST_ORDER,
  TOTAL_ROUNDS,
  type GameState,
  type Role,
  type RoleState,
  type RuleResult,
} from './types';

// Every exported function is pure: it clones the incoming state, changes the
// clone and returns it. Expected rule violations come back as `{ ok: false }`.

export function createGame(code: string): GameState {
  const roles = Object.fromEntries(ROLES.map((role) => [role, startingRoleState()]));
  return {
    code,
    status: 'lobby',
    round: 0,
    players: {},
    roles: roles as Record<Role, RoleState>,
  };
}

/** Seats a player. When the fourth role is taken the game starts and round 1 is played out. */
export function claimRole(current: GameState, role: Role, token: string): RuleResult {
  if (current.status !== 'lobby') return { ok: false, error: 'game_not_in_lobby' };
  if (current.players[role]) return { ok: false, error: 'role_taken' };

  const state = structuredClone(current);
  state.players[role] = { token };

  if (ROLES.every((r) => state.players[r])) startPlaying(state);
  return { ok: true, state };
}

/**
 * Seats a bot in every free role and starts the game. Needs at least one person:
 * with four bots nobody would ever play the rounds.
 */
export function fillWithBots(current: GameState): RuleResult {
  if (current.status !== 'lobby') return { ok: false, error: 'game_not_in_lobby' };
  if (ROLES.every((role) => !current.players[role] || isBot(current, role))) {
    return { ok: false, error: 'no_human_player' };
  }

  const state = structuredClone(current);
  for (const role of ROLES) state.players[role] ??= { bot: true };
  startPlaying(state);
  return { ok: true, state };
}

/** Step 5. When the last of the four orders comes in, the next round starts (or the game ends). */
export function placeOrder(current: GameState, role: Role, quantity: number): RuleResult {
  if (current.status !== 'playing') return { ok: false, error: 'game_not_playing' };
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_ORDER) {
    return { ok: false, error: 'invalid_quantity' };
  }
  if (current.roles[role].pendingOrder !== null) return { ok: false, error: 'already_submitted' };

  const state = structuredClone(current);
  state.roles[role].pendingOrder = quantity;

  if (ROLES.every((r) => state.roles[r].pendingOrder !== null)) {
    finishRound(state);
  }
  return { ok: true, state };
}

export function findRoleByToken(state: GameState, token: string): Role | null {
  return (
    ROLES.find((role) => {
      const player = state.players[role];
      return player && 'token' in player && player.token === token;
    }) ?? null
  );
}

export function isBot(state: GameState, role: Role): boolean {
  const player = state.players[role];
  return player !== undefined && 'bot' in player;
}

function startingRoleState(): RoleState {
  return {
    inventory: STARTING_INVENTORY,
    backlog: 0,
    inTransit: [...STARTING_IN_TRANSIT],
    lastOrder: STARTING_LAST_ORDER,
    pendingOrder: null,
    totalCost: 0,
    history: [],
  };
}

function finishRound(state: GameState): void {
  for (const role of ROLES) {
    const rs = state.roles[role];
    rs.lastOrder = rs.pendingOrder!;
    rs.history[rs.history.length - 1]!.orderPlaced = rs.pendingOrder;
    rs.pendingOrder = null;
  }

  if (state.round === TOTAL_ROUNDS) {
    state.status = 'finished';
    return;
  }
  state.round += 1;
  startRound(state);
}

function startPlaying(state: GameState): void {
  state.status = 'playing';
  state.round = 1;
  startRound(state);
}

/**
 * Steps 1–4, then the bots order straight away. A bot's order depends only on its
 * own numbers, so ordering first changes nothing; at least one person is always
 * left to order, so this never completes a round by itself.
 */
function startRound(state: GameState): void {
  runRoundSteps(state);
  for (const role of ROLES) {
    if (isBot(state, role)) state.roles[role].pendingOrder = botOrder(state.roles[role].history.at(-1)!);
  }
}

/** Steps 1–4 of the current round, for all roles at once. Mutates `state`. */
function runRoundSteps(state: GameState): void {
  // 1. Shipments arrive. Done for every role before anyone ships, so a shipment
  //    sent this round can never arrive this round.
  const arrived = {} as Record<Role, number>;
  for (const role of ROLES) {
    const rs = state.roles[role];
    arrived[role] = rs.inTransit.shift()!;
    rs.inventory += arrived[role];
  }

  ROLES.forEach((role, i) => {
    const rs = state.roles[role];
    const downstream = ROLES[i - 1];

    // 2. Orders arrive: customer demand, or what downstream ordered last round.
    const incomingOrder = downstream ? state.roles[downstream].lastOrder : customerDemand(state.round);

    // 3. Ship what we can; the rest becomes backlog. Retailer ships to the customer.
    const owed = rs.backlog + incomingOrder;
    const shipped = Math.min(rs.inventory, owed);
    rs.inventory -= shipped;
    rs.backlog = owed - shipped;
    if (downstream) state.roles[downstream].inTransit.push(shipped);

    // 4. Charge costs.
    const roundCost = HOLDING_COST * rs.inventory + BACKLOG_COST * rs.backlog;
    rs.totalCost += roundCost;

    rs.history.push({
      shipmentArrived: arrived[role],
      incomingOrder,
      shipped,
      inventory: rs.inventory,
      backlog: rs.backlog,
      roundCost,
      totalCost: rs.totalCost,
      orderPlaced: null,
    });
  });

  // The unlimited supplier ships exactly what the Factory ordered last round.
  state.roles.factory.inTransit.push(state.roles.factory.lastOrder);
}

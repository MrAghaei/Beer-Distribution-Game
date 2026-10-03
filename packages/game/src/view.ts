import type { PlayerView } from './protocol';
import { isBot } from './rules';
import { ROLES, TOTAL_ROUNDS, type GameState, type Role } from './types';

/**
 * The only way game state leaves the server. A player sees their own numbers,
 * who has taken a role (and whether by a bot) and who has ordered, but nothing
 * about other roles' stock, backlog, orders or costs until the game is finished.
 * Tokens never leave.
 */
export function toPlayerView(state: GameState, myRole: Role | null): PlayerView {
  return {
    code: state.code,
    status: state.status,
    round: state.round,
    totalRounds: TOTAL_ROUNDS,
    myRole,
    rolesTaken: perRole((role) => Boolean(state.players[role])),
    bots: perRole((role) => isBot(state, role)),
    submitted: perRole((role) => state.roles[role].pendingOrder !== null),
    me: myRole ? ownNumbers(state, myRole) : null,
    results: state.status === 'finished' ? results(state) : null,
  };
}

function ownNumbers(state: GameState, role: Role): PlayerView['me'] {
  const rs = state.roles[role];
  const latest = rs.history.at(-1);
  if (!latest) return null; // still in the lobby

  return {
    shipmentArrived: latest.shipmentArrived,
    incomingOrder: latest.incomingOrder,
    shipped: latest.shipped,
    inventory: rs.inventory,
    backlog: rs.backlog,
    roundCost: latest.roundCost,
    totalCost: rs.totalCost,
    lastOrder: rs.lastOrder,
    pendingOrder: rs.pendingOrder,
  };
}

function results(state: GameState): NonNullable<PlayerView['results']> {
  const costs = perRole((role) => state.roles[role].totalCost);
  const total = ROLES.reduce((sum, role) => sum + costs[role], 0);
  const history = perRole((role) => state.roles[role].history.map((record) => ({ ...record })));
  return { costs, total, history };
}

function perRole<T>(fn: (role: Role) => T): Record<Role, T> {
  return Object.fromEntries(ROLES.map((role) => [role, fn(role)])) as Record<Role, T>;
}

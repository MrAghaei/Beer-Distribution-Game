import { claimRole, createGame, placeOrder } from './rules';
import { ROLES, type GameState, type Role, type RuleResult } from './types';

export function unwrap(result: RuleResult): GameState {
  if (!result.ok) throw new Error(`Unexpected rule error: ${result.error}`);
  return result.state;
}

/** A game with all four roles taken, so round 1 has been played out. */
export function startGame(): GameState {
  let state = createGame('ABC123');
  for (const role of ROLES) state = unwrap(claimRole(state, role, `token-${role}`));
  return state;
}

type OrderFn = (role: Role, round: number) => number;

/** Everyone orders according to `order` until the game ends or `untilRound` is reached. */
export function play(state: GameState, order: OrderFn, untilRound = Infinity): GameState {
  while (state.status === 'playing' && state.round < untilRound) {
    const round = state.round;
    for (const role of ROLES) state = unwrap(placeOrder(state, role, order(role, round)));
  }
  return state;
}

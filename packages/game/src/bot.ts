import { MAX_ORDER, type RoundRecord } from './types';

/**
 * How a bot orders, from its own numbers for the round: replace what was just
 * ordered from it, and close half the gap between its backlog and its stock.
 */
export function botOrder({ incomingOrder, backlog, inventory }: RoundRecord): number {
  const order = Math.round(incomingOrder + (backlog - inventory) / 2);
  return Math.min(MAX_ORDER, Math.max(0, order));
}

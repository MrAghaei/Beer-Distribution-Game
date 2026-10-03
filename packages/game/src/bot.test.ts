import { describe, expect, it } from 'vitest';
import { botOrder } from './bot';
import { claimRole, createGame, fillWithBots, placeOrder } from './rules';
import { startGame, unwrap } from './test-helpers';
import { MAX_ORDER, TOTAL_ROUNDS, type RoundRecord } from './types';

const record = (numbers: Pick<RoundRecord, 'incomingOrder' | 'backlog' | 'inventory'>): RoundRecord => ({
  shipmentArrived: 0,
  shipped: 0,
  roundCost: 0,
  totalCost: 0,
  orderPlaced: null,
  ...numbers,
});

describe('botOrder', () => {
  it('replaces the incoming order and closes half the gap between backlog and stock', () => {
    expect(botOrder(record({ incomingOrder: 8, backlog: 0, inventory: 0 }))).toBe(8);
    expect(botOrder(record({ incomingOrder: 8, backlog: 6, inventory: 0 }))).toBe(11);
    expect(botOrder(record({ incomingOrder: 8, backlog: 0, inventory: 6 }))).toBe(5);
    expect(botOrder(record({ incomingOrder: 8, backlog: 3, inventory: 0 }))).toBe(10); // 9.5 rounds up
  });

  it('never orders less than zero or more than the maximum', () => {
    expect(botOrder(record({ incomingOrder: 4, backlog: 0, inventory: 12 }))).toBe(0);
    expect(botOrder(record({ incomingOrder: MAX_ORDER, backlog: 100, inventory: 0 }))).toBe(MAX_ORDER);
  });
});

describe('fillWithBots', () => {
  const withRetailer = () => unwrap(claimRole(createGame('ABC123'), 'retailer', 'token-retailer'));

  it('seats bots in the free roles, starts the game and has them order for round 1', () => {
    const state = unwrap(fillWithBots(withRetailer()));

    expect(state).toMatchObject({ status: 'playing', round: 1 });
    expect(state.players).toEqual({
      retailer: { token: 'token-retailer' },
      wholesaler: { bot: true },
      distributor: { bot: true },
      factory: { bot: true },
    });
    expect(state.roles.retailer.pendingOrder).toBeNull();
    // Round 1 leaves every role with 12 in stock and no backlog: 4 + (0 − 12) / 2 < 0.
    expect(state.roles.wholesaler.pendingOrder).toBe(0);
  });

  it('needs at least one person and only works in the lobby', () => {
    expect(fillWithBots(createGame('ABC123'))).toEqual({ ok: false, error: 'no_human_player' });
    expect(fillWithBots(startGame())).toEqual({ ok: false, error: 'game_not_in_lobby' });
  });

  it('lets one person play a whole game, with the bots ordering by their policy each round', () => {
    let state = unwrap(fillWithBots(withRetailer()));
    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
      expect(state).toMatchObject({ status: 'playing', round });
      state = unwrap(placeOrder(state, 'retailer', 8));
    }

    expect(state.status).toBe('finished');
    for (const bot of ['wholesaler', 'distributor', 'factory'] as const) {
      const { history } = state.roles[bot];
      expect(history).toHaveLength(TOTAL_ROUNDS);
      for (const round of history) expect(round.orderPlaced).toBe(botOrder(round));
    }
  });

  it('has already ordered for a bot when the round starts', () => {
    const state = unwrap(fillWithBots(withRetailer()));
    expect(placeOrder(state, 'wholesaler', 4)).toEqual({ ok: false, error: 'already_submitted' });
  });
});

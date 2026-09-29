import { describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/everyone-orders-four.json';
import { claimRole, createGame, placeOrder } from './rules';
import { play, startGame, unwrap } from './test-helpers';
import { MAX_ORDER, ROLES, TOTAL_ROUNDS } from './types';

describe('full games', () => {
  it('matches the "everyone orders four" fixture for every role in every round', () => {
    const state = play(startGame(), () => 4);

    expect(state.status).toBe('finished');
    fixture.rounds.forEach((expected, i) => {
      for (const role of ROLES) {
        expect(state.roles[role].history[i], `round ${expected.round}, ${role}`).toEqual(expected[role]);
      }
    });
    for (const role of ROLES) {
      expect(state.roles[role].totalCost).toBe(fixture.finalCosts[role]);
    }
    expect(ROLES.reduce((sum, role) => sum + state.roles[role].totalCost, 0)).toBe(fixture.totalCost);
  });

  it('delays orders by one round and shipments by two (EXAMPLE.md)', () => {
    const state = play(startGame(), (role, round) => (role === 'retailer' && round >= 5 ? 8 : 4));

    const firstRound = (values: number[]) => values.findIndex((v) => v === 8) + 1;
    expect(firstRound(state.roles.wholesaler.history.map((h) => h.incomingOrder))).toBe(6);
    expect(firstRound(state.roles.retailer.history.map((h) => h.shipmentArrived))).toBe(8);
  });

  it('delivers the Factory order from the supplier with the same delays', () => {
    const state = play(startGame(), (role, round) => (role === 'factory' && round === 1 ? 10 : 4));

    // Ordered in round 1, shipped by the supplier in round 2, arrives in round 4.
    expect(state.roles.factory.history.map((h) => h.shipmentArrived).slice(0, 5)).toEqual([4, 4, 4, 10, 4]);
  });
});

describe('shipping and backlog', () => {
  it('serves the backlog together with the new order once stock arrives', () => {
    const state = startGame();
    // Round 2: the Retailer owes 5 from before plus the customer's 4.
    state.roles.retailer.inventory = 0;
    state.roles.retailer.backlog = 5;
    state.roles.retailer.inTransit = [10, 4];

    const next = play(state, () => 4, 2);

    expect(next.roles.retailer.history[1]).toMatchObject({
      shipmentArrived: 10,
      incomingOrder: 4,
      shipped: 9,
      inventory: 1,
      backlog: 0,
      roundCost: 0.5,
    });
  });

  it('ships only what is in stock and charges for inventory and backlog', () => {
    const state = startGame();
    state.roles.retailer.inventory = 0;
    state.roles.retailer.backlog = 5;
    state.roles.retailer.inTransit = [6, 4];

    const next = play(state, () => 4, 2);

    expect(next.roles.retailer.history[1]).toMatchObject({
      shipped: 6,
      inventory: 0,
      backlog: 3,
      roundCost: 3,
    });
  });

  it('delivers downstream what was actually shipped, not what was ordered', () => {
    const state = startGame();
    // Round 2: the Wholesaler gets only 1 unit in but owes the Retailer 4.
    state.roles.wholesaler.inventory = 0;
    state.roles.wholesaler.inTransit = [1, 4];

    const next = play(state, () => 4, 4);

    expect(next.roles.wholesaler.history[1]).toMatchObject({ shipped: 1, backlog: 3 });
    expect(next.roles.retailer.history[3]!.shipmentArrived).toBe(1);
  });
});

describe('lobby', () => {
  it('starts the game with round 1 played out once the fourth role is taken', () => {
    let state = createGame('ABC123');
    for (const role of ROLES.slice(0, 3)) state = unwrap(claimRole(state, role, `token-${role}`));
    expect(state).toMatchObject({ status: 'lobby', round: 0 });
    expect(state.roles.retailer.history).toHaveLength(0);

    state = unwrap(claimRole(state, 'factory', 'token-factory'));
    expect(state).toMatchObject({ status: 'playing', round: 1 });
    expect(state.roles.retailer.history).toEqual([{ ...fixture.rounds[0]!.retailer, orderPlaced: null }]);
  });

  it('rejects a role that is already taken, and any role once the game has started', () => {
    const lobby = unwrap(claimRole(createGame('ABC123'), 'retailer', 'a'));
    expect(claimRole(lobby, 'retailer', 'b')).toEqual({ ok: false, error: 'role_taken' });
    expect(claimRole(startGame(), 'retailer', 'c')).toEqual({ ok: false, error: 'game_not_in_lobby' });
  });
});

describe('placing orders', () => {
  it('does not advance the round until all four players have ordered', () => {
    let state = startGame();
    for (const role of ROLES.slice(0, 3)) state = unwrap(placeOrder(state, role, 4));
    expect(state.round).toBe(1);
    expect(state.roles.retailer.pendingOrder).toBe(4);

    state = unwrap(placeOrder(state, 'factory', 4));
    expect(state.round).toBe(2);
    expect(ROLES.map((role) => state.roles[role].pendingOrder)).toEqual([null, null, null, null]);
  });

  it('rejects a second order from the same player in the same round', () => {
    const state = unwrap(placeOrder(startGame(), 'retailer', 4));
    expect(placeOrder(state, 'retailer', 8)).toEqual({ ok: false, error: 'already_submitted' });
    expect(state.roles.retailer.pendingOrder).toBe(4);
  });

  it.each([-1, 2.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_ORDER + 1])('rejects an order of %s', (quantity) => {
    expect(placeOrder(startGame(), 'retailer', quantity)).toEqual({ ok: false, error: 'invalid_quantity' });
  });

  it('accepts an order of zero', () => {
    expect(placeOrder(startGame(), 'retailer', 0).ok).toBe(true);
  });

  it('rejects orders before the game starts', () => {
    expect(placeOrder(createGame('ABC123'), 'retailer', 4)).toEqual({ ok: false, error: 'game_not_playing' });
  });

  it('ends after the orders for round 20 and rejects orders afterwards', () => {
    let state = play(startGame(), () => 4, TOTAL_ROUNDS);
    expect(state).toMatchObject({ status: 'playing', round: TOTAL_ROUNDS });

    for (const role of ROLES) state = unwrap(placeOrder(state, role, 4));
    expect(state).toMatchObject({ status: 'finished', round: TOTAL_ROUNDS });
    expect(state.roles.retailer.history).toHaveLength(TOTAL_ROUNDS);
    expect(placeOrder(state, 'retailer', 4)).toEqual({ ok: false, error: 'game_not_playing' });
  });

  it('never changes the state it was given', () => {
    const state = startGame();
    const snapshot = structuredClone(state);
    for (const role of ROLES) placeOrder(state, role, 4);
    expect(state).toEqual(snapshot);
  });
});

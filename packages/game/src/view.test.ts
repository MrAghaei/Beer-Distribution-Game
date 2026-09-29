import { describe, expect, it } from 'vitest';
import { PlayerViewSchema } from './protocol';
import { placeOrder } from './rules';
import { play, startGame, unwrap } from './test-helpers';
import { ROLES } from './types';
import { toPlayerView } from './view';

describe('toPlayerView', () => {
  it("shows a player their own numbers and nothing of anyone else's", () => {
    let state = startGame();
    // Give the other roles numbers that cannot appear by accident.
    state.roles.wholesaler.inventory = 9137;
    state.roles.distributor.backlog = 8243;
    state.roles.factory.totalCost = 7351;
    state = unwrap(placeOrder(state, 'wholesaler', 6529));

    const view = toPlayerView(state, 'retailer');
    const json = JSON.stringify(view);

    expect(PlayerViewSchema.parse(view)).toEqual(view);
    expect(view.me).toMatchObject({ inventory: 12, backlog: 0, pendingOrder: null });
    for (const secret of ['9137', '8243', '7351', '6529', 'token-']) {
      expect(json).not.toContain(secret);
    }
    expect(view.submitted).toEqual({ retailer: false, wholesaler: true, distributor: false, factory: false });
    expect(view.results).toBeNull();
  });

  it('gives someone without a role only the lobby-level information', () => {
    const view = toPlayerView(startGame(), null);
    expect(view.me).toBeNull();
    expect(view.rolesTaken).toEqual({ retailer: true, wholesaler: true, distributor: true, factory: true });
  });

  it('reveals every role’s cost and the total once the game is finished', () => {
    const state = play(startGame(), () => 4);
    const view = toPlayerView(state, 'factory');

    expect(view.status).toBe('finished');
    expect(view.results).toEqual({
      costs: { retailer: 394, wholesaler: 120, distributor: 120, factory: 120 },
      total: 754,
    });
    expect(ROLES.every((role) => !view.submitted[role])).toBe(true);
  });
});

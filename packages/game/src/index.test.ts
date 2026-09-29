import { describe, expect, it } from 'vitest';
import { TOTAL_ROUNDS } from './index';

// Placeholder so `npm test` is green until the rules tests land in phase 2.
describe('@beer/game', () => {
  it('plays 20 rounds', () => {
    expect(TOTAL_ROUNDS).toBe(20);
  });
});

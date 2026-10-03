import { randomInt, randomUUID } from 'node:crypto';
import {
  claimRole,
  createGame,
  fillWithBots,
  findRoleByToken,
  placeOrder,
  RULE_ERROR_MESSAGES,
  type GameState,
  type Role,
  type RuleError,
  type RuleResult,
} from '@beer/game';
import type { GameStore } from './db';

export type ServiceError = RuleError | 'game_not_found' | 'unknown_player';
type Failure = { ok: false; error: ServiceError };

export const SERVICE_ERROR_MESSAGES: Record<ServiceError, string> = {
  ...RULE_ERROR_MESSAGES,
  game_not_found: 'There is no game with that code.',
  unknown_player: 'You are not a player in this game.',
};

/** No 0/O or 1/I/L, so a code read out loud or copied by hand stays unambiguous. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/**
 * Owns every game. Each intent runs get → pure rule → save → notify synchronously,
 * so on Node's single thread no two intents for a game can interleave.
 */
export class GameService {
  private readonly cache = new Map<string, GameState>();

  constructor(
    private readonly store: GameStore,
    private readonly onChange: (state: GameState) => void,
  ) {}

  get(code: string): GameState | null {
    const cached = this.cache.get(code);
    if (cached) return cached;

    const loaded = this.store.loadGame(code);
    if (loaded) this.cache.set(code, loaded);
    return loaded;
  }

  create(): GameState {
    let code = randomCode();
    while (this.get(code)) code = randomCode();

    const state = createGame(code);
    this.save(state);
    return state;
  }

  join(code: string, role: Role): { ok: true; token: string } | Failure {
    const token = randomUUID();
    const result = this.apply(code, (state) => claimRole(state, role, token));
    return result.ok ? { ok: true, token } : result;
  }

  placeOrder(code: string, token: string, quantity: number): { ok: true } | Failure {
    const result = this.apply(code, (state) => {
      const role = findRoleByToken(state, token);
      return role ? placeOrder(state, role, quantity) : { ok: false, error: 'unknown_player' };
    });
    return result.ok ? { ok: true } : result;
  }

  /** Only a seated player may hand the free roles to bots, so a passer-by cannot start a game. */
  fillWithBots(code: string, token: string): { ok: true } | Failure {
    const result = this.apply(code, (state) =>
      findRoleByToken(state, token) ? fillWithBots(state) : { ok: false, error: 'unknown_player' },
    );
    return result.ok ? { ok: true } : result;
  }

  private apply(
    code: string,
    rule: (state: GameState) => RuleResult | Failure,
  ): { ok: true; state: GameState } | Failure {
    const state = this.get(code);
    if (!state) return { ok: false, error: 'game_not_found' };

    const result = rule(state);
    if (result.ok) this.save(result.state);
    return result;
  }

  private save(state: GameState): void {
    // Persist first: if the write throws, the cache still holds the last saved state.
    this.store.saveGame(state);
    this.cache.set(state.code, state);
    this.onChange(state);
  }
}

function randomCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

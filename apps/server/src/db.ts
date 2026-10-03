import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { GameState } from '@beer/game';

export type GameStore = {
  loadGame(code: string): GameState | null;
  saveGame(state: GameState): void;
  close(): void;
};

/** Each game is one JSON row: players and tokens live inside the state. */
export function openGameStore(path: string): GameStore {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      code       TEXT PRIMARY KEY,
      state      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  const select = db.prepare<[string], { state: string }>('SELECT state FROM games WHERE code = ?');
  const upsert = db.prepare<[string, string, number]>(`
    INSERT INTO games (code, state, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (code) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
  `);

  return {
    loadGame(code) {
      const row = select.get(code);
      return row ? (JSON.parse(row.state) as GameState) : null;
    },
    saveGame(state) {
      upsert.run(state.code, JSON.stringify(state), Date.now());
    },
    close() {
      db.close();
    },
  };
}

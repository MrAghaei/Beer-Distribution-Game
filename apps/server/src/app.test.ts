import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CreateGameResponseSchema,
  JoinResponseSchema,
  ROLES,
  ServerMessageSchema,
  TOTAL_ROUNDS,
  type ClientMessage,
  type PlayerView,
  type Role,
  type ServerMessage,
} from '@beer/game';
import { buildApp } from './app';

// The real app on a free port, real HTTP and real WebSockets (Node's built-in client).

const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

async function startServer(dbPath = ':memory:') {
  const app = await buildApp({ dbPath, logger: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  cleanup.push(() => app.close());
  return { app, http: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}/ws` };
}

async function post(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}

type Client = {
  send(message: ClientMessage): void;
  /** Skips messages until one is a state matching `match`, and returns its view. */
  view(match?: (view: PlayerView) => boolean): Promise<PlayerView>;
  /** Skips messages until an error arrives, and returns its text. */
  error(): Promise<string>;
  close(): void;
};

async function connect(url: string): Promise<Client> {
  const socket = new WebSocket(url);
  const inbox: ServerMessage[] = [];
  let wake = () => {};
  socket.addEventListener('message', (event) => {
    inbox.push(ServerMessageSchema.parse(JSON.parse(String(event.data))));
    wake();
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  cleanup.push(() => socket.close());

  async function next<T>(pick: (message: ServerMessage) => T | undefined): Promise<T> {
    for (;;) {
      while (inbox.length > 0) {
        const picked = pick(inbox.shift()!);
        if (picked !== undefined) return picked;
      }
      await new Promise<void>((resolve) => (wake = resolve));
    }
  }

  return {
    send: (message) => socket.send(JSON.stringify(message)),
    view: (match = () => true) => next((m) => (m.type === 'state' && match(m.view) ? m.view : undefined)),
    error: () => next((m) => (m.type === 'error' ? m.message : undefined)),
    close: () => socket.close(),
  };
}

async function createGame(http: string): Promise<string> {
  const { status, data } = await post(`${http}/api/games`);
  expect(status).toBe(201);
  return CreateGameResponseSchema.parse(data).code;
}

async function joinGame(http: string, code: string, role: Role): Promise<string> {
  const { status, data } = await post(`${http}/api/games/${code}/join`, { role });
  expect(status).toBe(200);
  return JoinResponseSchema.parse(data).token;
}

/** Joins every role over HTTP and says hello over its own socket, as four tabs would. */
async function seatFourPlayers(server: { http: string; ws: string }, code: string) {
  const clients = {} as Record<Role, Client>;
  for (const role of ROLES) {
    const token = await joinGame(server.http, code, role);
    clients[role] = await connect(server.ws);
    clients[role].send({ type: 'hello', code, token });
  }
  return clients;
}

const nextRound = (round: number) => (view: PlayerView) => view.round > round || view.status === 'finished';

describe('server', () => {
  it('runs a whole game for four players: join over HTTP, hello and orders over WebSockets', async () => {
    const server = await startServer();
    const code = await createGame(server.http);
    const clients = await seatFourPlayers(server, code);

    for (const role of ROLES) {
      const view = await clients[role].view((v) => v.status === 'playing');
      expect(view).toMatchObject({ round: 1, myRole: role, me: { inventory: 12, backlog: 0 } });
    }
    expect((await post(`${server.http}/api/games/${code}/join`, { role: 'retailer' })).status).toBe(409);

    // Three orders are not enough; a second order from the same player only errors on its own socket.
    for (const role of ROLES.slice(0, 3)) clients[role].send({ type: 'placeOrder', quantity: 4 });
    const waiting = await clients.factory.view((v) => v.submitted.distributor);
    expect(waiting).toMatchObject({ round: 1, submitted: { retailer: true, factory: false } });
    clients.retailer.send({ type: 'placeOrder', quantity: 4 });
    expect(await clients.retailer.error()).toBe('You have already ordered this round.');
    clients.factory.send({ type: 'placeOrder', quantity: 4 });

    const latest = {} as Record<Role, PlayerView>;
    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
      if (round > 1) for (const role of ROLES) clients[role].send({ type: 'placeOrder', quantity: 4 });
      for (const role of ROLES) latest[role] = await clients[role].view(nextRound(round));
    }

    for (const role of ROLES) {
      expect(latest[role]).toMatchObject({
        status: 'finished',
        results: { costs: { retailer: 394, wholesaler: 120, distributor: 120, factory: 120 }, total: 754 },
      });
    }
  });

  it('lets one player fill the free roles with bots, but not a spectator', async () => {
    const server = await startServer();
    const code = await createGame(server.http);
    const player = await connect(server.ws);
    player.send({ type: 'hello', code, token: await joinGame(server.http, code, 'retailer') });
    const spectator = await connect(server.ws);
    spectator.send({ type: 'hello', code });

    expect(await spectator.view()).toMatchObject({ status: 'lobby', myRole: null });
    spectator.send({ type: 'fillWithBots' });
    expect(await spectator.error()).toBe('You are not a player in this game.');

    player.send({ type: 'fillWithBots' });
    const started = await player.view((v) => v.status === 'playing');
    expect(started.bots).toEqual({ retailer: false, wholesaler: true, distributor: true, factory: true });
    expect(started.submitted).toEqual({ retailer: false, wholesaler: true, distributor: true, factory: true });
    expect(await spectator.view((v) => v.status === 'playing')).toMatchObject({ round: 1, me: null });

    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
      player.send({ type: 'placeOrder', quantity: 8 });
      await player.view(nextRound(round));
    }
    const { results } = await spectator.view((v) => v.status === 'finished');
    for (const role of ROLES) expect(results?.history[role]).toHaveLength(TOTAL_ROUNDS);
  });

  it('keeps games and seats across a restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'beer-game-'));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const dbPath = join(dir, 'games.db');

    const first = await startServer(dbPath);
    const code = await createGame(first.http);
    const tokens = {} as Record<Role, string>;
    for (const role of ROLES) tokens[role] = await joinGame(first.http, code, role);
    const before = await connect(first.ws);
    before.send({ type: 'hello', code, token: tokens.wholesaler });
    before.send({ type: 'placeOrder', quantity: 7 });
    await before.view((v) => v.me?.pendingOrder === 7);
    before.close();
    await first.app.close();

    const second = await startServer(dbPath);
    const after = await connect(second.ws);
    after.send({ type: 'hello', code, token: tokens.wholesaler });
    expect(await after.view()).toMatchObject({
      status: 'playing',
      round: 1,
      myRole: 'wholesaler',
      submitted: { wholesaler: true, retailer: false },
      me: { pendingOrder: 7 },
    });
  });
});

# Beer Game

A small realtime multiplayer version of the **Beer Distribution Game**. Four
players (Retailer, Wholesaler, Distributor, Factory) each run one stage of a
supply chain for 20 rounds and try to keep the total cost low. The server is
authoritative, every player sees only their own numbers, and games survive a
reload or a server restart.

This is a take-home task. The original brief is in
[the first commit's README](https://github.com/MrAghaei/Beer-Distribution-Game/blob/d96a06d/README.md);
the rules I implemented are restated in [`PRD.md`](PRD.md) §3, and
[`EXAMPLE.md`](EXAMPLE.md) / [`fixtures/`](fixtures) hold the reference run.

## Running it

Requires **Node 24** (see `.nvmrc`) and **npm** (npm workspaces + Turborepo).

```sh
npm install     # one-time setup
npm run dev     # server on :3000 + Vite on :5173 → open http://localhost:5173
npm test        # rules tests (Vitest, packages/game)
npm run build   # builds apps/web/dist and apps/server/dist
npm start       # serves the built app and API on one port → http://localhost:3000
```

`npm run typecheck` type-checks all three packages.

To play alone: open the app, click **Create game**, copy the link into three
more tabs of the same browser and take a different role in each. The game starts
when the fourth role is taken.

| Variable   | Default             | Meaning |
|------------|---------------------|---------|
| `PORT`     | `3000`              | Server port. In dev, Vite's proxy follows it. |
| `DB_PATH`  | `data/beer-game.db` | SQLite file, created on first run. Relative paths resolve against `apps/server/`, because npm runs the server script from its workspace folder, so the default file is `apps/server/data/beer-game.db`. |

Deleting that file resets every game.

## How the pieces fit together

```text
                 ┌────────────────────────────────────────────────────────┐
                 │ packages/game  (@beer/game, pure TS, no I/O)           │
                 │   types.ts     GameState, RoleState, constants         │
                 │   rules.ts     createGame / claimRole / placeOrder     │
                 │   view.ts      toPlayerView(state, role)               │
                 │   protocol.ts  zod schemas for HTTP + WS messages      │
                 └──────────────▲───────────────────────────▲─────────────┘
                                │ imports                   │ imports
┌───────────────────────────────┴──────┐    ┌───────────────┴──────────────────────────┐
│ apps/web  (React, Vite, Tailwind v4) │    │ apps/server  (Fastify, better-sqlite3)   │
│   routes/Home, routes/Game           │    │   routes.ts       POST /api/games, /join │
│   components/Lobby, Board, Results   │◄──►│   ws.ts           /ws: hello, placeOrder │
│   hooks/useGameSocket                │ WS │   gameService.ts  cache → rule → save    │
│   lib/api (TanStack Query mutations) │HTTP│   hub.ts          per-player broadcast   │
│   lib/session (token per tab)        │    │   db.ts           games(code, state JSON)│
└──────────────────────────────────────┘    └──────────────────────────────────────────┘
```

- **`packages/game`** holds every rule and is the only place game numbers are
  computed. It exports TypeScript source directly (no build step); Vite bundles it
  into the client and tsup bundles it into the server.
- **`apps/server`** turns HTTP and WebSocket messages into calls to the rule
  functions, persists the result and pushes views. In production it also serves
  `apps/web/dist`, with an SPA fallback so `/game/ABC123` loads the client.
- **`apps/web`** has two routes: `/` (create or join by code) and `/game/$code`,
  which renders the lobby, the board or the results depending on `view.status`.
- `protocol.ts` is shared, so both sides validate the same message shapes with zod:
  the server validates every HTTP body and WS message, the client validates every
  server message.

## How four clients stay in sync

The server owns the only copy of the game; clients send intents and render
whatever snapshot they receive last.

1. **Join.** `POST /api/games/:code/join { role }` claims a role and returns a
   random token (`crypto.randomUUID()`). The client keeps it in `sessionStorage`
   under `beer:<code>`. sessionStorage is per tab and survives a reload, which is
   what lets four tabs of one browser be four players.
2. **Subscribe.** The client opens `/ws` and sends `hello { code, token? }`. The
   server resolves the token to a role (none or unknown = spectator) and
   registers the socket in the hub under that game and role.
3. **Intent → validate → persist → broadcast.** `placeOrder { quantity }` is
   parsed with zod, then `GameService` loads the game (from its in-memory `Map`,
   falling back to SQLite), runs the pure rule function, writes the new state to
   SQLite, updates the cache and asks the hub to broadcast.
4. **Per-player snapshot.** The hub sends each socket
   `toPlayerView(state, itsRole)`: a full snapshot of what that player may see
   (own numbers, who has taken a role, who has ordered, and the results once
   finished). Other roles' numbers and all tokens never leave the server, so
   information hiding doesn't depend on the UI. Errors go only to the socket that
   caused them.

**Why no locks:** steps 3–4 are synchronous (`better-sqlite3` is a synchronous
API) and Node runs JavaScript on one thread, so two orders for the same game can
never interleave. Each intent sees the state the previous one left behind, and
the fourth order of a round advances the round exactly once.

**Reconnects:** the client reconnects with exponential backoff (0.5 s up to 8 s)
and sends `hello` again; since every message is a full snapshot, there is nothing
to catch up on. A server restart therefore looks like a short disconnect: the game
is reloaded from SQLite on the first `hello`. A ping every 30 s removes sockets
that disappeared without a close frame. When a tab joins a role, it re-sends
`hello` on its open socket instead of reconnecting.

**Double submits** are rejected by the rules (`already_submitted`), and the order
form stays locked from sending until the server's snapshot shows the order, so
a double click or a slow connection can't place two orders.

## How game state is modelled

A whole game is one plain JSON object (`GameState` in
[`types.ts`](packages/game/src/types.ts)), stored as one row:
`games(code TEXT PRIMARY KEY, state TEXT, updated_at INTEGER)`.

```ts
type GameState = {
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  round: number;                                   // 0 in the lobby, then 1..20
  players: Partial<Record<Role, { token: string }>>;
  roles: Record<Role, RoleState>;
};

type RoleState = {
  inventory: number;
  backlog: number;
  inTransit: number[];         // shipments on the way; [0] arrives next round
  lastOrder: number;           // order placed last round, read by upstream
  pendingOrder: number | null; // this round's order, null until submitted
  totalCost: number;
  history: RoundRecord[];      // one record per round, same shape as the fixture
};
```

- **The in-transit queue** models the 2-round delay without counting rounds. Step 1
  takes the head of the queue; step 3 appends what the downstream neighbour was
  shipped. The queue is therefore length 2 at the start of every round, so
  something shipped in round r arrives in round r + 2. The supplier is just
  "append the Factory's last order to the Factory's queue".
- **`lastOrder` / `pendingOrder`** separate "what upstream sees this round" from
  "what I just typed". Orders are written into `lastOrder` only once all four are
  in, so a role's incoming order never depends on who submitted first.
- **`history`** is what the fixture test compares against, round by round, and
  what the board reads its "this round" numbers from.
- Rule functions are pure: they `structuredClone` the input and return
  `{ ok: true, state } | { ok: false, error }`. Expected violations (role taken,
  double submit, bad quantity) are values, not exceptions, and the server maps
  them to HTTP statuses (404 / 409 / 400 / 403) or WS error messages.

## Rule interpretations

Where the brief left room, I chose:

- **Round 20 still takes orders.** The fixture records an order placed in round 20,
  so round 20 works like every other round; the game finishes once those orders
  are in. They have no effect on costs.
- **Pop before push.** All roles receive their shipment (step 1) before anyone
  ships (step 3), so a shipment can never arrive in the round it was sent. This is
  what makes the `EXAMPLE.md` delay hold: the Retailer orders 8 in round 5, the
  Wholesaler sees 8 in round 6, and the Retailer receives 8 in round 8.
- **Shipped, not ordered.** Downstream receives what upstream actually shipped,
  which can be less than it ordered if upstream had a backlog.
- **Supplier delay.** The supplier ships the Factory's previous-round order into the
  same 2-round queue, so the Factory waits as long as everyone else.
- **Round 1** uses the starting "last order placed 4" as every non-retailer's
  incoming order.
- **Order limits.** An order must be a whole number from 0 to 10 000; the upper
  bound only exists to reject absurd input.
- **Late joiners** see the lobby or the game as spectators (who has ordered, but no
  numbers) and can't claim a role once the game has started.

## Tests

`npm test` runs 22 Vitest tests in `packages/game` (no React, HTTP, sockets or DB):

- **Fixture replay:** all four roles, all 20 rounds, every field of every record,
  final costs 394 / 120 / 120 / 120 = 754.
- **`EXAMPLE.md` delay check:** the Retailer switches to ordering 8 from round 5.
- Round advances only on the fourth order; double submits are rejected.
- Invalid quantities (−1, 2.5, NaN) and orders in the lobby or after the end are rejected.
- The game finishes exactly after round 20.
- Backlog is served before new orders once stock arrives (hand-built case).
- The supplier and downstream shipments follow the same delays; rule functions
  never mutate their input.
- `toPlayerView`: no tokens and no other role's numbers in the serialised view
  while playing; results only when finished.
- Claiming a taken role fails; the fourth claim starts round 1.

I checked that the tests catch deliberate bugs (off-by-one demand, shipping
what is owed instead of what is available, a supplier that ignores the order,
free backlog). The server and client were checked by hand and with a script that
plays a full game over real WebSockets, including restarting the server mid-game.
See [`TASKS.md`](TASKS.md) for the exact checks.

## Tradeoffs

- **One JSON column per game.** Writes are atomic and there are no joins or
  migrations, but the data can't be queried (e.g. "average cost per role").
  A finished game is about 10 KB, so rewriting it on every order is fine.
- **Full snapshots instead of diffs.** A view is a few hundred bytes, so sending the
  whole thing costs nothing. In return there is no sync drift, and a reconnect
  needs no special handling.
- **A bearer token in sessionStorage instead of accounts.** Anyone with the token
  is that player, and the browser's "Duplicate tab" copies it. Acceptable for a
  game among friends; not for anything with stakes.
- **One process with an in-memory cache.** The cache is the source of truth while
  the process runs, so there can be only one server instance. Scaling out would need
  the state in a shared store (Postgres/Redis) with per-game locking or
  compare-and-swap, plus pub/sub so every instance can push updates to its sockets.
  The cache also never evicts and games never expire.
- **No HTTP endpoint for game state.** The WebSocket is the only way to read a game,
  which keeps one code path for views. A REST `GET` would make debugging and an
  initial render without a socket easier.
- **Rules ahead of polish.** The UI is plain and functional; I put the time into
  the rules, the tests and the sync path, as the brief asks.

## What I'd do next

- A server integration test: real Fastify on `:memory:`, four WS clients, join →
  hello → order → round advances, plus a restart. (Done as a script so far, not in
  `npm test`.)
- A browser end-to-end test (Playwright) with four tabs.
- The optional extras: a chart of inventory, backlog and orders from `history` on
  the results screen, and bots that fill empty roles.
- Game expiry and cache eviction, and rate limiting on game creation.
- Let a player leave or be replaced in the lobby.

## How I used an AI assistant

I used Cursor's agent throughout. I first turned the brief into a spec
([`PRD.md`](PRD.md)) and a phased plan ([`TASKS.md`](TASKS.md)) together with the
assistant, then had it implement one phase at a time while I reviewed each diff,
asked for changes, and ran the manual checks listed in `TASKS.md`. The rules
engine and its tests came first, and the fixture test was the gate for
everything after. I can walk through any part of the code.

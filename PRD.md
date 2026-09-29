# PRD: Beer Game (multiplayer take-home)

## 1. Goal

A small, correct, realtime multiplayer version of the Beer Distribution Game.
Four players (Retailer, Wholesaler, Distributor, Factory) each run one stage of
a supply chain for 20 rounds and try to keep total cost low.

Reviewers weight, in order: **correct rules → readable code → backend/realtime
design → tests → README → visual polish.** Time budget: 6–10 h.

## 2. Users and core flow

1. Player A opens the app and clicks **Create game**. They get a room code and a
   shareable link (`/game/ABC123`).
2. Anyone with the link or code opens the lobby, sees which roles are free, and
   claims one.
3. When all four roles are taken, the game starts automatically at round 1.
4. Each round, every player sees only their own numbers and submits one order.
   The round advances once all four have submitted.
5. After round 20, everyone sees cost per role and the total.
6. Reloading a tab (or restarting the backend) puts the player back into the
   same game and role.

Must work with **one person playing all four roles from four tabs of one
browser**.

## 3. Game rules (source of truth)

Roles in chain order: `retailer → wholesaler → distributor → factory → supplier`.
Orders flow up, shipments flow down.

**Starting state, every role:** inventory 12, backlog 0, in transit `[4, 4]`
(arriving round 1 and round 2), last order placed 4.

**Customer demand** (Retailer's incoming order): 4 in rounds 1–4, 8 in rounds 5–20.

**Round r, steps 1–4 (run for all roles at once, by the server):**

1. **Shipments arrive:** take the head of the role's in-transit queue and add it
   to inventory.
2. **Orders arrive:** Retailer gets customer demand for round r; every other role
   gets the order its downstream neighbour placed in round r-1 (initially 4).
3. **Ship:** `shipped = min(inventory, backlog + incomingOrder)`;
   `backlog = backlog + incomingOrder - shipped`; `inventory -= shipped`.
   Shipped units are appended to the downstream neighbour's in-transit queue
   (arrive 2 rounds later). Retailer ships to the customer (units leave the
   system). The Factory's supplier appends exactly the Factory's previous-round
   order to the Factory's queue.
4. **Cost:** `roundCost = 0.5 × inventory + 1.0 × backlog`; add to total cost.

**Step 5:** each player submits one integer order ≥ 0. No double submit, no early
advance. When all four are in, those orders become "last order placed", the round
number increments and steps 1–4 run for the new round. After the orders for
round 20 are submitted, the game is **finished** (the fixture records an order
placed in round 20, so round 20 behaves like every other round).

**Ordering note:** because step 1 pops before step 3 pushes, the queue always has
length 2 at the start of a round, which gives exactly the 2-round delay in
`EXAMPLE.md` (Retailer orders 8 in round 5 → Wholesaler sees 8 in round 6 →
Retailer receives 8 in round 8).

**Acceptance checks**
- `fixtures/everyone-orders-four.json` matches round-by-round for all four roles:
  final costs 394 / 120 / 120 / 120, total 754.
- The delay check from `EXAMPLE.md` holds.

## 4. Functional requirements

| # | Requirement |
|---|---|
| F1 | Create a game → 6-char room code + link. |
| F2 | Lobby shows the four roles and which are taken; claim a free role; claiming a taken role fails. |
| F3 | Game auto-starts (round 1, steps 1–4 already applied) when four roles are taken. |
| F4 | Game screen: round `n / 20`, own inventory, backlog, shipment just arrived, order just arrived, amount shipped, last order, round cost, total cost; order input; per-role "submitted / waiting" indicators. |
| F5 | Submitting an order locks the input until the next round. |
| F6 | Results screen after round 20: cost per role and total. |
| F7 | Server is authoritative: clients only send intents (`placeOrder`), server validates and pushes the new per-player view to everyone in the game. |
| F8 | **Information hiding enforced server-side:** a player's payload never contains other roles' numbers while the game runs. Only after finishing are all costs revealed. |
| F9 | Games and players persisted in SQLite; survive a backend restart. |
| F10 | Reload rejoins the same game and role (per-tab identity). |
| F11 | Rules are unit-testable without React, HTTP, sockets or DB. |

## 5. Non-functional

- Node 24, npm workspaces + Turborepo. Root `npm install / dev / test / build / start` work unchanged.
- Readable over clever; no premature abstraction.
- Everything validated at the boundary with zod (HTTP bodies, WS messages).

## 6. Architecture

```text
apps/
  web/      React + Vite + Tailwind v4 + lucide-react + TanStack Router/Query
  server/   Fastify + @fastify/websocket + better-sqlite3
packages/
  game/     Pure rules engine + view projection + zod protocol schemas (+ Vitest tests)
```

### 6.1 `packages/game` (pure, no I/O)

- `types.ts` — `Role`, `RoleState`, `GameState`, `PlayerView`.
- `rules.ts`
  - `createGame(code)` → lobby state.
  - `claimRole(state, role, token)` → new state or error; starts the game when full.
  - `placeOrder(state, role, qty)` → new state or error (validates status,
    integer ≥ 0, not already submitted); advances the round when all four are in.
  - internal `runRoundSteps(state)` → steps 1–4.
- `view.ts` — `toPlayerView(state, role | null)`: the only way state leaves the
  server. Strips tokens and other roles' numbers.
- `protocol.ts` — zod schemas for client→server and server→client messages.
- Functions return new state (or mutate a clone) and a typed `{ ok, error }`
  result; no exceptions for expected rule violations.

**State model (whole game = one JSON blob):**

```ts
type RoleState = {
  inventory: number; backlog: number;
  inTransit: [number, number];      // arrives this round / next round (before step 1)
  lastOrder: number;                // order placed last round (read by upstream)
  pendingOrder: number | null;      // this round's submission
  totalCost: number;
  history: RoundRecord[];           // shipmentArrived, incomingOrder, shipped, inventory, backlog, roundCost, orderPlaced
};
type GameState = {
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  round: number;                    // 0 in lobby, 1..20
  players: Partial<Record<Role, { token: string }>>;
  roles: Record<Role, RoleState>;
};
```

`history` matches the fixture shape, so the fixture test compares it directly.
It also makes an optional chart trivial later.

### 6.2 `apps/server`

- **HTTP (Fastify)**
  - `POST /api/games` → `{ code }`
  - `POST /api/games/:code/join` `{ role }` → `{ token, role }` (409 if taken, 404 if unknown)
- **WebSocket** `GET /ws`
  - client → `{ type: 'hello', code, token? }` (no token = spectator/lobby view)
  - client → `{ type: 'placeOrder', quantity }`
  - server → `{ type: 'state', view: PlayerView }` (always a full snapshot, not a diff)
  - server → `{ type: 'error', message }`
- **GameService**: `Map<code, GameState>` cache, loaded from SQLite on first
  access. Each intent: load → pure rule function → persist → broadcast.
  Node's single thread plus synchronous `better-sqlite3` means each intent is
  handled atomically, so no locks are needed.
- **Broadcast**: `Map<code, Set<{ socket, role | null }>>`; after each change, send
  `toPlayerView(state, role)` to each socket.
- **SQLite**: one table `games(code TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER)`.
  Players and tokens live inside the JSON. WAL mode. DB path from `DB_PATH` env,
  default `./data/beer-game.db`.
- **Prod**: server also serves `apps/web/dist` statically (one port, one process).

### 6.3 `apps/web`

Routes (TanStack Router, code-based, two routes):
- `/`: create game, or enter a code to join.
- `/game/$code`: one page that renders **Lobby / Game / Results** from `view.status`.

Data:
- TanStack Query `useMutation` for the two HTTP calls only.
- `useGameSocket(code, token)` hook: opens the WS, sends `hello`, stores the
  latest `view` in state, reconnects with backoff and re-sends `hello`.
- **Identity:** token stored in **`sessionStorage`** under `beer:<code>`.
  sessionStorage is per tab and survives reload, which is what makes four tabs
  of one browser behave as four players. `localStorage` would be shared across
  the tabs.

Dev: Vite proxies `/api` and `/ws` to the server.

## 7. Testing

Vitest in `packages/game`:
1. Fixture replay: all four roles, all 20 rounds, every field, plus final costs 754.
2. Delay check from `EXAMPLE.md` (Retailer orders 8 from round 5).
3. Round does not advance until all four submit; double submit rejected.
4. Invalid orders rejected (negative, non-integer, NaN, when not playing).
5. Game finishes after round 20; further orders rejected.
6. Backlog is served first once stock arrives (hand-built case).
7. `toPlayerView` never contains other roles' numbers or any tokens while playing.
8. Claiming a taken role fails; the game starts at 4/4.

Optional: one server test for the join → hello → order flow over a real socket.

## 8. Out of scope (unless time is left)

Bots for empty roles, charts, animations/3D, auth/accounts, leaving or
kicking players, multiple server instances, game expiry/cleanup.

## 9. Known tradeoffs (for the README)

- Whole game as one JSON column: simple, atomic writes, no joins. Not queryable.
- Full-state snapshots over WS instead of diffs: payload is tiny and there is no
  sync drift.
- Bearer token in sessionStorage instead of real auth: "Duplicate tab" copies it,
  which is acceptable here.
- In-memory cache in a single process: no horizontal scaling. That would need a
  shared store plus pub/sub.

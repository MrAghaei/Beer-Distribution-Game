# Tasks

Implementation plan for `PRD.md`. Work top to bottom; each phase leaves the repo
in a working state. Estimates add up to ~8 h.

---

## Phase 0: Monorepo scaffold (~45 min)

- [x] `git init`; extend `.gitignore` (`dist/`, `.turbo/`, `data/`, `*.db*`).
- [x] Root `package.json`:
  - `"packageManager": "npm@<version>"`, `"workspaces": ["apps/*", "packages/*"]`
  - devDeps: `turbo`, `typescript`
  - scripts:
    - `dev`: `turbo run dev`
    - `build`: `turbo run build`
    - `test`: `turbo run test`
    - `start`: `npm run start -w @beer/server`
- [x] `turbo.json`: `build` (dependsOn `^build`, outputs `dist/**`), `dev`
      (persistent, no cache), `test` (dependsOn `^build` only if needed).
- [x] `tsconfig.base.json` (strict, `moduleResolution: bundler`, ES2023).
- [x] `packages/game` (`@beer/game`): exports TS source directly
      (`"exports": { ".": "./src/index.ts" }`) so no build step is needed; deps `zod`;
      devDeps `vitest`.
- [x] `apps/server` (`@beer/server`): deps `fastify`, `@fastify/websocket`,
      `@fastify/static`, `better-sqlite3`, `zod`, `@beer/game`; devDeps `tsx`, `tsup`,
      `@types/better-sqlite3`.
- [x] `apps/web` (`@beer/web`): Vite React TS template; `tailwindcss` +
      `@tailwindcss/vite`, `lucide-react`, `@tanstack/react-router`,
      `@tanstack/react-query`, `@beer/game`.
- [x] Check: `npm install` then `npm run dev` starts both processes.

## Phase 1: Rules engine in `packages/game` (~2 h). Most important.

- [x] `types.ts`: `ROLES` tuple (chain order), `Role`, `RoleState`, `RoundRecord`,
      `GameState`, constants (`TOTAL_ROUNDS = 20`, `HOLDING_COST = 0.5`,
      `BACKLOG_COST = 1`, `customerDemand(round)`).
- [x] `rules.ts`
  - [x] `createGame(code)`: status `lobby`, round 0, every role at its starting state.
  - [x] `claimRole(state, role, token)`: reject if not in lobby or role taken; when
        4/4, set `playing`, round 1, run steps 1–4.
  - [x] `runRoundSteps(state)`: steps 1–4 exactly as in PRD §3; append a `RoundRecord`
        per role (`orderPlaced` filled in later).
  - [x] `placeOrder(state, role, qty)`: validate (playing, integer ≥ 0, sensible max
        e.g. 10 000, not already submitted); set `pendingOrder`. If all four are set:
        write `orderPlaced` into the history, set `lastOrder`, clear pending; if
        round = 20 → `finished`, else round++ and `runRoundSteps`.
  - [x] Return type `{ ok: true, state } | { ok: false, error: RuleError }` (error codes +
        `RULE_ERROR_MESSAGES`, so the server can map them to HTTP statuses).
  - [x] `findRoleByToken(state, token)` for the server.
- [x] `view.ts`: `toPlayerView(state, role | null)`
  - always: code, status, round, totalRounds, `rolesTaken: Record<Role, boolean>`,
    `submitted: Record<Role, boolean>`, `myRole`.
  - `me` (own role only, when playing/finished): latest record fields + last order +
    total cost + `pendingOrder` (own submitted amount, null until ordered).
  - `results` (only when `finished`): cost per role + total.
  - never tokens, never other roles' state.
- [x] `protocol.ts`: zod schemas + inferred types
  - `ClientMessage`: `hello { code, token? }` | `placeOrder { quantity }`
  - `ServerMessage`: `state { view }` | `error { message }`
  - `PlayerViewSchema`: the view type is inferred from it, so the client can validate
    what it receives.
  - `CreateGameResponse`, `JoinRequest { role }`, `JoinResponse { token, role }`
- [x] `index.ts` barrel.

## Phase 2: Rules tests (~1 h)

`packages/game/src/rules.test.ts` and `view.test.ts` (Vitest), with helpers in
`test-helpers.ts` (`startGame()`, `play(state, orderFn, untilRound?)`, `unwrap`).

- [x] Fixture replay: load `fixtures/everyone-orders-four.json`; for every round
      and role compare the history record; final costs 394/120/120/120, total 754.
- [x] EXAMPLE.md delay check: Retailer orders 8 from round 5 → Wholesaler's
      incoming order is 8 first in round 6; Retailer's shipment is 8 first in round 8.
- [x] Round does not advance with 3/4 submissions; second submission from the same
      role is rejected.
- [x] Invalid quantities are rejected (−1, 2.5, NaN), and so are orders in the
      lobby or after the game has finished.
- [x] Finishes exactly after round 20's orders.
- [x] Backlog is served before new orders once stock arrives (small hand case).
- [x] `toPlayerView` while playing: serialised JSON contains no token and no other
      role's inventory/backlog/cost; `results` appears only when finished.
- [x] `claimRole`: taken role rejected; game starts at 4/4 with round 1 applied.
- [x] Extra: the supplier delivers the Factory's order with the same delays; downstream
      receives what was shipped, not what was ordered; rule functions never change
      their input.
- [x] Checked that the tests catch deliberate bugs (off-by-one demand, shipping the
      owed amount, supplier ignoring the order, free backlog).
- [x] Root `npm test` runs these (22 tests).

## Phase 3: Server (~1.5 h)

- [ ] `db.ts`: open better-sqlite3 (`DB_PATH`, default `data/beer-game.db`, mkdir),
      WAL, `CREATE TABLE IF NOT EXISTS games(code PK, state TEXT, updated_at INT)`;
      `loadGame(code)`, `saveGame(state)` (upsert).
- [ ] `gameService.ts`: `Map` cache over the DB; `create()` (unique 6-char code,
      unambiguous alphabet), `join(code, role)` → token (`crypto.randomUUID()`),
      `placeOrder(code, token, qty)`. Each method: get → pure fn → save → notify.
- [ ] `hub.ts`: sockets per game `{ socket, role | null }`; `broadcast(code)` sends
      `toPlayerView` per socket; remove sockets on close.
- [ ] `routes.ts`: `POST /api/games`, `POST /api/games/:code/join` (zod-validated;
      404 / 409 / 400 mapped from rule errors).
- [ ] `ws.ts`: `/ws`; parse every message with `ClientMessage.safeParse`; `hello`
      resolves the token to a role (an unknown token means a spectator) and sends
      the current view; `placeOrder` requires a bound role; errors are sent only to
      that socket.
- [ ] `index.ts`: Fastify app, register routes + ws. (Done early: in production it serves
      `apps/web/dist` with an SPA fallback to `index.html`; `PORT` env (default 3000).)
- [ ] Scripts: `dev`: `tsx watch src/index.ts`; `build`: `tsup` (bundle `@beer/game`,
      keep `better-sqlite3` external); `start`: `node dist/index.js`.
- [ ] Manual check with a WS client: restart the server mid-game and confirm the
      state is still there.

## Phase 4: Web client (~2 h)

- [ ] Tailwind v4 via `@tailwindcss/vite`, `@import "tailwindcss"` in `index.css`.
- [ ] Vite `server.proxy`: `/api` → `http://localhost:3000`, `/ws` → ws proxy.
- [ ] `QueryClientProvider` + TanStack Router (code-based): `/` and `/game/$code`.
- [ ] `lib/api.ts`: `createGame()`, `joinGame(code, role)` (parse responses with zod).
- [ ] `lib/session.ts`: get/set token in `sessionStorage` under `beer:<code>`.
- [ ] `hooks/useGameSocket.ts`: connect, send `hello`, keep `view` + `connected` +
      `lastError`, expose `placeOrder(qty)`, reconnect with backoff.
- [ ] `routes/Home.tsx`: "Create game" button (mutation → navigate) and a
      join-by-code input.
- [ ] `routes/Game.tsx`: switch on `view.status`.
  - [ ] `Lobby.tsx`: code + copy-link button (lucide `Copy`), four role cards
        (free → "Take" button, taken → `Check`/`User` icon, yours highlighted),
        "waiting for N players".
  - [ ] `Board.tsx`: round `n/20`, stat tiles (inventory, backlog, shipment arrived,
        order arrived, shipped, last order, round cost, total cost), order form
        (integer input, disabled after submit), submission status per role
        (`CheckCircle` / `Clock`).
  - [ ] `Results.tsx`: table of cost per role + total, own role highlighted.
- [ ] Connection banner (`WifiOff`) while reconnecting; show server errors inline.
- [ ] Check: four tabs, create → join all four → play 20 rounds → results.
      Reload a tab mid-game; restart the server mid-game.

## Phase 5: Wiring, build and README (~45 min)

- [ ] `npm run build` builds web + server; `npm start` serves the whole app on one port.
- [ ] Fresh clone check: `npm install && npm test && npm run build && npm start`.
- [ ] Rewrite `README.md` (keep the task description short or link it):
  - [ ] how to run (commands, ports, `DB_PATH`, Node 24, npm)
  - [ ] how the pieces fit together (diagram of packages)
  - [ ] how four clients stay in sync (intent → validate → persist → per-player
        snapshot broadcast; single-threaded atomicity; reconnect + hello)
  - [ ] how state is modelled (`GameState`, the in-transit queue, history)
  - [ ] rule interpretations (round 20 still takes orders; queue pop-before-push)
  - [ ] tradeoffs (PRD §9) and what I'd do next
  - [ ] how an AI assistant was used

## Phase 6: Optional, only if time is left

- [ ] Line chart of inventory/backlog/orders from `history` on the results screen
      (reveal all roles only when finished).
- [ ] Bot that fills empty roles (e.g. orders `incomingOrder + (backlog − inventory)/2`,
      clamped ≥ 0) and submits automatically each round.
- [ ] One server integration test (real Fastify + ws client).

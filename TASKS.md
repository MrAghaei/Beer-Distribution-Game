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

- [x] `db.ts`: open better-sqlite3 (`DB_PATH`, default `data/beer-game.db`, mkdir),
      WAL, `CREATE TABLE IF NOT EXISTS games(code PK, state TEXT, updated_at INT)`;
      `loadGame(code)`, `saveGame(state)` (upsert).
- [x] `gameService.ts`: `Map` cache over the DB; `create()` (unique 6-char code,
      unambiguous alphabet), `join(code, role)` → token (`crypto.randomUUID()`),
      `placeOrder(code, token, qty)`. Each method: get → pure fn → save → notify.
- [x] `hub.ts`: sockets per game `{ socket, role | null }`; `broadcast(state)` sends
      `toPlayerView` per socket; remove sockets on close.
- [x] `routes.ts`: `POST /api/games`, `POST /api/games/:code/join` (zod-validated;
      404 / 409 / 400 mapped from rule errors).
- [x] `ws.ts`: `/ws`; parse every message with `ClientMessage.safeParse`; `hello`
      resolves the token to a role (an unknown token means a spectator) and sends
      the current view; `placeOrder` requires a bound role; errors are sent only to
      that socket.
  - Extra: ping/pong heartbeat every 30 s; a socket that misses a ping is terminated,
    so connections that dropped without a close frame leave the hub.
- [x] `index.ts`: Fastify app, register routes + ws. (Done early: in production it serves
      `apps/web/dist` with an SPA fallback to `index.html`; `PORT` env (default 3000).)
  - Extra: the app is built in `app.ts` (`buildApp({ dbPath, webDist })`) so a test can
    run it against `:memory:`; `index.ts` reads env, listens and closes cleanly on
    SIGINT/SIGTERM (sockets closed, DB checkpointed).
- [x] Scripts: `dev`: `tsx watch src/index.ts`; `build`: `tsup` (bundle `@beer/game`,
      keep `better-sqlite3` external); `start`: `node dist/index.js`.
- [x] Manual check with a WS client: restart the server mid-game and confirm the
      state is still there. (Scripted with Node's built-in `WebSocket`: 4 players play
      to round 6, restart, the factory's view is identical, the game finishes at
      394/120/120/120 = 754.)

## Phase 4: Web client (~2 h)

- [x] Tailwind v4 via `@tailwindcss/vite`, `@import "tailwindcss"` in `index.css`.
- [x] Vite `server.proxy`: `/api` → `http://localhost:3000`, `/ws` → ws proxy.
      (The target port follows `PORT`, so a second server can be tested on another port.)
- [x] `QueryClientProvider` + TanStack Router (code-based): `/` and `/game/$code`.
      (`router.tsx`; the `$code` param is upper-cased, so a hand-typed link works.)
- [x] `lib/api.ts`: `createGame()`, `joinGame(code, role)` (parse responses with zod).
- [x] `lib/session.ts`: get/set token in `sessionStorage` under `beer:<code>`.
- [x] `hooks/useGameSocket.ts`: connect, send `hello`, keep `view` + `connected` +
      `lastError`, expose `placeOrder(qty)`, reconnect with backoff.
  - Extra: the socket is keyed on the code only; the token is read via `useEffectEvent`,
    so joining a role re-sends `hello` on the open socket instead of reconnecting.
    Incoming messages are validated with `ServerMessageSchema`; `sendingOrder` locks the
    form between sending an order and the server's answer.
- [x] `routes/Home.tsx`: "Create game" button (mutation → navigate) and a
      join-by-code input.
- [x] `routes/Game.tsx`: switch on `view.status`. (Also: invalid code, unknown game and
      "connecting" screens; `key={code}` gives each game a fresh socket and token.)
  - [x] `Lobby.tsx`: code + copy-link button (lucide `Copy`), four role cards
        (free → "Take" button, taken → `Check`/`User` icon, yours highlighted),
        "waiting for N players".
  - [x] `Board.tsx`: round `n/20`, stat tiles (inventory, backlog, shipment arrived,
        order arrived, shipped, last order, round cost, total cost), order form
        (integer input, disabled after submit), submission status per role
        (`CircleCheck` / `Clock`; lucide 1.x dropped the `CheckCircle` name).
        The input is prefilled with last round's order and validated with
        `OrderQuantitySchema` before sending. A spectator sees only who has ordered.
  - [x] `Results.tsx`: table of cost per role + total, own role highlighted.
- [x] Connection banner (`WifiOff`) while reconnecting; show server errors inline.
- [x] Check: four tabs, create → join all four → play 20 rounds → results.
      Reload a tab mid-game; restart the server mid-game. (Everyone ordered 4: round 8
      matched the fixture, a reloaded tab came back as the same role with its order still
      locked, the server was killed and restarted on the same DB at round 8 and every tab
      reconnected, and the results showed 394/120/120/120 = 754. Also checked: lower-case
      link, unknown code, invalid code, and a spectator on the finished game.)

## Phase 5: Wiring, build and README (~45 min)

- [x] `npm run build` builds web + server; `npm start` serves the whole app on one port.
      (Checked on `PORT=3100`: `/`, a deep link, static assets and the API from one
      process; unknown `/api/*` stays a JSON 404. A scripted game over WS against the
      built server ended at 394/120/120/120 = 754.)
- [x] Fresh clone check: `npm install && npm test && npm run build && npm start`.
      (Copy of the tracked + untracked files in `/tmp`, clean `node_modules`. The
      `allowScripts` entry named `esbuild@0.27.7` while the lockfile pins `0.27.2`,
      so install warned; fixed. The default DB lands in `apps/server/data/`.)
- [x] Rewrite `README.md` (task description reduced to a summary + link to the
      original brief in the first commit):
  - [x] how to run (commands, ports, `DB_PATH`, Node 24, npm)
  - [x] how the pieces fit together (diagram of packages)
  - [x] how four clients stay in sync (intent → validate → persist → per-player
        snapshot broadcast; single-threaded atomicity; reconnect + hello)
  - [x] how state is modelled (`GameState`, the in-transit queue, history)
  - [x] rule interpretations (round 20 still takes orders; queue pop-before-push)
  - [x] tradeoffs (PRD §9) and what I'd do next
  - [ ] how an AI assistant was used (drafted; needs the author's own account)

## Phase 6: Optional, only if time is left

- [x] Line chart of inventory/backlog/orders from `history` on the results screen
      (reveal all roles only when finished).
  - `results.history` (every role's `RoundRecord[]`) is part of the view only once the
    game is finished, so information hiding is still enforced server-side.
  - `HistoryChart.tsx`: hand-rolled SVG (no chart dependency), one line per role, own
    line thicker; switch between orders (with customer demand dashed), inventory and
    backlog; hovering a round shows every role's value in the legend. It measures its
    container, so labels keep their size on a phone.
- [x] Bot that fills empty roles (e.g. orders `incomingOrder + (backlog − inventory)/2`,
      clamped ≥ 0) and submits automatically each round.
  - `bot.ts`: `botOrder(record)`, rounded and clamped to 0..`MAX_ORDER`.
  - `fillWithBots(state)` rule: seats `{ bot: true }` in free roles and starts the game;
    rejected outside the lobby or without a person (`no_human_player`). Bots order in
    the rules as each round starts, so no timers and nothing to lose on a restart.
  - WS intent `fillWithBots`, accepted only from a socket bound to a role. Lobby button
    "Fill N roles with bots"; the board and results mark bot roles (`view.bots`).
- [x] One server integration test (real Fastify + ws client).
  - `apps/server/src/app.test.ts` (`npm test`): the real app on a free port with Node's
    built-in `WebSocket`. A full four-player game (754), bots + spectator permissions,
    and a restart on the same DB file.
- [x] Check: played a game in the browser as the Wholesaler against three bots to the
      results chart (desktop and 390 px wide).

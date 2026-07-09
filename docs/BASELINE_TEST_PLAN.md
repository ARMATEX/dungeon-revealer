# Baseline Test Plan

## Purpose

This document defines the automated and manual baseline for the current (legacy) behavior of
Dungeon Revealer 1.17.1 in this fork. Its goal is to protect existing behavior BEFORE any bug
fixing, authentication/authorization hardening, dependency upgrades (Node, npm, TypeScript, React,
Vite, Relay, Socket.IO), architectural reorganization, or new features (character sheets,
sessions). The tests pin down what the application does today — including known defects — so that
future changes can be verified against a green, deterministic suite.

Nothing in this task modernizes the project or fixes functional bugs. Defects found during the
work are documented below and, where safe, covered by tests that assert the CURRENT behavior
(clearly marked `KNOWN DEFECT (documented)` in the test titles).

## Confirmed Legacy Baseline

Verified before this task on the compatible legacy environment:

- `npm ci`: success (1,566 packages, `patch-package` patches applied, Husky hooks installed).
- Test suites before this task: **8 suites, 89 tests, 4 snapshots — all passing**.
- `npm run build`: success (Vite frontend + tsc backend).
- Known install/build warnings that are part of the legacy state (do NOT "fix" them here):
  - 90 vulnerabilities reported in old dependencies;
  - Browserslist: `caniuse-lite` outdated warning;
  - chunks larger than 500 KiB after minification (Vite warning);
  - use of `eval` in a dependency.
- Do not run `npm audit fix`, `npm audit fix --force`, `npm update`, or
  `npx browserslist@latest --update-db`.

After this task: **18 suites, 140 tests, 4 snapshots — all passing** (51 new tests across
10 new suites; no tests skipped).

## Environment

- Node.js 16.20.2, npm 7.24.2 (legacy-compatible environment).
- Windows 11 verified; tests are OS-agnostic (dynamic ports, `fs.mkdtemp` temp directories, no
  personal absolute paths).
- Fully offline: no test performs network access beyond `127.0.0.1`.
- Jest 27 with babel-jest (`jest.config.js`, roots `src` and `server`); no new dependencies were
  added — the integration tests reuse packages already installed for the app itself
  (`socket.io-client`, `@n1ru4l/socket-io-graphql-client`,
  `@n1ru4l/graphql-live-query-patch-jsondiffpatch`, `fs-extra`, node `http`).

## Safety Guarantees

- Every suite creates a unique disposable directory via `fs.mkdtemp` under the OS temp directory
  (`server/test-helpers/create-test-root.ts`) and removes it afterwards.
- The server under test always receives an explicit `DATA_DIRECTORY` inside that temp root; the
  real default data directory (`<repo>/data`) is asserted untouched by
  `server/baseline-data-isolation.spec.ts` after every test in that suite.
- No real `db.sqlite`, maps, uploads, or settings are ever opened or created. Map/image fixtures
  are tiny generated files (a 68-byte 1x1 PNG).
- Servers listen on `127.0.0.1` with a dynamic port (`listen(0)`); no fixed ports.
- Passwords used in tests are throwaway literals (`test-dm-secret`, `test-pc-secret`).
- Note (pre-existing behavior, not introduced by tests): the upload routes stage incoming files
  via `getTmpFile()` in the OS temp directory before moving them into the data directory. This is
  legacy production behavior (`server/util.ts`) and stays inside the OS temp dir.

## Existing Test Infrastructure

Before this task:

- Jest 27, babel-jest transform for `.ts/.tsx` only (`babel.config.js` targets current Node).
- 8 suites: `server/roll-dice.spec.ts`, `server/notes-lib.spec.ts`, `server/note-import.spec.ts`,
  `server/token-image-db.spec.ts`, `server/markdown-to-plain-text.spec.ts`,
  `src/color-lib.test.tsx`, `src/utilities/attribute-parser.spec.tsx`,
  `src/utilities/process-user-style-sheet.spec.tsx`.
- Patterns in use: in-memory SQLite (`initialize({ databasePath: ":memory:" })`), hand-rolled
  PubSub fakes, `test.each` tables, 4 snapshots (utilities). No server/socket integration tests,
  no temp-dir management, no shutdown/cleanup helpers, databases left unclosed (harmless for
  `:memory:`).
- `npm run test` runs `jest --passWithNoTests`.

Added by this task (`server/test-helpers/`, plain helpers — not test files):

- `create-test-root.ts` — unique temp root with `data/` and a minimal fake `public/`
  (`index.html` + favicon) so `bootstrapServer` does not depend on a real frontend build.
- `start-test-server.ts` — boots the real `bootstrapServer`, listens on a dynamic port, tracks
  connections, and returns a `close()` that shuts down Socket.IO, HTTP, open connections,
  FileStorage prepared statements, and the SQLite handle.
- `http-client.ts` — tiny `http`-based client (JSON + hand-built multipart bodies for busboy).
- `socket-graphql.ts` — Socket.IO client + `authenticate` handshake identical to the real
  frontend, GraphQL-over-socket execution, `@live` query collection with jsondiffpatch patches
  applied, and condition-based waiting (no arbitrary sleeps).
- `fixtures.ts` — 1x1 PNG buffer and on-disk map fixtures (`maps/<id>/settings.json` + image).

## Architecture Relevant to Testing

Verified in code (see `docs/PROJECT_CURRENT_STATE.md` for the full picture):

- Boot: `server/index.ts` → `bootstrapServer(env)` in `server/server.js` → `fs.mkdirpSync(DATA_DIRECTORY)`,
  `database.initialize` (migrations via `PRAGMA user_version` fall-through switch in
  `server/database.ts`), Express + `http.createServer` + Socket.IO (path `/api/socket.io`),
  `Maps`/`Settings`/`FileStorage`, REST routers, GraphQL-over-socket router, static serving.
  `bootstrapServer` accepts the whole `env` object, which makes injection of a temp
  `DATA_DIRECTORY`/`PUBLIC_PATH` possible without touching production paths.
- AuthN: `getRole(password)` compares plaintext against `DM_PASSWORD`/`PC_PASSWORD`; unset
  password = public role. REST token = the password itself (`Authorization: Bearer` or
  `?authorization=`). Socket: `authenticate {password, desiredRole}` → session role
  `admin`/`user`/`unauthenticated` consumed by `requireAdmin`/`requireAuth` (`server/auth.ts`).
- Persistence: SQLite (`file_uploads`, `notes`, `notes_search` FTS5, `tokenImages`; final
  `user_version` = 4); maps as folders under `<data>/maps/<id>/` mirrored in memory
  (`Maps._loadMaps` at boot); uploads under `<data>/files/`; `<data>/settings.json` holds
  `currentMapId`.
- Realtime: mutations/REST emit `invalidate` on a shared `EventEmitter`; `routes/graphql.ts`
  forwards to `InMemoryLiveQueryStore.invalidate`; live queries re-run and clients receive
  jsondiffpatch patches. Late joiners get current state from the first live query run; there is
  no replay buffer.

### Minimal testability changes to production code

All three are additive, keep default behavior identical, add no dependency, and do not affect
production paths or data. `npm run build` and `npm run eslint` pass; `type-definitions.graphql`
is unchanged.

1. `server/server.js` — `bootstrapServer` now also returns `db`, `emitter`, and `fileStorage`
   (previously only `app`, `httpServer`, `io`). `server/index.ts` still consumes only
   `httpServer`. Needed for clean shutdown and invalidation observation in tests.
2. `server/file-storage.js` — lazily prepared SQL statements are now tracked, and a
   `destroy()` method finalizes them. The production process never closes the database, so
   nothing changes at runtime; without this, `db.close()` fails with `SQLITE_BUSY` and the
   SQLite file stays locked on Windows, making temp-dir cleanup impossible.
3. `server/graphql/index.ts` + new `server/graphql/types-factory.ts` — the gqtx `t` factory
   moved to its own module and is re-exported from `index.ts` (all `import { t } from "../.."`
   consumers are untouched). Reason: the previous inline `export const t = ...` placed between
   import statements only worked because tsc emits CommonJS requires in source order; under
   spec-compliant import hoisting (babel-jest, the transform the repo already uses for tests)
   the circular `index ↔ modules` imports crashed at load. The generated schema is identical.

## P0 Automated Tests

All implemented and passing. File names map to the plan items:

- **P0.1 — `server/baseline-server-boot.spec.ts`** (4 tests): boot from an empty temp directory
  creates `db.sqlite`, `maps/`, `files/`, `settings.json`; migrations reach `user_version` 4;
  dynamic port answers HTTP (`/api/auth`); clean shutdown leaves the directory removable.
- **P0.2 — `server/baseline-database-migrations.spec.ts`** (4 tests): fresh directory migrates to
  version 4 with expected tables (`file_uploads`, `notes`, `notes_search`, `tokenImages`),
  indexes (`notes_desc_created_at_desc_id`, `index_tokenImages_sha256`) and note columns;
  re-opening is idempotent and preserves inserted data; legacy `notes/*.json` import works.
  No migration file was modified.
- **P0.3 — `server/baseline-data-isolation.spec.ts`** (3 tests): all persisted state (DB, maps,
  uploads, settings) stays inside the temp directory (exact directory listing asserted); the real
  default data directory is never created; `..` traversal on `PUT /files/(*)` is rejected and
  writes nothing outside `files/`; unregistered upload ids are rejected (401) and not stored.
  Defensive checks only — no offensive exploitation.
- **P0.4 — `server/baseline-authentication.spec.ts`** (8 tests): DM/PC/wrong/absent credentials
  via header and query parameter; role gates on player and DM routes; public mode (no passwords →
  everyone is DM); DM-only password mode (everyone is at least PC); malformed Authorization
  header yields no role.
- **P0.5 — `server/baseline-authorization.spec.ts`** (12 tests): socket `authenticate` flow
  (silent failure on wrong password); PC-password client claiming `desiredRole: "admin"` still
  gets `user` (cannot escalate — confirmed); DM-password client controls its own session role
  (KNOWN SECURITY DEFECT, documented tests); re-authentication on the same connection is ignored;
  REST per-token permissions (player move allowed/blocked/hidden token 404, DM-only properties
  ignored for players, DM full update); unknown map PATCH crashes 500 (documented defect).
- **P0.6 — `server/baseline-active-map-persistence.spec.ts`** (3 tests): activate map → memory,
  API and `settings.json` agree; full restart on the same directory preserves the active map;
  maps on disk are loaded at boot; activating an unknown map id is accepted and served as `null`
  (current behavior).
- **P0.7 — `server/baseline-live-query-invalidation.spec.ts`** (3 tests): real end-to-end
  integration — `activeMap @live` over Socket.IO; `POST /api/active-map` emits exactly one
  `invalidate` with key `Query.activeMap` and the connected client receives the patched result;
  two clients receive the same update.
- **P0.8 — `server/baseline-shutdown.spec.ts`** (2 tests): `close()` stops HTTP (new connections
  refused), drops connected sockets, closes SQLite (subsequent queries reject); `close()` is
  idempotent; temp directory fully removable afterwards. The whole suite also passes with
  `--detectOpenHandles` (no open handles reported) and Jest exits without hanging.

## P1 Automated Tests

- **P1.1 (late join) — covered in `server/baseline-live-query-invalidation.spec.ts`**: a client
  that connects AFTER the active map was set receives the current state as the first live
  emission, with no dependency on earlier events.
- **P1.2 (reconnection)** — NOT automated; documented in the manual checklist. Simulating
  network loss with the real Socket.IO client is timing-sensitive; additionally the server-side
  `disconnect` cleanup listener is removed after authentication (see Known Defects), so automated
  assertions would pin fragile behavior. Do not fix reconnection in this task.
- **P1.3 — `server/baseline-file-upload.spec.ts`** (6 tests): DM multipart upload stored under
  `files/<uuid>.<ext>` and retrievable via `/api/images/:id` and static `/files`; players get 401
  on upload; multipart without a file part → 500 (documented defect; intended 422 is unreachable);
  dangerous client file names (`../../escape.png`) cannot control the storage location; list +
  delete round-trip; unauthenticated list/delete allowed (documented defect). Size-limit behavior
  is not automated (no giant fixtures) — the 50 MB body-parser limit applies to JSON, and busboy
  streams have no explicit limit; documented as a gap.
- **P1.4 — `server/baseline-map-tokens.spec.ts`** (7 tests): `Maps` backend API — create map,
  add tokens (current defaults: NOT visible, NOT movable by players), update/updateMany/remove,
  persistence across a fresh `Maps` instance, legacy token backfill (`prepareToken`), fog
  revision copy/paste defect (documented), map deletion. REST-level token authorization is
  covered in P0.5. UI-level token interaction is in the manual checklist.

## Manual Test Checklist

Run with `npm run start:server:dev` (+ `npm run start:frontend:dev` for dev, or a production
build). Use placeholder passwords via env vars; never commit real ones.

### DM (`/dm`)

- [ ] Open `/dm`, authenticate with the DM password.
- [ ] Upload a new map image; it appears in the map library.
- [ ] Load an existing map.
- [ ] Activate the map (share with players).
- [ ] Reveal an area with the brush/area tool.
- [ ] Hide a revealed area again.
- [ ] Send the fog update to players ("send" action).
- [ ] Create a token; move it; edit its label/color/visibility; remove it.
- [ ] Switch to another map and share it.
- [ ] Stop sharing (players see the splash/no map).
- [ ] Open notes; create/edit/search a note.
- [ ] Open chat; send a message; roll dice (e.g. `[1d20]`).

### Player (`/`)

- [ ] Open the player page; authenticate with the PC password (or none if public).
- [ ] Receive the active map image.
- [ ] Receive only the live fog (revealed areas), never the DM fog.
- [ ] See only tokens marked visible to players; move only movable tokens.
- [ ] Refresh the page; state is restored.
- [ ] Connect AFTER the DM activated a map; current state appears without DM action.
- [ ] Kill the connection (e.g. toggle Wi-Fi); the client reconnects and re-authenticates.
- [ ] After reconnect, state converges (map, fog, tokens) and events are not duplicated
      (watch for duplicated chat "connected" messages — see Known Defects).
- [ ] Confirm no DM-only controls (fog tools, map library, token creation) are visible.

### Local network (core product principle)

- [ ] DM computer and a phone on the same Wi-Fi; open the printed `http://<ipv4>:<port>` URL.
- [ ] Works with the internet physically disconnected (LAN only).
- [ ] Two or more players connected simultaneously receive the same updates.
- [ ] Restart the server; players reconnect; active map and fog persist.

### Public screen (`?map_only`)

- [ ] Open `/?map_only` on a TV/projector browser.
- [ ] No chat and no notes UI are shown.
- [ ] Map and fog update live when the DM sends updates.
- [ ] Zoom/pan navigation works.

## Known Defects

None of these were fixed in this task. Severity: Critical / High / Medium / Low.
No remote-exploitation instructions are documented — entries describe behavior only.

1. **KNOWN SECURITY DEFECT: server-side role authorization** — **High** —
   `server/server.js` (`authenticate` handler): for a client presenting the DM password, the
   GraphQL session role is stored verbatim from the client-supplied `desiredRole` instead of
   being decided by the server (`role === "DM" ? desiredRole : "user"`). Omitting `desiredRole`
   stores `undefined`, which still passes `requireAuth` (`server/auth.ts` only rejects the
   literal `"unauthenticated"`). Current behavior: role value originates from the client;
   expected: the server derives the session role exclusively from the verified password.
   Clients with only the PC password can NOT escalate (verified by tests). Related legacy
   debt: passwords are compared in plaintext and the REST token is the password itself (also
   embedded in `mapImageUrl`/fog URLs by `server/graphql/modules/map.ts`).
   Tests: `baseline-authorization.spec.ts` (active, assert current behavior).
   Next task: fix server-side role derivation (see Recommended Next Task).
2. **Unprotected image endpoints** — **High** — `server/routes/files.js`: only
   `POST /api/images` is guarded by `roleMiddleware.dm`; `GET /api/images`,
   `GET/PATCH/DELETE /api/images/:id` have no role check, so unauthenticated callers can list,
   rename, fetch, and delete uploads. Expected: at least PC role for reads, DM for writes.
   Test: `baseline-file-upload.spec.ts` ("image list/read/delete endpoints do not require any
   role", active). Fix together with the authorization task.
3. **Unhandled rejection in `createResourceTaskProcessor`** — **Medium** — `server/util.ts`:
   the processor chains `queue.finally(...)` and never handles that derived promise; when a map
   task rejects (e.g. `updateToken` on a missing map), an unhandled promise rejection escapes.
   On Node >= 15 (including the Node 16 baseline) unhandled rejections terminate the process by
   default, so a single failed map task can crash the server. Observed empirically: Jest
   captures the unhandled rejection and fails the test (which is why no automated test asserts
   this path — documented instead in `baseline-map-tokens.spec.ts` as a comment).
   Steps: call `maps.updateToken("missing-map", ...)` directly. Expected: rejection surfaces
   only to the caller. Next task: handle or drop the `.finally` chain.
4. **Multipart upload without a file responds 500** — **Medium** — `server/routes/files.js`
   (also `routes/map.js` upload routes share the pattern): the busboy `finish` handler always
   calls `fileStorage.store()` even when no file part arrived, failing with ENOENT on a temp
   file that was never created; the intended 422 ("No file was sent.") from the request `end`
   handler loses the response race. Test: `baseline-file-upload.spec.ts` (active, asserts 500).
5. **PATCH token on unknown map returns 500 instead of 404** — **Medium** —
   `server/routes/map.js` (`PATCH /api/map/:id/token/:tokenId`): `map.tokens?.find(...)` runs
   before the `!map` 404 check, throwing a TypeError for unknown map ids. Test:
   `baseline-authorization.spec.ts` (active, asserts 500).
6. **Old map image never deleted on replacement** — **Medium** — `server/maps.ts`
   (`updateMapImage`): `fs.remove(map.mapPath)` passes a relative file name (e.g. `map.png`)
   that resolves against the process CWD instead of the map folder; the old image is not
   removed, and a same-named file in the CWD could be. No automated test (would have to touch
   the process CWD); verified by code reading.
7. **Re-authentication and disconnect cleanup lost after login** — **Low/Medium** —
   `server/server.js`: the `authenticate` handler calls `socket.removeAllListeners()`, removing
   both the `authenticate` listener (role changes require a full reconnect — current client
   works this way) and the `disconnect` cleanup listener (`authenticatedSockets.delete` never
   runs → unbounded Set growth over long sessions). Test: re-auth silence covered in
   `baseline-authorization.spec.ts`.
8. **`fogLiveRevision` loaded from `fogProgressRevision`** — **Low** — `server/maps.ts`
   (`_loadMaps`): copy/paste slip ignores the persisted `fogLiveRevision`. Only affects cache
   busting of fog URLs after a restart. Test: `baseline-map-tokens.spec.ts` (active).
9. **`prepareToken` never backfills `description`** — **Low** — `server/maps.ts`: the
   `description` default is guarded by a duplicated `typeof token.title !== "string"` check that
   is always false at that point. Verified by code reading; cosmetic.
10. **Dead Express error handlers** — **Low** — `server/server.js`: both "error handlers" take
    3 arguments, so Express treats them as regular middleware and never invokes them for errors
    (4 arguments are required); they also call `res.render` with no view engine configured.
    Errors fall through to the Express default handler (500 with a stack trace in
    non-production `NODE_ENV`). Indirectly exercised by the 500-asserting tests.
11. **Upload staging race: intermittent 500 on valid uploads** — **Medium** —
    `server/routes/files.js` (same pattern in `routes/map.js`): the busboy `finish` handler
    calls `fileStorage.store()` (or `maps.update*Image`) without waiting for the staging
    write stream's `close` event, racing against the temp file being created/flushed. Observed
    intermittently on Windows during this task: a well-formed `POST /api/images` occasionally
    answered 500 (`ENOENT` on the staging file). The baseline tests use a limited, explicitly
    documented retry (`uploadMultipartWithRetry` in `server/test-helpers/http-client.ts`) so
    the suite stays deterministic while the legacy race remains unfixed. Expected behavior:
    the route waits for the write stream to finish before consuming the staged file.
12. **FileStorage prepared statements are never finalized** — **Low** (operational) —
    `server/file-storage.js`: statements are prepared lazily and cached for the process
    lifetime, which makes `db.close()` impossible (`SQLITE_BUSY`). Irrelevant in production
    (the process never closes the DB); addressed for tests by the additive `destroy()` method.

## Coverage Gaps

- GraphQL mutations are not exhaustively exercised (map create/delete via upload registers,
  notes module, token images over GraphQL, chat/dice over GraphQL, splash image). REST-level
  equivalents and direct lib-level tests cover the core flows.
- Reconnection/re-authentication under network loss: manual only (see P1.2).
- Upload size limits: not automated (no giant fixtures); busboy streams have no explicit limit.
- Fog PNG upload endpoints (`POST /api/map/:id/fog`, `/send`): the fog write path is exercised
  only indirectly; pixel-level fog behavior is inherently visual (manual checklist).
- Frontend rendering (Three.js map view, DM/player UI separation) is untested automatically —
  no Testing Library/Playwright in the dependency set (adding them is out of scope).
- Chat/dice engine already has unit coverage (`roll-dice.spec.ts`); the socket chat flow is not
  integration-tested.
- `getDefaultDataDirectory` behavior (caxa vs repo-relative) is not tested; tests always inject
  an explicit `DATA_DIRECTORY`.

## Validation Commands

```bash
npm test -- --runInBand
npm test -- --runInBand --detectOpenHandles
npm run build
npm run eslint
git diff --check
git status --short
git diff --stat
git diff --name-only
# Forbidden files must show no diff:
git diff -- package.json
git diff -- package-lock.json
git diff -- Dockerfile
git diff -- .dockerignore
```

Results on this baseline: 18 suites / 140 tests / 4 snapshots passing (>= the original
8 / 89 / 4), no open handles, frontend and backend builds passing, ESLint clean, no forbidden
file modified, no generated file hand-edited (`type-definitions.graphql` untouched).

## Recommended Next Task

```text
Corrigir e testar a autorização server-side da role do Dungeon Master.
```

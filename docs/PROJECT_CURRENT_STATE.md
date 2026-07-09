# Project Current State — Dungeon Revealer

Detailed technical reference, consulted on demand. High-level guidance lives in `CLAUDE.md`.
Facts here were verified against the source in this working copy.

## 1. Overview

Dungeon Revealer is a self-hosted web application for tabletop RPG sessions. The Dungeon Master (DM)
runs a single Node.js server; players connect from a browser. It provides map fog of war, tokens, a
dice-roll chat, notes, and media/image sharing, all synchronized in real time. The DM uses `/dm`;
players use `/`. Passwords are optional and role-based.

## 2. Status of This Copy

- Not a Git repository (no `.git` directory). Likely a downloaded release, so there is no history.
- Source of truth is the local file contents.
- No source code was modified while producing this documentation.

## 3. Version and Origin

- `package.json` → `version: 1.17.1`, name `dungeon-revealer`, upstream
  `github.com/dungeon-revealer/dungeon-revealer`.
- This local copy is intended as the base for a fork that will be modernized (see §27).

## 4. Condensed Project Tree

```
server/            Backend (mixed TS + JS)
  index.ts         Process entry: reads env, calls bootstrapServer, listens
  server.js        bootstrapServer: Express + Socket.IO + routes + auth
  env.ts           Env var parsing
  database.ts      SQLite open + migration runner
  migrations/      0..3 schema migrations (PRAGMA user_version)
  maps.ts          Filesystem-backed map store (in-memory mirror)
  file-storage.js  Uploaded files (DB record + files/ on disk)
  notes-db.ts      Notes CRUD + FTS5 search
  token-image-db.ts / token-image-lib.ts  Token images
  settings.ts      settings.json (currentMapId)
  chat.ts          Chat + dice roll message model
  roll-dice.ts     Dice notation evaluation
  auth.ts          GraphQL role guards (requireAdmin/requireAuth)
  socket-session-store.ts  Per-socket session records
  live-query-store.ts / apply-decoder.ts / iterate-stream.ts  helpers
  routes/          map.js, files.js, graphql.ts, notes.ts
  graphql/         index.ts (schema) + modules/*
src/               Frontend (React + TS/TSX)
  index.tsx        Entry: routes by pathname to DM or player area
  dm-area/         DM UI (dm-area.tsx, dm-map.tsx, media-library, note-editor, ...)
  player-area.tsx  Player UI
  map-view.tsx / map-tools/  Three.js map + tools (brush, area-select, tokens, grid)
  chat/            Chat UI + mutations
  relay-environment.ts / socket.ts  GraphQL-over-Socket.IO client
  hooks/ utilities/ leva-plugin/    shared code
type-definitions.graphql   Generated GraphQL SDL (do not edit)
index.html         Vite HTML template
vite.config.ts relay.config.js jest.config.js tsconfig.json Dockerfile
scripts/           prebuild, copy-monaco-editor-files, write-graphql-schema
public/            Static assets (fonts, images, uploads placeholder)
```

## 5. Stack and Versions

Backend: Node.js 16, Express 4.17, Socket.IO 4.4, `graphql` 15.6 with `gqtx` schema builder,
live-query stack (`@n1ru4l/graphql-live-query`, `@n1ru4l/in-memory-live-query-store`,
`@n1ru4l/socket-io-graphql-server`, `@graphql-yoga/subscription`,
`@n1ru4l/graphql-live-query-patch-jsondiffpatch`), `sqlite` 4 + `sqlite3` 5, `fs-extra`,
`sanitize-html`, `liquidjs`, `showdown`, `@airjp73/dice-notation`, `io-ts`/`fp-ts`.
Frontend: React 17, Vite 2.7, TypeScript 4.4, Relay 10.1 (`react-relay`, `relay-hooks`,
`relay-compiler`, `relay-compiler-language-typescript`), Three.js 0.126 + `react-three-fiber` 5 +
`three-stdlib` + `troika-three-text`, Chakra UI 1.7 + `@emotion/*` + `framer-motion` 4, `zustand` 3,
Monaco editor + `@monaco-editor/react`, `leva`, `react-spring`, `react-use-gesture`.
Tooling: Babel, Jest 27, ESLint 7, Prettier, Husky + lint-staged, patch-package, caxa.

## 6. Available Scripts (`package.json`)

| Script | Purpose |
| --- | --- |
| `build:frontend` | copy monaco files, run relay-compiler, `vite build --base=./` |
| `build:backend` | `tsc --project server/tsconfig.json` (emits `server-build/`) |
| `build` | frontend then backend |
| `start` | `node ./bin/dungeon-revealer` (loads `server-build`) |
| `start:server:dev` | `ts-node-dev` on `server/index.ts` |
| `start:frontend:dev` | `vite` dev server (port 4000) |
| `test` | `jest --passWithNoTests` |
| `eslint` | lint JS files only |
| `relay-compiler` | regenerate Relay artifacts |
| `write-schema` | write GraphQL SDL from code |
| `compile` / `compile:win` | caxa single-binary packaging |
| `prebuild` / `postinstall` / `prepare` | prebuild script, patch-package, husky |

## 7. Build Flow

`npm run build` → `build:frontend` (monaco copy → relay-compiler generates `__generated__/` →
`vite build` outputs to `build/`) → `build:backend` (`tsc` compiles `server/` to `server-build/`).
The Dockerfile runs `npm install` then `npm run build`, prunes to production deps, and copies
`build/`, `server-build/`, and `node_modules` into a `node:16-slim` image. Runtime command:
`node server-build/index.js`.

## 8. Execution Flow

`server/index.ts` reads env (`getEnv`), calls `bootstrapServer(env)`, then `httpServer.listen(PORT,
HOST)` and prints reachable LAN addresses (player URL and `/dm`). `bootstrapServer` (`server.js`):
1. `fs.mkdirpSync(DATA_DIRECTORY)`.
2. `database.initialize` opens `db.sqlite` and runs migrations.
3. Creates Express app, HTTP server, and Socket.IO (`path: /api/socket.io`).
4. Instantiates `Maps`, `Settings`, `FileStorage`.
5. Middleware: busboy, morgan logger, favicon, body-parser (50mb JSON/urlencoded),
   `authorizationMiddleware` (assigns `req.role`).
6. Mounts REST routes (`/api/...`), the GraphQL-over-socket router, static file serving, and
   `/` + `/dm` returning the built `index.html` (with `PUBLIC_URL` substitution).
7. Socket.IO `connection` handler: sets an unauthenticated session, handles `authenticate`, and on
   success registers the socket with the GraphQL server.

## 9. Frontend Architecture

Entry `src/index.tsx` selects a component by `window.location.pathname`: `/dm` dynamically imports
`dm-area/dm-area.tsx`; anything else renders `player-area.tsx` (supports `?map_only` and `?password`
query params). Providers: Emotion cache, Chakra, a user-style-sheet orchestrator, and a modal
provider. Sound playback is registered globally.
- Map rendering uses Three.js via `react-three-fiber` (`map-view.tsx`, `lazy-loaded-map-view.tsx`,
  `three-line.tsx`). Tools live in `src/map-tools/` (brush, area-select, mark-area, token-marker,
  drag-pan-zoom, configure-grid, player-map-tool).
- GraphQL data flows through Relay (`relay-environment.ts`) over a Socket.IO transport
  (`socket.ts`), including `@live` live queries patched with jsondiffpatch.
- State: Relay store for server data; `zustand` and React context/hooks for local UI state
  (`src/hooks/`, `shared-token-state.tsx`, `update-token-context.tsx`).
- DM tools: media library, note editor (Monaco + markdown), token image cropper/upload, map select.
- Chat/dice UI in `src/chat/`. Notes rendering uses showdown/react-showdown + sanitize.

## 10. Backend Architecture

`server.js` wires everything. Roles are computed by `getRole(password)`: matches `DM_PASSWORD` →
`DM`, `PC_PASSWORD` → `PC`; an unset password grants that role to everyone. REST auth reads a
bearer token or `?authorization=` and sets `req.role`; `requiresDmRole` / `requiresPcRole` guard
routes. GraphQL context carries a `session` with role `admin`/`user`/`unauthenticated`
(`auth.ts` `requireAdmin`/`requireAuth`). Services (`Maps`, `Settings`, `FileStorage`, chat, user,
notes) are injected into the GraphQL context in `routes/graphql.ts`. Errors: REST routes use
`handleUnexpectedError`; GraphQL logs `originalError` via a middleware.

## 11. GraphQL

Schema is built in code with `gqtx` (`server/graphql/index.ts`) from modules in
`server/graphql/modules/`: `dice-roller-chat`, `user`, `notes`, `token-image`, `map`, plus a Relay
`node` field and `relay-spec` helpers. Query/Mutation/Subscription fields are aggregated from these
modules. The `@live` directive (`GraphQLLiveDirective`) enables live queries. SDL is generated into
`type-definitions.graphql` (used by the Relay compiler; do not hand-edit). Transport is Socket.IO,
not HTTP — there is no `/graphql` HTTP endpoint for queries.

## 12. Socket.IO and Realtime

- Client (`src/socket.ts`) connects `io(host, { path: "/api/socket.io" })`; `relay-environment.ts`
  wraps it with `createSocketIOGraphQLClient` and applies live-query JSON-diff patches.
- Server registers the socket via `registerSocketIOGraphQLServer` (lazy). Execution runs through
  `InMemoryLiveQueryStore.execute` → error-logging middleware → jsondiffpatch generator.
- PubSub (`@graphql-yoga/subscription`) drives chat/user/notes/map subscriptions.
- Invalidation: REST/mutations emit events on a shared `EventEmitter`; `routes/graphql.ts` listens
  for `invalidate` and calls `liveQueryStore.invalidate(key)`. Example: `POST /api/active-map` sets
  `currentMapId` then invalidates `Query.activeMap`, re-running live queries and patching clients.
- Late join: a newly authenticated client's live queries run against current state; there is no
  replay log. Disconnect drops the session from `socketSessionStore` and `authenticatedSockets`;
  Socket.IO reconnects and the client re-emits `authenticate`.
- In-memory state: `socketSessionStore`, `authenticatedSockets`, the live-query store, `Maps._maps`,
  and `Settings.settings`. Persistent state: SQLite tables and files on disk.

## 13. SQLite Database

- Opened by `server/database.ts` via `sqlite.open({ filename: <data>/db.sqlite, driver: sqlite3 })`.
- Migrations run on boot by inspecting `PRAGMA user_version` and falling through `switch` cases
  (intentional fall-through so all pending migrations apply):
  - `migrations/0.ts` → v1: `file_uploads` (id, title, path, created_at).
  - `migrations/1.ts` → v2: `notes` (id, title, content, created_at, updated_at); imports legacy
    `notes/*.json` files if present.
  - `migrations/2.ts` → v3: adds `notes.type` and `notes.is_entry_point`, creates FTS5 virtual table
    `notes_search`, and an index on notes.
  - `migrations/3.ts` → v4: `tokenImages` (id, title, sha256, sourceSha256, extension, createdAt) +
    unique index on sha256.
- Notes CRUD/search: `notes-db.ts` (uses `INSERT OR REPLACE`, FTS5 `MATCH`, `bm25`, `snippet`).
- Maps are NOT in SQLite (see §14).

## 14. File Storage

- `Maps` (`maps.ts`): each map is a folder `<data>/maps/<id>/` with `settings.json` plus the map
  image and fog images `fog.progress.png` (DM working fog) and `fog.live.png` (what players see).
  All maps are loaded into memory at boot (`_loadMaps`) and mutated through a serialized task
  processor; changes are written back to the folder.
- `FileStorage` (`file-storage.js`): uploaded images stored under `<data>/files/` with a random UUID
  filename; metadata row in `file_uploads`. Served via `/api/images/:id` and static `/files`.
- Token images: uploaded via `PUT /files/token-image/<id>.<ext>` (guarded by an in-memory upload
  register) and stored under `files/token-image/`; map images similarly under `files/map-image/`.
- `settings.json` at the data root stores `currentMapId`.
- Relationship: DB rows reference relative paths into `files/`; maps are folder-per-id on disk. Back
  up the entire data directory (DB + `maps/` + `files/` + `settings.json`) together.

## 15. Authentication and Permissions

- Env passwords `DM_PASSWORD` / `PC_PASSWORD` (`env.ts`). Unset password disables auth for that role
  (public access). Comparison is plaintext string equality in `getRole` (`server.js`).
- REST: token is taken from the `Authorization` header or `?authorization=` query and passed to
  `getRole`; the token IS the password. `requiresDmRole` / `requiresPcRole` gate routes.
- Socket/GraphQL: client emits `authenticate {password, desiredRole}`; server computes the role and
  stores a session as `desiredRole` (if DM) or `"user"`. GraphQL guards use `requireAdmin` /
  `requireAuth` (`auth.ts`) against `session.role` (`admin`/`user`/`unauthenticated`).
- Public routes: `/`, `/dm` (HTML), `/api/auth`, static assets. DM-only examples:
  `POST /api/active-map`, `POST /api/images` (upload). Player-or-DM: `GET /api/active-map`,
  `GET /api/map/:id/map`.
- Upload safety: `routes/graphql.ts` PUT handler rejects paths containing `..`; uploads must match a
  registered id. Body/upload size limit is 50mb.

## 16. Maps and Fog of War

Responsibility: authoritative map + fog state. Files: `server/maps.ts`, `server/map-lib.ts`,
`server/routes/map.js`, and GraphQL `modules/map.ts`; frontend `src/map-view.tsx`, `src/map-tools/*`,
`src/dm-area/dm-map.tsx`. Flow: DM paints reveal/hide with a brush/area tool → fog PNGs updated on
disk (`fog.progress.png` for the DM, `fog.live.png` pushed to players) → clients re-render via live
query / map endpoints. Persistent: fog PNGs and map `settings.json`. In-memory: `Maps._maps`.
Risk when changing: fog is raster PNG state, not vector; the DM/live split must stay consistent, and
map mutations go through the serialized task processor (do not bypass it).

## 17. Tokens

Token entities live in each map's `settings.json` (`MapTokenEntity` in `maps.ts`): id, position,
radius, rotation, color, label, `isVisibleForPlayers`, `isMovableByPlayers`, `isLocked`, optional
`reference` (to a note), and `tokenImageId`. `prepareToken` backfills defaults for older data.
Editing/moving tokens flows through GraphQL map mutations and live queries; `isMovableByPlayers`
governs whether players may drag a token. Token images are separate DB-backed assets (§14).

## 18. Chat and Dice

`server/chat.ts` defines the message model: `USER_MESSAGE` (with inline and liquid-referenced dice
rolls), `OPERATIONAL_MESSAGE` (system notices like connect/disconnect), and `SHARED_RESOURCE`
(note/image). Inline `[...]` segments are parsed and evaluated via `roll-dice.ts`
(`@airjp73/dice-notation`); `liquidjs` supports a `diceRoll` filter. Chat is in-memory + PubSub (not
persisted to SQLite). Frontend UI: `src/chat/*` with Relay mutations (`message-add-mutation`,
`log-in-mutation`, `change-name-mutation`).

## 19. Notes and Images

Notes: SQLite `notes` + FTS5 `notes_search` (`notes-db.ts`, GraphQL `modules/notes.ts`, importer
`note-import.ts`, REST `routes/notes.ts`). Notes have `type` and `is_entry_point`; content is
markdown, sanitized on render. Images/media: `FileStorage` + `file_uploads` table; the DM media
library (`src/dm-area/media-library/`) lists/uploads/deletes images; images can be shared to players
via chat `SHARED_RESOURCE` and the splash-image state (`splash-image-state.ts`, `splash-screen.tsx`).

## 20. Docker

Multi-stage `Dockerfile` (Node 16): dependency-builder installs deps → application-builder runs
`npm run build` (skippable with `--build-arg SKIP_BUILD=true`) → production-dependency-builder prunes
dev deps → `node:16-slim` final image copying `build/`, `server-build/`, `node_modules`, and
`package*.json`. Exposes 3000; `CMD node server-build/index.js`. Persist data by mounting a volume at
`/usr/src/app/data`. Do not modify the Dockerfile as part of feature work.

## 21. Local Network Execution

Default `HOST=0.0.0.0` binds all interfaces; on startup the server prints each IPv4 LAN address as
`http://<ip>:<port>` (player URL) and `.../dm`. Players on the same LAN reach the DM's machine
directly — no internet required. `PUBLIC_URL` supports serving under a base path/reverse proxy. This
LAN-first, offline-capable behavior is a core product principle and must be preserved.

## 22. Tests

Jest (`jest.config.js`, roots `src` and `server`, babel-jest transform). Existing specs:
`server/roll-dice.spec.ts`, `server/notes-lib.spec.ts`, `server/note-import.spec.ts`,
`server/token-image-db.spec.ts`, `server/markdown-to-plain-text.spec.ts`,
`src/color-lib.test.tsx`, `src/utilities/attribute-parser.spec.tsx`,
`src/utilities/process-user-style-sheet.spec.tsx`. Coverage is partial (dice, notes, token images,
some utilities). `npm run test` passes with no tests as a no-op guard.

## 23. Generated Files (do not hand-edit)

`type-definitions.graphql` (from code via `write-schema`/relay), all `src/**/__generated__/` Relay
artifacts, `build/` (Vite output), `server-build/` (tsc output), and copied monaco editor files.

## 24. Technical Debt

- Incomplete TS migration: backend still has `server.js`, `file-storage.js`, `routes/map.js`,
  `routes/files.js`; frontend has stray `.js` files.
- Two storage models: filesystem+in-memory for maps vs SQLite for notes/uploads/token-images.
- Plaintext password comparison; REST token equals the password; DM session role trusts client
  `desiredRole`. Chat history is not persisted.
- Old pinned dependencies (React 17, Vite 2, Relay 10, Three 0.126, Chakra 1) with `patches/` and
  `patch-package`. `renovate.json` present but upgrades are risky on this stack.
- 50mb body/upload limits; limited server-side validation of uploaded content beyond `..` checks.

## 25. Modernization Risks

- Relay + `gqtx` + the `@n1ru4l` live-query stack are tightly coupled and version-sensitive; upgrading
  any one likely breaks the socket GraphQL transport.
- React 17 → 18+ interacts with `react-three-fiber` 5, `framer-motion` 4, Chakra 1, and react-spring
  RC versions — coordinated upgrades only.
- Vite 2 → newer changes config/plugin APIs (`@vitejs/plugin-react-refresh`, babel-macros plugin).
- Data migrations must bump `user_version` and remain backward-compatible with existing data dirs;
  never rewrite the maps-on-disk format without a migration + backup path.

## 26. Confirmed Current Features

Fog-of-war maps (reveal/hide, DM vs live), tokens with per-token visibility/movement/lock and token
images, dice-roll chat with shared notes/images, notes with markdown + FTS5 search, media/image
library, splash-image sharing, role-based DM (`/dm`) vs player (`/`) views, optional passwords,
LAN/remote access, desktop and mobile support, single-binary and Docker distribution.

## 27. Planned Future Features (fork direction — not implemented)

In-person-first design with the DM computer as central authority and player devices as live clients.
Planned: QR-code/session-code join, character sheets (HP, resources, inventory, conditions,
initiative, rolls), private messages, per-player selective info/clues, optional public TV/projector
view, and configurable sheets for multiple RPG systems. Constraints: LAN-first, offline-capable,
internet optional, no mandatory cloud/Firebase/external accounts; preserve existing maps/tokens/fog.

## 28. Unconfirmed / Open Questions

- Exact default data directory per OS (`getDefaultDataDirectory` in `server/util`) not fully traced
  here — verify before documenting an absolute path.
- Full set of GraphQL mutations/subscriptions per module not exhaustively enumerated; read
  `server/graphql/modules/*` when working on a specific one.
- Whether GHCR/registry images are reachable in a given environment is environment-dependent and not
  verifiable from source (reported `unauthorized` externally — build locally instead).
- Precise reconnection/auth-retry behavior of the Socket.IO client under flaky networks not tested.

## 29. Index of Most Important Files

- Boot/HTTP: `server/index.ts`, `server/server.js`, `server/env.ts`.
- GraphQL/realtime: `server/routes/graphql.ts`, `server/graphql/index.ts`,
  `server/graphql/modules/*`, `src/relay-environment.ts`, `src/socket.ts`.
- Persistence: `server/database.ts`, `server/migrations/*`, `server/maps.ts`,
  `server/file-storage.js`, `server/notes-db.ts`, `server/token-image-db.ts`, `server/settings.ts`.
- Auth: `server/auth.ts` and the auth/role middleware inside `server/server.js`.
- Frontend entry/areas: `src/index.tsx`, `src/dm-area/dm-area.tsx`, `src/player-area.tsx`,
  `src/map-view.tsx`, `src/map-tools/*`, `src/chat/*`.

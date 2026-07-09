# CLAUDE.md

Guidance for Claude Code sessions in this repository. Keep it short; deep detail lives in
`docs/PROJECT_CURRENT_STATE.md`.

## Project Purpose

Dungeon Revealer is an open-source, self-hosted web app for tabletop RPG sessions. The DM runs the
server; players connect from a browser. Core value: reveal/hide map areas behind fog of war, move
tokens, chat with dice rolls, and share notes and images in real time.

## Current Product

Confirmed features (implemented): map fog of war (reveal/hide), tokens, dice-roll chat, notes with
full-text search, image/media library, token images, splash-image sharing, per-role DM/player views.
DM area is served at `/dm`; players use `/`. Passwords are optional; unset password = public access
for that role. Works on desktop, tablet, and phone; usable on LAN or over the internet.

## Product Direction (fork goals — NOT yet implemented)

This fork will be modernized toward in-person tabletop play where the DM's computer is the central
authority and players' phones/tablets/browsers are live clients. Planned (do not assume these exist):
QR-code/session-code join, character sheets (HP, resources, inventory, conditions, initiative),
private messages, per-player selective info/clues, an optional public TV/projector view, and
configurable sheets for multiple RPG systems. Principles: LAN-first, offline-capable, internet not
required for a local session, no mandatory cloud/Firebase/third-party accounts. Existing maps/tokens/
fog behavior must be preserved. Keep "current" vs "future" distinct in any new docs or code.

## Technology Baseline

Backend: Node.js 16, Express 4, Socket.IO 4, GraphQL (`gqtx` + `graphql` 15), live queries via
`@n1ru4l/*` + `@graphql-yoga/subscription`, SQLite (`sqlite`/`sqlite3`). Frontend: React 17, Vite 2,
TypeScript 4.4, Relay 10 (compiler), Three.js + `react-three-fiber` for map rendering, Chakra UI +
emotion + framer-motion, zustand, Monaco editor. Codebase is mixed JS/TS (incomplete TS migration).

## Architecture at a Glance

- One HTTP server (`server/server.js`) hosts Express REST, static file serving, and Socket.IO.
- GraphQL is transported over Socket.IO (not HTTP) via `@n1ru4l/socket-io-graphql-server`.
- Realtime updates use GraphQL **live queries**: a mutation/REST action invalidates a query key,
  the live-query store re-runs it, and clients receive JSON-diff patches.
- Maps + fog live on the filesystem and in memory; notes/uploads/token-images live in SQLite.

## Key Directories and Entry Points

- Backend entry: `server/index.ts` → `server/server.js` (`bootstrapServer`).
- Frontend entry: `src/index.tsx` → `/dm` loads `src/dm-area/dm-area.tsx`, `/` loads
  `src/player-area.tsx`.
- GraphQL schema: `server/graphql/index.ts` + `server/graphql/modules/*`; SDL in
  `type-definitions.graphql` (generated — do not hand-edit).
- REST routes: `server/routes/{map.js,files.js,graphql.ts,notes.ts}` + inline routes in `server.js`.
- Persistence: `server/database.ts`, `server/migrations/*`, `server/maps.ts`,
  `server/file-storage.js`, `server/notes-db.ts`, `server/settings.ts`, `server/token-image-db.ts`.
- Realtime/GraphQL client: `src/socket.ts`, `src/relay-environment.ts`.
- Generated code (do not edit): `src/**/__generated__/`, `type-definitions.graphql`, `build/`,
  `server-build/`.

## Canonical Commands

Verified in `package.json`:

- `npm install` — install deps (runs `patch-package` postinstall).
- `npm run build` — `build:frontend` (relay-compiler + vite) then `build:backend` (tsc).
- `npm run start` — run built app via `bin/dungeon-revealer` (requires a prior build).
- `npm run test` — Jest (`--passWithNoTests`).
- `npm run eslint` — lint `**/*.js` (JS only; TS is type-checked by tsc).
- `npm run start:server:dev` — backend via ts-node-dev (port 3000).
- `npm run start:frontend:dev` — Vite dev server (port 4000, proxies `/api` + `/files` to 3000).
- `npm run compile` / `npm run compile:win` — package a single binary with caxa.

Docker (verified against `Dockerfile`): `docker build -t dungeon-revealer-local:1.17.1 .` then run
with `-e DM_PASSWORD=<...> -e PC_PASSWORD=<...> -p 3000:3000 -v <data-dir>:/usr/src/app/data`.
Use placeholders only — never commit real passwords.

## Runtime Configuration

Env vars (see `server/env.ts`): `PORT` (default 3000), `HOST` (default `0.0.0.0`), `DM_PASSWORD`,
`PC_PASSWORD` (both optional; unset = public for that role), `PUBLIC_URL`, `DATA_DIRECTORY`.
Dev split: backend 3000, Vite frontend 4000.

## Persistence

Data root defaults to a per-OS app data dir, `DATA_DIRECTORY`, or `/usr/src/app/data` in Docker.
- SQLite `db.sqlite`: tables `file_uploads`, `notes`, `notes_search` (FTS5), `tokenImages`.
  Schema is created/upgraded by `PRAGMA user_version` migrations in `server/migrations/0..3`.
- Filesystem: `maps/<id>/settings.json` + map image + `fog.progress.png` / `fog.live.png` per map;
  `files/` for uploads and token images; `settings.json` for `currentMapId`. Maps are loaded into
  memory at boot (`Maps._loadMaps`).

## Realtime Invariants

- Clients connect Socket.IO at path `/api/socket.io`, then emit `authenticate {password, desiredRole}`;
  the server assigns a session role and registers the socket for GraphQL.
- DM edits reach players through live-query invalidation, e.g. `POST /api/active-map` →
  `emitter.emit("invalidate", "Query.activeMap")`. Keep invalidation keys in sync between the code
  that mutates and the live queries that read.
- A late-joining player gets current state from the next live-query run; there is no per-client replay
  buffer. On disconnect the session is dropped; Socket.IO reconnects and re-authenticates.
- The backend is the authority for shared state. Never trust the client for authorization.

## Development Rules

- Trace the full flow (client → socket/REST → resolver/route → storage) before changing anything.
- Do not assume a modern library is compatible with this old stack. Keep dependency upgrades in
  separate changes from feature work; never bundle a `package.json` bump into a functional change.
- Make small, verifiable changes; avoid rewriting whole modules without cause.
- Preserve compatibility with existing on-disk data and DB schema. Schema/data changes require a
  migration plus a backup strategy.
- Preserve both DM and player experiences; verify desktop and mobile layouts and LAN use; keep the
  app working without internet.
- Do not remove old functions before finding their consumers. Do not edit generated files.
- No secrets in code. Never expose DM-only data to players. Enforce permissions in BOTH frontend and
  backend. Realtime protocol changes must stay compatible across client and server.
- Every change must ship with a concrete way to validate it.

## Validation Checklist

- Type-check/build: `npm run build:backend` (tsc) and/or `npm run build`.
- Lint JS: `npm run eslint`. Tests: `npm run test`.
- Manual: run backend (`start:server:dev`) + frontend (`start:frontend:dev`); log in as DM at `/dm`
  and as a player at `/`; confirm the changed flow syncs in real time on a second client.
- Confirm no generated files or persisted user data were modified unintentionally.

## Known Technical Debt

- Mixed JS/TS; incomplete TypeScript migration (`server/*.js`, `src/*.js` remain).
- Passwords are compared in plaintext; the REST "token" is the password itself. Session role trusts
  the client-supplied `desiredRole` for DMs. See `docs/PROJECT_CURRENT_STATE.md` for security notes.
- Maps are stored on the filesystem and mirrored in memory (not SQLite) — a different consistency
  model than notes/uploads. Large `body-parser`/upload limits (50mb). Old pinned deps (React 17,
  Vite 2, Relay 10) constrain modernization.

## Documentation Index

- `docs/PROJECT_CURRENT_STATE.md` — detailed technical reference (architecture, subsystems, risks).
- `.claude/rules/` — path-scoped rules for `frontend`, `backend`, and `persistence`.
- `README.md` — end-user setup and feature overview (upstream-oriented).

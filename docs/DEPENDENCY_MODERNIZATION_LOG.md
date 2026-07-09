# Dependency Modernization Log

Sequential, category-by-category modernization of all direct dependencies and devDependencies,
targeting Node.js 24 while keeping the application functional after every category.
Baseline before this work: Node 24.17.0, npm 11.13.0, 18 suites / 140 tests / 4 snapshots green,
frontend + backend builds green, ESLint green (commit `850f48f`).
Safety branch: `backup/pre-dependency-modernization`.

Status values: `pending` (not attempted yet), `updated`, `kept` (deliberately not updated, reason
in Notes), `blocked` (newer version incompatible with the current stack, reason in Notes),
`removed` (proven unused).

## Inventory

| Categoria                        | Pacote                                         | Versão antiga    | Versão nova          | Status  | Observações                                                                                                                          |
| -------------------------------- | ---------------------------------------------- | ---------------- | -------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1 runtime/metadados              | engines.node                                   | (ausente)        | >=24 <25             | pending | package.json + .nvmrc + Dockerfile                                                                                                   |
| 1 runtime/metadados              | Dockerfile base image                          | node:16          | node:24              | pending | build + slim runtime stages                                                                                                          |
| 2 dev utils baixo risco          | prettier                                       | 2.4.1            | 3.x                  | pending | pin trailingComma es5 to avoid global reformat                                                                                       |
| 2 dev utils baixo risco          | husky                                          | 7.0.4            | 9.x                  | pending | v9 hook format migration                                                                                                             |
| 2 dev utils baixo risco          | lint-staged                                    | 11.2.6           | 17.x                 | pending | Node >= 20 required — ok                                                                                                             |
| 2 dev utils baixo risco          | patch-package                                  | 6.4.7            | 8.x                  | pending | patches/ must keep applying                                                                                                          |
| 2 dev utils baixo risco          | caxa                                           | 2.0.0            | 3.0.1                | pending | packaging tool; compile script not exercised in CI                                                                                   |
| 2 dev utils baixo risco          | ts-node-dev                                    | 1.1.8            | 2.0.0                | pending | dev server runner only                                                                                                               |
| 2 dev utils baixo risco          | cross-env                                      | 7.0.3            | —                    | pending | not referenced in scripts; removal candidate (Phase 18)                                                                              |
| 3 TypeScript/tipos               | typescript                                     | 4.4.4            | 5.x                  | pending | TS 7 (native) exists; too large a jump for this legacy code — evaluate                                                               |
| 3 TypeScript/tipos               | @types/node                                    | 14.18.1          | 24.x                 | pending | match Node 24                                                                                                                        |
| 3 TypeScript/tipos               | @types/express                                 | 4.17.13          | 4.17.x               | pending | Express stays v4 (see cat 6)                                                                                                         |
| 3 TypeScript/tipos               | @types/lodash                                  | 4.14.178         | 4.17.x               | pending |                                                                                                                                      |
| 3 TypeScript/tipos               | @types/fs-extra                                | 9.0.13           | 11.x                 | pending | with fs-extra 11 (cat 8)                                                                                                             |
| 3 TypeScript/tipos               | @types/sanitize-html                           | 2.3.2            | 2.16.x               | pending |                                                                                                                                      |
| 3 TypeScript/tipos               | @types/showdown                                | 1.9.4            | 1.9.x latest         | pending | showdown pinned by react-showdown (cat 16)                                                                                           |
| 3 TypeScript/tipos               | @types/sqlite3                                 | 3.1.8            | 3.1.11               | pending |                                                                                                                                      |
| 3 TypeScript/tipos               | @types/unzipper                                | 0.10.4           | 0.10.11              | pending |                                                                                                                                      |
| 3 TypeScript/tipos               | @types/connect-busboy                          | 0.0.4            | 1.0.x                | pending | with connect-busboy 1 (cat 9)                                                                                                        |
| 3 TypeScript/tipos               | @types/howler                                  | 2.2.4            | 2.2.13               | pending |                                                                                                                                      |
| 3 TypeScript/tipos               | @types/body-scroll-lock                        | 3.1.0            | 3.1.2                | pending |                                                                                                                                      |
| 3 TypeScript/tipos               | @types/react                                   | 17.0.37          | 17.0.x latest        | pending | React stays 17 (cat 12 blocked)                                                                                                      |
| 3 TypeScript/tipos               | @types/react-dom                               | 17.0.11          | 17.0.x latest        | pending | idem                                                                                                                                 |
| 3 TypeScript/tipos               | @types/three                                   | 0.126.2          | —                    | blocked | three pinned by map stack (cat 15)                                                                                                   |
| 3 TypeScript/tipos               | @types/react-relay                             | 7.0.19           | —                    | blocked | Relay pinned (cat 16)                                                                                                                |
| 3 TypeScript/tipos               | @types/relay-runtime                           | 10.1.10          | —                    | blocked | Relay pinned (cat 16)                                                                                                                |
| 3 TypeScript/tipos               | @types/jest                                    | 27.0.2           | 30.x                 | pending | with Jest 30 (cat 4)                                                                                                                 |
| 4 Jest/Babel/testes              | jest                                           | 27.3.1           | 30.x                 | pending | 27→28→29→30; jsdom split off core                                                                                                    |
| 4 Jest/Babel/testes              | babel-jest                                     | 27.3.1           | 30.x                 | pending |                                                                                                                                      |
| 4 Jest/Babel/testes              | @babel/core                                    | 7.15.8           | 7.x latest           | pending | Babel 8 exists; stay on 7 latest (relay/macros compat)                                                                               |
| 4 Jest/Babel/testes              | @babel/preset-env                              | 7.15.8           | 7.x latest           | pending |                                                                                                                                      |
| 4 Jest/Babel/testes              | @babel/preset-typescript                       | 7.15.0           | 7.x latest           | pending |                                                                                                                                      |
| 5 ESLint/qualidade               | eslint                                         | 7.32.0           | 8.x/9.x              | pending | eslint-plugin-react-app (dead, CRA-era) constrains; evaluate                                                                         |
| 5 ESLint/qualidade               | eslint-config-prettier                         | 8.3.0            | latest compatible    | pending |                                                                                                                                      |
| 5 ESLint/qualidade               | eslint-plugin-react-app                        | 6.2.2            | —                    | pending | abandoned; may block ESLint 9+ flat config                                                                                           |
| 5 ESLint/qualidade               | babel-eslint                                   | 10.1.0           | @babel/eslint-parser | pending | babel-eslint is deprecated                                                                                                           |
| 6 backend HTTP                   | express                                        | 4.17.1           | 4.21.x               | pending | Express 5 deferred: `(*)` route patterns in graphql.ts/map routes break under path-to-regexp v6+                                     |
| 6 backend HTTP                   | body-parser                                    | 1.19.0           | 1.20.x               | pending | v2 belongs to Express 5 era                                                                                                          |
| 6 backend HTTP                   | morgan                                         | 1.10.0           | 1.11.x               | pending |                                                                                                                                      |
| 6 backend HTTP                   | serve-favicon                                  | 2.5.0            | 2.5.1                | pending |                                                                                                                                      |
| 7 SQLite/nativas                 | sqlite3                                        | 5.0.2            | 6.x                  | pending | prebuilds for Node 24 ABI                                                                                                            |
| 7 SQLite/nativas                 | sqlite                                         | 4.0.23           | 5.x                  | pending | wrapper; API compat to verify                                                                                                        |
| 8 uploads/filesystem             | connect-busboy                                 | 0.0.2            | 1.0.0                | pending | busboy 1 changed file-event signature — code change in routes                                                                        |
| 8 uploads/filesystem             | fs-extra                                       | 9.1.0            | 11.x                 | pending | CJS still supported                                                                                                                  |
| 8 uploads/filesystem             | junk                                           | 3.1.0            | —                    | blocked | junk 4 is ESM-only; server compiles to CJS                                                                                           |
| 8 uploads/filesystem             | unzipper                                       | 0.10.11          | 0.12.x               | pending | used by note import                                                                                                                  |
| 9 Socket.IO                      | socket.io                                      | 4.4.0            | 4.8.x                | pending | same major                                                                                                                           |
| 9 Socket.IO                      | socket.io-client                               | 4.4.0            | 4.8.x                | pending | keep in lockstep                                                                                                                     |
| 10 GraphQL server/live           | graphql                                        | 15.6.1           | 15.8.x / 16.x        | pending | 16 only if gqtx + @n1ru4l peers allow                                                                                                |
| 10 GraphQL server/live           | gqtx                                           | 0.8.1-e6f907e5.0 | 0.8.1 stable         | pending | 0.9 is an API rewrite — evaluate; prerelease must go                                                                                 |
| 10 GraphQL server/live           | @graphql-yoga/subscription                     | 0.0.2-canary     | stable               | pending | canary must go if a compatible stable exists                                                                                         |
| 10 GraphQL server/live           | @n1ru4l/graphql-live-query                     | 0.9.0            | 0.10.0               | pending | family updated together                                                                                                              |
| 10 GraphQL server/live           | @n1ru4l/graphql-live-query-patch-jsondiffpatch | 0.7.0            | 0.8.0                | pending |                                                                                                                                      |
| 10 GraphQL server/live           | @n1ru4l/in-memory-live-query-store             | 0.8.0            | 0.10.0               | pending |                                                                                                                                      |
| 10 GraphQL server/live           | @n1ru4l/push-pull-async-iterable-iterator      | 3.1.0            | 3.2.0                | pending |                                                                                                                                      |
| 10 GraphQL server/live           | @n1ru4l/socket-io-graphql-server               | 0.12.0           | 0.13.0               | pending |                                                                                                                                      |
| 10 GraphQL server/live           | @n1ru4l/socket-io-graphql-client               | 0.11.1           | 0.13.0               | pending | frontend side of same protocol                                                                                                       |
| 11 Vite/build frontend           | vite                                           | 2.7.3            | evaluate (8.x)       | pending | needs @vitejs/plugin-react swap; high effort                                                                                         |
| 11 Vite/build frontend           | @vitejs/plugin-react-refresh                   | 1.3.6            | @vitejs/plugin-react | pending | deprecated plugin                                                                                                                    |
| 11 Vite/build frontend           | vite-plugin-babel-macros                       | 1.0.5            | 1.0.6                | pending | relay macro support                                                                                                                  |
| 11 Vite/build frontend           | postcss                                        | 8.4.5            | 8.5.x                | pending |                                                                                                                                      |
| 12 React                         | react                                          | 17.0.2           | —                    | blocked | React 18+ requires @react-three/fiber 8+ (rename/API rewrite), relay-hooks/react-relay modern, Chakra 2+ — dedicated migration tasks |
| 12 React                         | react-dom                                      | 17.0.2           | —                    | blocked | idem                                                                                                                                 |
| 13 Chakra/Emotion/UI             | @chakra-ui/react                               | 1.7.3            | —                    | blocked | v2 requires React 18; v3 is a full API rewrite                                                                                       |
| 13 Chakra/Emotion/UI             | @emotion/react                                 | 11.7.1           | 11.14.x              | pending | patch/minor safe                                                                                                                     |
| 13 Chakra/Emotion/UI             | @emotion/styled                                | 11.3.0           | 11.14.x              | pending |                                                                                                                                      |
| 13 Chakra/Emotion/UI             | @emotion/sheet                                 | 1.1.0            | 1.4.x                | pending |                                                                                                                                      |
| 13 Chakra/Emotion/UI             | framer-motion                                  | 4.1.17           | —                    | blocked | Chakra 1.7 peer requires ^4                                                                                                          |
| 13 Chakra/Emotion/UI             | react-focus-lock                               | 2.5.2            | 2.13.x               | pending |                                                                                                                                      |
| 13 Chakra/Emotion/UI             | body-scroll-lock                               | 3.1.5            | 3.1.5                | kept    | 4.x is beta only                                                                                                                     |
| 13 Chakra/Emotion/UI             | react-colorful                                 | 5.5.0            | 5.7.0                | pending |                                                                                                                                      |
| 13 Chakra/Emotion/UI             | react-easy-crop                                | 3.5.3            | evaluate             | pending | 4.x supports React 17? verify                                                                                                        |
| 13 Chakra/Emotion/UI             | react-virtuoso                                 | 2.3.1            | 2.x latest           | pending | 4.x requires React 18                                                                                                                |
| 13 Chakra/Emotion/UI             | polished                                       | 4.1.3            | 4.3.1                | pending |                                                                                                                                      |
| 14 Three/mapa                    | three                                          | 0.126.1          | —                    | blocked | pinned by react-three-fiber 5 + three-stdlib 1 + troika 0.40                                                                         |
| 14 Three/mapa                    | react-three-fiber                              | 5.3.22           | —                    | blocked | package renamed @react-three/fiber; v8+ requires React 18                                                                            |
| 14 Three/mapa                    | three-stdlib                                   | 1.1.3            | —                    | blocked | must move with three                                                                                                                 |
| 14 Three/mapa                    | troika-three-text                              | 0.40.0           | —                    | blocked | must move with three                                                                                                                 |
| 14 Three/mapa                    | react-spring                                   | 9.0.0-rc.3       | —                    | blocked | stable 9.x changes API surface used with r3f 5; migrate with map stack                                                               |
| 14 Three/mapa                    | react-use-gesture                              | 9.1.3            | —                    | blocked | renamed @use-gesture/react; migrate with map stack                                                                                   |
| 14 Three/mapa                    | react-use-measure                              | 2.0.4            | 2.1.x                | pending | standalone, low risk                                                                                                                 |
| 14 Three/mapa                    | leva                                           | 0.9.14           | —                    | blocked | depends on react-spring/three ecosystem                                                                                              |
| 15 Relay/GraphQL client          | react-relay                                    | 10.1.3           | —                    | blocked | modern Relay requires React 18 + compiler rewrite                                                                                    |
| 15 Relay/GraphQL client          | relay-runtime                                  | 10.1.3           | —                    | blocked | idem                                                                                                                                 |
| 15 Relay/GraphQL client          | relay-compiler                                 | 10.1.3           | —                    | blocked | v13+ is Rust compiler, drops language plugin                                                                                         |
| 15 Relay/GraphQL client          | relay-compiler-language-typescript             | 13.0.10          | —                    | blocked | abandoned; unnecessary under modern Relay                                                                                            |
| 15 Relay/GraphQL client          | relay-config                                   | 10.1.3           | —                    | blocked | tied to compiler                                                                                                                     |
| 15 Relay/GraphQL client          | relay-hooks                                    | 4.2.0            | —                    | blocked | tied to runtime                                                                                                                      |
| 15 Relay/GraphQL client          | babel-plugin-relay                             | 10.1.3           | —                    | blocked | tied to compiler version                                                                                                             |
| 16 estado/utils frontend+backend | zustand                                        | 3.5.13           | 4.x                  | pending | v5 requires React 18                                                                                                                 |
| 16 estado/utils                  | lodash                                         | 4.17.21          | 4.18.x               | pending |                                                                                                                                      |
| 16 estado/utils                  | fp-ts                                          | 2.11.5           | 2.16.x               | pending |                                                                                                                                      |
| 16 estado/utils                  | io-ts                                          | 2.2.16           | 2.2.22               | pending |                                                                                                                                      |
| 16 estado/utils                  | liquidjs                                       | 9.30.0           | 10.x                 | pending | backend chat templates; check API                                                                                                    |
| 16 estado/utils                  | sanitize-html                                  | 2.5.2            | 2.17.x               | pending |                                                                                                                                      |
| 16 estado/utils                  | showdown                                       | 1.9.1            | 1.9.1                | kept    | react-showdown 2.3.1 bundles showdown ^1.9                                                                                           |
| 16 estado/utils                  | react-showdown                                 | 2.3.1            | 2.3.x                | kept    | latest 2.x already                                                                                                                   |
| 16 estado/utils                  | monaco-editor                                  | 0.31.1           | evaluate             | pending | copied by scripts/copy-monaco-editor-files.js                                                                                        |
| 16 estado/utils                  | @monaco-editor/react                           | 4.3.1            | 4.7.0                | pending |                                                                                                                                      |
| 16 estado/utils                  | use-sound                                      | 3.0.1            | evaluate             | pending | check React 17 peer                                                                                                                  |
| 16 estado/utils                  | @airjp73/dice-notation                         | 2.2.2            | latest 2.x           | pending | dice engine — covered by tests                                                                                                       |
| 16 estado/utils                  | @n1ru4l/use-async-effect                       | 1.3.1            | 1.4.0                | pending |                                                                                                                                      |
| 16 estado/utils                  | htmlparser2                                    | 6.1.0            | evaluate             | pending | used by user-style-sheet processing                                                                                                  |
| 16 estado/utils                  | domhandler                                     | 4.2.2            | evaluate             | pending | must match htmlparser2                                                                                                               |
| 16 estado/utils                  | parse-color                                    | 1.0.0            | 1.0.0                | kept    | no newer release                                                                                                                     |
| 16 estado/utils                  | fast-sha256                                    | 1.3.0            | 1.3.0                | kept    | no newer release                                                                                                                     |
| 17 limpeza/auditoria             | npm dedupe / audit                             | —                | —                    | pending | final phase                                                                                                                          |

## Category log

### Phase 0 — audit (done)

- Branch `modernization/node-24`, clean tree, shutdown fix already committed (`850f48f`).
- Baseline re-validated: 18 suites / 140 tests / 4 snapshots green.
- Created `backup/pre-dependency-modernization`.

(Entries appended below as each category completes.)

### Phase 2 — Node 24 runtime (done)

- `package.json`: added `engines` (`node >=24 <25`, `npm >=10`); created `.nvmrc` (24).
- `Dockerfile`: `node:16` -> `node:24`, `node:16-slim` -> `node:24-slim`.
- `package-lock.json` re-synced by npm 11 (lockfileVersion upgrade).
- Validation: install OK, 18/140/4 green, build OK, lint OK.
- Docker 29.6.1 available; full `docker build` deferred to final validation (Phase 20) to avoid
  a ~10 min build per phase.

### Phase 3 — low-risk dev utilities (done)

- prettier 2.4.1 -> 3.9.5 (`.prettierrc` pins `trailingComma: "es5"` to avoid a global reformat).
- husky 7.0.4 -> 9.1.7 (`prepare: husky`; `.husky/pre-commit` migrated to v9 format).
- lint-staged 11.2.6 -> 17.0.8; patch-package 6.4.7 -> 8.0.1 (all 4 patches still apply);
  caxa 2.0.0 -> 3.0.1 (npm-deprecated/abandoned — `compile` scripts not exercised here);
  ts-node-dev 1.1.8 -> 2.0.0.
- cross-env: unused (no script references) — removal deferred to Phase 18.
- Validation: 18/140/4 green, build OK, lint OK.

### Phase 4 — TypeScript and types (BLOCKED, documented)

- Empirical bisect: typescript 5.9.3 crashes `relay-compiler-language-typescript` 13
  ("Unhandled SyntaxKind"); 4.9.5 same; 4.7.4 and 4.6.4 silently emit CORRUPTED relay artifacts
  (`import { FragmentRefs as  }` — empty alias). Only 4.4.x produces correct artifacts.
- The plugin is abandoned, patched locally (patches/) and pinned by relay-compiler 10 — TypeScript
  is therefore hard-capped at 4.4.4 until the Relay stack migration (Phase 15/16).
- Modern @types (node 24, lodash 4.17, express 4.17.23 et al.) use d.ts syntax TS 4.4 cannot parse
  (1450 TS1005 errors) — the whole category moves together with TypeScript.
- Outcome: all category-3 packages reverted to original pins; artifacts regenerated identical;
  build/lint green; upload-suite flake re-confirmed as legacy defect #11 (passes in isolation).

### Phase 5 — Jest and Babel (done)

- jest 27.3.1 -> 30.4.2; babel-jest 27.3.1 -> 30.4.2; @babel/core 7.15.8 -> 7.29.7;
  @babel/preset-env -> 7.28.x; @babel/preset-typescript -> 7.27.x (Babel stays on 7 — Babel 8 is
  incompatible with the pinned relay/babel-macros toolchain).
- @types/jest kept at 27: tsc auto-includes @types and jest-30 d.ts does not parse under the
  TS 4.4 cap (Phase 4); tests are transformed by babel-jest (no type-check), so no runtime impact.
- 3 inline snapshots re-recorded after review: only the documented Jest 29 default snapshot-format
  change (`Object {`/`Array [` -> `{`/`[`, printBasicPrototype:false); values identical.
- Validation: 18/140/4 green (also with --detectOpenHandles), build OK, lint OK.

### Phase 6 — ESLint (partially done, core BLOCKED)

- eslint-config-prettier 8.3.0 -> 9.x (supports ESLint >= 7).
- eslint core BLOCKED at 7.32.0: `eslint-plugin-react-app` 6.2.2 (abandoned CRA-era bundle) loads
  eslint-plugin-flowtype which deep-requires `eslint/lib/rules/*`, removed from ESLint 8 package
  exports (`ERR_PACKAGE_PATH_NOT_EXPORTED`, reproduced). ESLint 9/10 additionally require flat
  config. Unblocking requires replacing the plugin (ruleset change) — separate decision task.
- babel-eslint kept (used internally by the bundled react-app config).
- Validation: lint green (--max-warnings 0), 18/140 tests green, build green.

### Phase 7 — backend HTTP (done)

- express 4.17.1 -> 4.22.2; body-parser 1.19.0 -> 1.20.x; morgan 1.10.0 -> 1.11.x;
  serve-favicon 2.5.0 -> 2.5.1.
- Express 5 deliberately deferred: the `(*)` route patterns (e.g. `PUT /files/(*)` in
  routes/graphql.ts) are invalid under Express 5's path-to-regexp and auth/role middleware would
  need re-verification — separate migration task.
- Smoke coverage: baseline suites exercise /api/auth, active-map, uploads, role gates, shutdown.
- Validation: 18/140 green, build OK, lint OK.

### Phase 8 — SQLite and native deps (done)

- sqlite3 5.0.2 -> 6.x (Node-API prebuilds — no node-gyp compile needed on Node 24);
  sqlite (wrapper) 4.0.23 -> 5.x.
- Migration behavior re-verified by baseline suites: fresh-dir creation, PRAGMA user_version=4,
  idempotent reopen, data preserved, legacy notes import, prepared statements, clean close.
- No schema change. Existing db.sqlite files remain compatible (migrations untouched).
- Validation: 18/140 green, backend tsc green, lint green.

### Phase 9 — uploads and filesystem (done)

- connect-busboy 0.0.2 -> 1.0.0 (+ @types 1.0.3): busboy 1 file-event signature adapted in
  routes/files.js, routes/map.js, routes/notes.ts (`info.filename`).
- fs-extra 9.1.0 -> 11.x (+ @types 11); unzipper 0.10.11 -> 0.12.x (note import re-verified).
- junk kept at 3.1.0: v4 is ESM-only, server compiles to CJS (blocked until ESM migration).
- Legacy defect #4 FIXED as a side effect of busboy 1 + finish-handler guard: multipart without a
  file now answers 422 deterministically; baseline test updated to assert the correct behavior.
- Legacy defect #11 (staging write race -> intermittent 500) FIXED at the root: all four upload
  finish handlers now wait for the staging write stream to close before consuming the file.
  Regression: upload suite passed 6/6 consecutive runs (previously flaky).
- Validation: 18/140/4 green, build OK, lint OK.

### Phase 10 — Socket.IO (done, capped at 4.7.5)

- socket.io + socket.io-client 4.4.0 -> 4.7.5 (exact pins, lockstep).
- 4.8.x BLOCKED: its bundled engine.io 6.6 ships d.ts using TS 4.5+ syntax that TS 4.4 cannot
  parse (`error TS1005` in engine.io/build/server.d.ts) — unlocks together with the TS cap
  (Phase 4 -> Relay migration).
- Realtime verified: connection, authenticate/reject, role sessions, live-query invalidation,
  multi-client update, late join, clean shutdown (17 focused tests + full suite green).
- Validation: 18/140/4 green, build OK, lint OK.

### Phase 11 — GraphQL server and live queries (done)

- graphql 15.6.1 -> 15.10.x (graphql 16 BLOCKED by relay-compiler 10 peer range).
- gqtx 0.8.1-e6f907e5.0 (prerelease) -> 0.8.1 stable. Stable types `fields` as non-empty tuples —
  type-level tuple casts added in server/graphql/index.ts (no runtime change; 140 tests prove it).
- @graphql-yoga/subscription 0.0.2-canary -> 5.x stable (createPubSub API unchanged).
- @n1ru4l family: graphql-live-query 0.10, in-memory-live-query-store 0.10 (API change:
  `liveQueryStore.execute` -> `makeExecute(execute)` adapted in routes/graphql.ts),
  live-query-patch-jsondiffpatch 0.8 (server+client+test helper in lockstep),
  socket-io-graphql-server 0.13, socket-io-graphql-client 0.13, push-pull 3.2.
- scripts/write-graphql-schema.ts adapted: prettier 3 format() is async.
- type-definitions.graphql regenerated: 2-line diff is prettier-3 SDL union formatting only
  (leading-pipe style); union members and schema semantics identical.
- Validation: 18/140/4 green (live query invalidation, late join, roles, 2-client update),
  write-schema green, build OK, lint OK.

### Phase 12 — Vite (done, capped at 4.x)

- vite 2.7.3 -> 4.5.x; @vitejs/plugin-react-refresh (deprecated) replaced by
  @vitejs/plugin-react 4.x; vite-plugin-babel-macros -> 1.0.6; vite.config.ts adapted.
- Vite 5/6/7/8 BLOCKED: they declare a peer on @types/node >=18/20, which is pinned at 14 by the
  TS 4.4 cap (Phase 4 -> Relay). Unlocks with the Relay/TS migration.
- Build verified: index.html generated with hashed assets, 16 chunks, monaco 0.31.1 copied,
  relay artifacts compiled; chunk-size warning is pre-existing.
- Vite DEV server (port 4000 proxy) not exercised here — added to manual checklist.
- Validation: 18/140/4 green, backend tsc green, lint green.

### Phase 13 — React core (BLOCKED, documented)

- react/react-dom 17.0.2 are already the latest 17.x releases.
- React 18/19 BLOCKED by hard peer/API coupling: react-three-fiber 5 (renamed to
  @react-three/fiber, v8+ requires React 18 and a map-stack API migration), relay-hooks 4 /
  react-relay 10 (modern Relay requires React 18 + Rust compiler migration), @chakra-ui/react 1
  (v2 requires React 18; v3 is an API rewrite). Requires a dedicated migration epic
  (Relay -> React -> Chakra -> Three, in that order).

### Phase 14 — Chakra/Emotion/UI components (partial)

- Updated (safe satellites compatible with Chakra 1 + React 17): @emotion/react + @emotion/styled
  11.14.x, @emotion/sheet 1.4.x, react-focus-lock 2.13.x, react-colorful 5.7, polished 4.3,
  react-virtuoso 2.x latest.
- BLOCKED: @chakra-ui/react 1.7.3 (v2 needs React 18, v3 is an API rewrite); framer-motion 4
  (Chakra 1 peer ^4); body-scroll-lock 3.1.5 (4.x is beta-only); react-easy-crop kept (newer
  majors target React 18 era; UI cropper has no automated coverage).
- No redesign; visual behavior must be spot-checked manually (DM + player UIs).
- Validation: frontend build green, 18/140 green, lint green.

### Phase 15 — Three.js map stack (BLOCKED, documented)

- three 0.126.1, react-three-fiber 5.3.22 (pre-rename), three-stdlib 1.1.3, troika-three-text
  0.40.0, react-spring 9.0.0-rc.3 (patched), react-use-gesture 9.1.3, leva 0.9.14: one coupled
  cluster pinned to React 17 + the patched react-spring RC. Upgrading means migrating to
  @react-three/fiber 8+/@use-gesture/react/react-spring stable — the map-rendering migration epic.
- Only react-use-measure 2.0.4 -> 2.1.x updated (standalone, React 17 compatible).

### Phase 16 — Relay / GraphQL client (BLOCKED, documented)

- react-relay / relay-runtime / relay-compiler / relay-config / babel-plugin-relay 10.1.3,
  relay-hooks 4.2.0, relay-compiler-language-typescript 13.0.10 (abandoned; locally patched):
  the whole cluster is pinned. Modern Relay (13+) replaces the JS compiler with the Rust compiler
  (no language plugin, new config format, artifact changes) and requires React 18.
- This is the keystone blocker: it caps TypeScript at 4.4 (Phase 4), which in turn caps
  @types/*, Jest types, socket.io 4.8, Vite 5+ and graphql 16. Recommended as the FIRST
  migration epic after this dependency pass.
- relay-compiler and the TS plugin have local patches (patches/) that keep applying (verified).

### Phase 17 — state and remaining utilities (done)

- Runtime: lodash 4.18, fp-ts 2.16, io-ts 2.2.22, sanitize-html 2.17, liquidjs 9.30 -> 10.x
  (chat templating; Liquid/LiquidError API unchanged — chat liquid path has weak automated
  coverage, added to manual checklist).
- Frontend/dev: zustand 3 -> 4.5 (default `create` import still supported), @monaco-editor/react
  4.7 (loader-based; local monaco copy stays 0.31), @airjp73/dice-notation 2.x latest (dice specs
  green), @n1ru4l/use-async-effect 1.4, htmlparser2 6 -> 9 + domhandler 5 (style-sheet specs +
  snapshots green).
- Kept: use-sound 3.0.1 (locally patched), showdown 1.9.1 + react-showdown 2.3.1 (lockstep),
  monaco-editor 0.31.1 (copy script + VITE_MONACO_VERSION coupling; editor has no automated
  coverage), parse-color/fast-sha256 (no newer releases), leva 0.9.14 (react-spring cluster).
- Validation: 18/140/4 green, full build green, lint green.

---
paths:
  - "server/**/*.{js,ts,graphql}"
---

# Backend Rules

- Boot path: `server/index.ts` → `server/server.js` (`bootstrapServer`). Wire new services there and
  inject them into the GraphQL context via `server/routes/graphql.ts`.
- GraphQL is served over Socket.IO (path `/api/socket.io`), not HTTP. Add fields inside
  `server/graphql/modules/*` and aggregate in `server/graphql/index.ts`. After schema changes run
  `npm run write-schema` / `npm run relay-compiler`; never hand-edit `type-definitions.graphql`.
- Realtime updates use live queries: after mutating shared state, invalidate the matching query key
  (`emitter.emit("invalidate", ...)` or `liveQueryStore.invalidate(...)`). Keep invalidation keys in
  sync with the queries that read them.
- Enforce authorization on the server for every DM-only action: REST via `roleMiddleware.dm/pc`,
  GraphQL via `requireAdmin`/`requireAuth` (`server/auth.ts`). Never rely on the client.
- Do not weaken upload safety: reject paths containing `..`, require a registered upload id, and keep
  files under the data directory. Respect the 50mb body limit.
- Preserve the map task-processor: map/fog mutations must go through the serialized processor in
  `maps.ts`, not direct concurrent writes.
- No secrets in code. Never log or return DM-only data to player/unauthenticated sessions.

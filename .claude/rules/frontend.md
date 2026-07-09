---
paths:
  - "src/**/*.{js,jsx,ts,tsx,graphql}"
---

# Frontend Rules

- Entry is `src/index.tsx`; `/dm` loads `src/dm-area/dm-area.tsx`, `/` loads `src/player-area.tsx`.
  Route by pathname — do not add a router library without a clear need.
- Server data comes through Relay over Socket.IO (`src/relay-environment.ts`, `src/socket.ts`). Use
  Relay hooks/fragments and `@live` queries; do not add a parallel HTTP GraphQL client.
- After changing any GraphQL literal, run `npm run relay-compiler`. Never hand-edit
  `src/**/__generated__/` files.
- Map rendering is Three.js via `react-three-fiber` (`map-view.tsx`, `map-tools/*`). Keep map/token
  changes going through existing tools and the shared token state; do not mutate map state ad hoc.
- Stack is React 17 + Vite 2 + Chakra 1 + emotion + framer-motion 4 + zustand 3. Do not introduce
  APIs that require newer major versions without a coordinated upgrade.
- Enforce DM-vs-player UI separation: never render DM-only data (full fog, hidden tokens, DM notes)
  in the player area. Frontend checks are UX only — the backend is the authority.
- Verify both desktop and mobile layouts and a second connected client for realtime sync.

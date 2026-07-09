/**
 * Baseline P0.7 / P1.1 — Live query invalidation and late-joining clients.
 *
 * Real integration over Socket.IO: a client runs `activeMap @live`, the DM
 * changes the active map through REST (`POST /api/active-map` emits
 * `invalidate "Query.activeMap"`), and the client receives a patched result.
 * The very first emission also proves the late-join contract: a client that
 * connects after the state was created receives the current state without
 * needing any previous event.
 */
import type { Socket } from "socket.io-client";
import { createTestRoot, TestRoot } from "./test-helpers/create-test-root";
import { startTestServer, TestServer } from "./test-helpers/start-test-server";
import { sendJson } from "./test-helpers/http-client";
import { createMapFixture } from "./test-helpers/fixtures";
import {
  connectTestSocket,
  authenticateSocket,
  createGraphQLTestClient,
} from "./test-helpers/socket-graphql";

jest.setTimeout(30000);

const ACTIVE_MAP_LIVE_QUERY = /* GraphQL */ `
  query liveQuerySpecActiveMap @live {
    activeMap {
      id
      title
    }
  }
`;

let root: TestRoot;
let server: TestServer | null = null;
let sockets: Array<Socket> = [];

beforeEach(async () => {
  root = await createTestRoot();
  await createMapFixture(root.dataDirectory, { id: "map-a", title: "Map A" });
  await createMapFixture(root.dataDirectory, { id: "map-b", title: "Map B" });
  // Public access (no passwords) keeps the socket handshake simple; the
  // authorization rules themselves are covered by the authorization spec.
  server = await startTestServer({ root });
});

afterEach(async () => {
  for (const socket of sockets) {
    socket.close();
  }
  sockets = [];
  if (server) {
    await server.close();
    server = null;
  }
  await root.cleanup();
});

const connectPlayerClient = async () => {
  const socket = await connectTestSocket(server!.baseUrl);
  sockets.push(socket);
  await authenticateSocket(socket, { desiredRole: "user" });
  return createGraphQLTestClient(socket);
};

test("a late-joining client receives the current active map as the first live emission", async () => {
  // State exists BEFORE the client connects.
  await sendJson({
    baseUrl: server!.baseUrl,
    path: "/api/active-map",
    body: { mapId: "map-a" },
  });

  const client = connectPlayerClient();
  const live = (await client).executeLive({
    operation: ACTIVE_MAP_LIVE_QUERY,
  });

  await live.waitForValueCount(1);
  expect(live.values[0].errors).toBeUndefined();
  expect(live.values[0].data?.activeMap).toMatchObject({ title: "Map A" });
  live.stop();
});

test("POST /api/active-map invalidates Query.activeMap and pushes the update to live clients", async () => {
  await sendJson({
    baseUrl: server!.baseUrl,
    path: "/api/active-map",
    body: { mapId: "map-a" },
  });

  const client = await connectPlayerClient();
  const live = client.executeLive({ operation: ACTIVE_MAP_LIVE_QUERY });
  await live.waitForValueCount(1);

  // Track the invalidation events emitted while switching the map.
  const invalidations: Array<string> = [];
  const onInvalidate = (identifier: string) => invalidations.push(identifier);
  server!.emitter.on("invalidate", onInvalidate);

  const response = await sendJson({
    baseUrl: server!.baseUrl,
    path: "/api/active-map",
    body: { mapId: "map-b" },
  });
  expect(response.status).toBe(200);

  await live.waitForValueCount(2);
  server!.emitter.off("invalidate", onInvalidate);

  // The change was pushed with the expected invalidation key, exactly once.
  expect(invalidations).toEqual(["Query.activeMap"]);
  expect(live.values[1].data?.activeMap).toMatchObject({ title: "Map B" });

  live.stop();
});

test("two connected clients receive the same live update", async () => {
  await sendJson({
    baseUrl: server!.baseUrl,
    path: "/api/active-map",
    body: { mapId: "map-a" },
  });

  const clientOne = await connectPlayerClient();
  const clientTwo = await connectPlayerClient();
  const liveOne = clientOne.executeLive({ operation: ACTIVE_MAP_LIVE_QUERY });
  const liveTwo = clientTwo.executeLive({ operation: ACTIVE_MAP_LIVE_QUERY });
  await liveOne.waitForValueCount(1);
  await liveTwo.waitForValueCount(1);

  await sendJson({
    baseUrl: server!.baseUrl,
    path: "/api/active-map",
    body: { mapId: "map-b" },
  });

  await liveOne.waitForValueCount(2);
  await liveTwo.waitForValueCount(2);
  expect(liveOne.values[1].data?.activeMap).toMatchObject({ title: "Map B" });
  expect(liveTwo.values[1].data?.activeMap).toMatchObject({ title: "Map B" });

  liveOne.stop();
  liveTwo.stop();
});

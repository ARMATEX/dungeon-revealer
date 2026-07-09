/**
 * Baseline P0.5 — Server-side role authorization.
 *
 * Documents how the socket session role is derived in `server/server.js`
 * ("authenticate" handler) and enforced by `server/auth.ts`
 * (requireAdmin/requireAuth), plus the per-token REST permissions of
 * PATCH /api/map/:id/token/:tokenId.
 *
 * KNOWN SECURITY DEFECT: server-side role authorization — for clients that
 * present the DM password, the GraphQL session role is taken verbatim from
 * the client-supplied `desiredRole` instead of being decided by the server
 * (server/server.js, "authenticate" handler: `role === "DM" ? desiredRole :
 * "user"`). Clients with only the PC password can NOT escalate (they always
 * get "user"), which the tests below confirm. See docs/BASELINE_TEST_PLAN.md.
 */
import type { Socket } from "socket.io-client";
import { createTestRoot, TestRoot } from "./test-helpers/create-test-root";
import { startTestServer, TestServer } from "./test-helpers/start-test-server";
import { sendJson } from "./test-helpers/http-client";
import { createMapFixture } from "./test-helpers/fixtures";
import {
  connectTestSocket,
  authenticateSocket,
  expectNoEvent,
  createGraphQLTestClient,
} from "./test-helpers/socket-graphql";

jest.setTimeout(30000);

const DM_PASSWORD = "test-dm-secret";
const PC_PASSWORD = "test-pc-secret";
const MAP_ID = "fixture-map";

const ADMIN_ONLY_QUERY = /* GraphQL */ `
  query authorizationSpecAdminQuery {
    map(id: "${MAP_ID}") {
      id
      title
    }
  }
`;

const AUTH_ONLY_QUERY = /* GraphQL */ `
  query authorizationSpecAuthQuery {
    activeMap {
      id
      title
    }
  }
`;

let root: TestRoot;
let server: TestServer | null = null;
let sockets: Array<Socket> = [];

const openSocket = async () => {
  const socket = await connectTestSocket(server!.baseUrl);
  sockets.push(socket);
  return socket;
};

beforeEach(async () => {
  root = await createTestRoot();
  await createMapFixture(root.dataDirectory, {
    id: MAP_ID,
    title: "Authorization Fixture",
    tokens: [
      {
        id: "token-movable",
        x: 0,
        y: 0,
        radius: 25,
        color: "red",
        label: "M",
        isVisibleForPlayers: true,
        isMovableByPlayers: true,
        isLocked: false,
      },
      {
        id: "token-fixed",
        x: 10,
        y: 10,
        radius: 25,
        color: "blue",
        label: "F",
        isVisibleForPlayers: true,
        isMovableByPlayers: false,
        isLocked: false,
      },
      {
        id: "token-hidden",
        x: 20,
        y: 20,
        radius: 25,
        color: "black",
        label: "H",
        isVisibleForPlayers: false,
        isMovableByPlayers: false,
        isLocked: false,
      },
    ],
  });
  server = await startTestServer({
    root,
    dmPassword: DM_PASSWORD,
    pcPassword: PC_PASSWORD,
  });
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

describe("socket authentication and GraphQL role enforcement", () => {
  test("a wrong password gets no 'authenticated' confirmation (server stays silent)", async () => {
    const socket = await openSocket();
    socket.emit("authenticate", {
      password: "wrong-password",
      desiredRole: "admin",
    });
    await expectNoEvent(socket, "authenticated");
  });

  test("a PC-password client requesting desiredRole 'admin' is still only 'user'", async () => {
    const socket = await openSocket();
    // A malicious/buggy player client claims the admin role.
    await authenticateSocket(socket, {
      password: PC_PASSWORD,
      desiredRole: "admin",
    });

    const client = createGraphQLTestClient(socket);
    const adminResult = await client.execute({ operation: ADMIN_ONLY_QUERY });
    expect(adminResult.errors?.[0].message).toBe("Insufficient permissions.");
    expect(adminResult.data?.map ?? null).toBeNull();

    // Regular authenticated operations still work.
    const authResult = await client.execute({ operation: AUTH_ONLY_QUERY });
    expect(authResult.errors).toBeUndefined();
  });

  test("a DM-password client with desiredRole 'admin' can run admin operations", async () => {
    const socket = await openSocket();
    await authenticateSocket(socket, {
      password: DM_PASSWORD,
      desiredRole: "admin",
    });

    const client = createGraphQLTestClient(socket);
    const result = await client.execute({ operation: ADMIN_ONLY_QUERY });
    expect(result.errors).toBeUndefined();
    expect(result.data?.map).toMatchObject({ title: "Authorization Fixture" });
  });

  test("KNOWN DEFECT (documented): the DM session role is whatever the client sends as desiredRole", async () => {
    // The server does not decide the session role for DM-password clients:
    // it stores `desiredRole` verbatim. Sending "user" silently downgrades
    // the session, proving the role value originates from the client.
    const socket = await openSocket();
    await authenticateSocket(socket, {
      password: DM_PASSWORD,
      desiredRole: "user",
    });

    const client = createGraphQLTestClient(socket);
    const result = await client.execute({ operation: ADMIN_ONLY_QUERY });
    expect(result.errors?.[0].message).toBe("Insufficient permissions.");
  });

  test("KNOWN DEFECT (documented): omitting desiredRole stores an undefined role that still passes requireAuth", async () => {
    const socket = await openSocket();
    await authenticateSocket(socket, { password: DM_PASSWORD });

    const client = createGraphQLTestClient(socket);
    // requireAuth only rejects the literal role "unauthenticated", so the
    // undefined role slips through (current behavior).
    const authResult = await client.execute({ operation: AUTH_ONLY_QUERY });
    expect(authResult.errors).toBeUndefined();
    // requireAdmin checks role === "admin", so admin operations fail.
    const adminResult = await client.execute({ operation: ADMIN_ONLY_QUERY });
    expect(adminResult.errors?.[0].message).toBe("Insufficient permissions.");
  });

  test("re-authentication on the same connection is ignored (listeners are removed)", async () => {
    const socket = await openSocket();
    await authenticateSocket(socket, {
      password: PC_PASSWORD,
      desiredRole: "user",
    });

    // The 'authenticate' listener was removed by socket.removeAllListeners()
    // inside the first authenticate call, so a second attempt gets no reply.
    // Role changes therefore require a full reconnect (current behavior).
    socket.emit("authenticate", {
      password: DM_PASSWORD,
      desiredRole: "admin",
    });
    await expectNoEvent(socket, "authenticated");
  });
});

describe("REST token permissions (PATCH /api/map/:id/token/:tokenId)", () => {
  test("a player can move a token that is visible, unlocked and movable by players", async () => {
    const response = await sendJson({
      baseUrl: server!.baseUrl,
      path: `/api/map/${MAP_ID}/token/token-movable`,
      method: "PATCH",
      token: PC_PASSWORD,
      body: { x: 111, y: 222 },
    });
    expect(response.status).toBe(200);
    const token = response
      .json()
      .data.map.tokens.find((entry: any) => entry.id === "token-movable");
    expect(token).toMatchObject({ x: 111, y: 222 });
  });

  test("a player cannot move a non-movable token (silent no-op, still 200)", async () => {
    const response = await sendJson({
      baseUrl: server!.baseUrl,
      path: `/api/map/${MAP_ID}/token/token-fixed`,
      method: "PATCH",
      token: PC_PASSWORD,
      body: { x: 999, y: 999 },
    });
    // Current behavior: the request succeeds but no property is applied.
    expect(response.status).toBe(200);
    const token = response
      .json()
      .data.map.tokens.find((entry: any) => entry.id === "token-fixed");
    expect(token).toMatchObject({ x: 10, y: 10 });
  });

  test("a player cannot see or patch a token that is hidden from players", async () => {
    const response = await sendJson({
      baseUrl: server!.baseUrl,
      path: `/api/map/${MAP_ID}/token/token-hidden`,
      method: "PATCH",
      token: PC_PASSWORD,
      body: { x: 1, y: 1 },
    });
    expect(response.status).toBe(404);
    expect(response.json().error.code).toBe("ERR_TOKEN_DOES_NOT_EXIST");
  });

  test("player-supplied DM-only properties (label, color, ...) are ignored", async () => {
    const response = await sendJson({
      baseUrl: server!.baseUrl,
      path: `/api/map/${MAP_ID}/token/token-movable`,
      method: "PATCH",
      token: PC_PASSWORD,
      body: { x: 5, y: 5, label: "HACKED", color: "green", isLocked: true },
    });
    expect(response.status).toBe(200);
    const token = response
      .json()
      .data.map.tokens.find((entry: any) => entry.id === "token-movable");
    expect(token).toMatchObject({
      x: 5,
      y: 5,
      label: "M",
      color: "red",
      isLocked: false,
    });
  });

  test("the DM can update any token property", async () => {
    const response = await sendJson({
      baseUrl: server!.baseUrl,
      path: `/api/map/${MAP_ID}/token/token-fixed`,
      method: "PATCH",
      token: DM_PASSWORD,
      body: { x: 42, y: 43, label: "Z", isMovableByPlayers: true },
    });
    expect(response.status).toBe(200);
    const token = response
      .json()
      .data.map.tokens.find((entry: any) => entry.id === "token-fixed");
    expect(token).toMatchObject({
      x: 42,
      y: 43,
      label: "Z",
      isMovableByPlayers: true,
    });
  });

  test("KNOWN DEFECT (documented): patching a token on an unknown map crashes with 500 instead of 404", async () => {
    // routes/map.js reads `map.tokens` before the `!map` check, so an
    // unknown map id raises a TypeError that Express turns into a 500.
    const response = await sendJson({
      baseUrl: server!.baseUrl,
      path: `/api/map/does-not-exist/token/whatever`,
      method: "PATCH",
      token: DM_PASSWORD,
      body: { x: 1, y: 1 },
    });
    expect(response.status).toBe(500);
  });
});

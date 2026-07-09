/**
 * Baseline P0.8 — Clean shutdown.
 *
 * Closing the test server must terminate the HTTP listener, the Socket.IO
 * server, all open connections and the SQLite handle, leaving the temporary
 * directory removable and no open handles behind (validated additionally by
 * running Jest with --detectOpenHandles).
 */
import * as fs from "fs-extra";
import { createTestRoot, TestRoot } from "./test-helpers/create-test-root";
import { startTestServer, TestServer } from "./test-helpers/start-test-server";
import { getJson } from "./test-helpers/http-client";
import {
  connectTestSocket,
  authenticateSocket,
} from "./test-helpers/socket-graphql";

jest.setTimeout(20000);

let root: TestRoot;
let server: TestServer | null = null;

beforeEach(async () => {
  root = await createTestRoot();
});

afterEach(async () => {
  if (server) {
    await server.close();
    server = null;
  }
  await root.cleanup();
});

test("close() stops the HTTP server, disconnects sockets and closes the database", async () => {
  server = await startTestServer({ root });
  const { baseUrl, db } = server;

  // Active HTTP + WebSocket traffic before shutdown.
  const before = await getJson({ baseUrl, path: "/api/auth" });
  expect(before.status).toBe(200);
  const socket = await connectTestSocket(baseUrl);
  await authenticateSocket(socket, { desiredRole: "user" });

  const disconnected = new Promise<void>((resolve) => {
    socket.once("disconnect", () => resolve());
  });

  await server.close();
  server = null;

  // The connected socket client is dropped by the server.
  await disconnected;
  socket.close();

  // New connections are refused.
  await expect(getJson({ baseUrl, path: "/api/auth" })).rejects.toMatchObject({
    code: "ECONNREFUSED",
  });

  // The SQLite handle is really closed.
  await expect(db.get(`PRAGMA "user_version";`)).rejects.toThrow();
});

test("close() is idempotent and the data directory can be fully removed afterwards", async () => {
  server = await startTestServer({ root });

  await server.close();
  await server.close(); // second call must be a no-op
  server = null;

  await fs.remove(root.dataDirectory);
  expect(await fs.pathExists(root.dataDirectory)).toBe(false);
});

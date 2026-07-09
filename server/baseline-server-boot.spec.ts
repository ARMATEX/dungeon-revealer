/**
 * Baseline P0.1 — Server boot with an empty data directory.
 *
 * Protects the legacy startup contract: `bootstrapServer` must create the
 * whole persistence structure from scratch, apply all migrations, listen on a
 * dynamic port and shut down cleanly, all inside a disposable directory.
 */
import * as fs from "fs-extra";
import * as path from "path";
import { createTestRoot, TestRoot } from "./test-helpers/create-test-root";
import { startTestServer, TestServer } from "./test-helpers/start-test-server";
import { getJson } from "./test-helpers/http-client";

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

test("boots from an empty data directory and creates the expected structure", async () => {
  expect(await fs.pathExists(root.dataDirectory)).toBe(false);

  server = await startTestServer({ root });

  expect(await fs.pathExists(path.join(root.dataDirectory, "db.sqlite"))).toBe(
    true
  );
  expect(await fs.pathExists(path.join(root.dataDirectory, "maps"))).toBe(true);
  expect(await fs.pathExists(path.join(root.dataDirectory, "files"))).toBe(
    true
  );
  expect(
    await fs.pathExists(path.join(root.dataDirectory, "settings.json"))
  ).toBe(true);
});

test("applies all migrations on first boot (PRAGMA user_version = 4)", async () => {
  server = await startTestServer({ root });
  const result = await server.db.get(`PRAGMA "user_version";`);
  expect(result.user_version).toBe(4);
});

test("listens on a dynamic port and answers HTTP requests", async () => {
  server = await startTestServer({ root });
  expect(server.port).toBeGreaterThan(0);

  const response = await getJson({
    baseUrl: server.baseUrl,
    path: "/api/auth",
  });
  expect(response.status).toBe(200);
  // No passwords configured => everyone gets the DM role (documented legacy
  // behavior of getRole in server/server.js).
  expect(response.json()).toEqual({ data: { role: "DM" } });
});

test("shuts down cleanly and releases the temporary directory", async () => {
  server = await startTestServer({ root });
  const dataDirectory = root.dataDirectory;

  await server.close();
  server = null;

  // After closing the database and sockets, the directory must be removable
  // (this fails on Windows if any file handle leaked).
  await fs.remove(dataDirectory);
  expect(await fs.pathExists(dataDirectory)).toBe(false);
});

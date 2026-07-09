/**
 * Baseline P0.6 — Active map persistence across restarts.
 *
 * The active map id lives in <data>/settings.json (`Settings`) while map
 * content lives in <data>/maps/<id>/ and is mirrored in memory (`Maps`).
 * This suite proves the state survives a full server restart on the same
 * data directory and that disk, memory and API stay coherent.
 */
import * as fs from "fs-extra";
import * as path from "path";
import { createTestRoot, TestRoot } from "./test-helpers/create-test-root";
import { startTestServer, TestServer } from "./test-helpers/start-test-server";
import { getJson, sendJson } from "./test-helpers/http-client";
import { createMapFixture } from "./test-helpers/fixtures";

jest.setTimeout(30000);

const MAP_ID = "persistent-map";

let root: TestRoot;
let server: TestServer | null = null;

beforeEach(async () => {
  root = await createTestRoot();
  await createMapFixture(root.dataDirectory, {
    id: MAP_ID,
    title: "Persistent Map",
  });
});

afterEach(async () => {
  if (server) {
    await server.close();
    server = null;
  }
  await root.cleanup();
});

test("the active map survives a server restart on the same data directory", async () => {
  // --- First run: activate the map.
  server = await startTestServer({ root });

  const noActiveMap = await getJson({
    baseUrl: server.baseUrl,
    path: "/api/active-map",
  });
  expect(noActiveMap.json().data.activeMap).toBeNull();

  const activateResponse = await sendJson({
    baseUrl: server.baseUrl,
    path: "/api/active-map",
    body: { mapId: MAP_ID },
  });
  expect(activateResponse.status).toBe(200);
  expect(activateResponse.json().data.activeMapId).toBe(MAP_ID);

  // In-memory state is served immediately.
  const activeMap = await getJson({
    baseUrl: server.baseUrl,
    path: "/api/active-map",
  });
  expect(activeMap.json().data.activeMap).toMatchObject({
    id: MAP_ID,
    title: "Persistent Map",
  });

  // Disk state: settings.json contains the current map id.
  const settingsOnDisk = await fs.readJSON(
    path.join(root.dataDirectory, "settings.json")
  );
  expect(settingsOnDisk.currentMapId).toBe(MAP_ID);

  // --- Restart: same data directory, fresh process state.
  await server.close();
  server = await startTestServer({ root });

  const afterRestart = await getJson({
    baseUrl: server.baseUrl,
    path: "/api/active-map",
  });
  expect(afterRestart.status).toBe(200);
  expect(afterRestart.json().data.activeMap).toMatchObject({
    id: MAP_ID,
    title: "Persistent Map",
  });
});

test("map entities on disk are loaded into memory at boot with backfilled defaults", async () => {
  server = await startTestServer({ root });

  const response = await getJson({ baseUrl: server.baseUrl, path: "/api/map" });
  expect(response.status).toBe(200);
  const payload = response.json();
  expect(payload.data.currentMapId).toBeNull();
  expect(payload.data.maps).toHaveLength(1);
  expect(payload.data.maps[0]).toMatchObject({
    id: MAP_ID,
    title: "Persistent Map",
    mapPath: "map.png",
    showGrid: false,
    tokens: [],
  });
});

test("activating an unknown map id is accepted and served as a null active map (current behavior)", async () => {
  server = await startTestServer({ root });

  const response = await sendJson({
    baseUrl: server.baseUrl,
    path: "/api/active-map",
    body: { mapId: "ghost-map" },
  });
  // POST /api/active-map does not validate that the map exists.
  expect(response.status).toBe(200);

  const activeMap = await getJson({
    baseUrl: server.baseUrl,
    path: "/api/active-map",
  });
  expect(activeMap.json().data.activeMap).toBeNull();
});

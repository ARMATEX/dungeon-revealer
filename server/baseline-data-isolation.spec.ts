/**
 * Baseline P0.3 — Data isolation.
 *
 * Guarantees that a server booted with an explicit DATA_DIRECTORY writes
 * exclusively inside that directory: SQLite, maps, uploads and settings.
 * Also exercises (defensively, not offensively) the existing `..` guard of
 * the PUT /files/(*) upload endpoint.
 */
import * as fs from "fs-extra";
import * as path from "path";
import { createTestRoot, TestRoot } from "./test-helpers/create-test-root";
import { startTestServer, TestServer } from "./test-helpers/start-test-server";
import {
  httpRequest,
  uploadMultipartWithRetry,
} from "./test-helpers/http-client";
import { createMapFixture, TINY_PNG } from "./test-helpers/fixtures";

jest.setTimeout(20000);

// The default data directory the real app would use when DATA_DIRECTORY is
// not set (`getDefaultDataDirectory` resolves to <repo>/data). The tests
// must never create or touch it.
const realDefaultDataDirectory = path.resolve(__dirname, "..", "data");

let root: TestRoot;
let server: TestServer | null = null;
let defaultDataDirectoryExistedBefore = false;

beforeAll(async () => {
  defaultDataDirectoryExistedBefore = await fs.pathExists(
    realDefaultDataDirectory
  );
});

beforeEach(async () => {
  root = await createTestRoot();
});

afterEach(async () => {
  if (server) {
    await server.close();
    server = null;
  }
  await root.cleanup();
  // The real default data directory state must be unchanged by any test.
  expect(await fs.pathExists(realDefaultDataDirectory)).toBe(
    defaultDataDirectoryExistedBefore
  );
});

test("all persisted state lives inside the temporary data directory", async () => {
  await createMapFixture(root.dataDirectory, { id: "fixture-map" });
  server = await startTestServer({ root });

  // Upload one image so the files/ subdirectory receives content.
  const uploadResponse = await uploadMultipartWithRetry({
    baseUrl: server.baseUrl,
    path: "/api/images",
    files: [
      {
        fieldName: "file",
        fileName: "test-image.png",
        contentType: "image/png",
        data: TINY_PNG,
      },
    ],
  });
  expect(uploadResponse.status).toBe(200);
  const uploadedId = uploadResponse.json().data.item.id;

  // The data directory contains exactly the expected entries — nothing else.
  const entries = (await fs.readdir(root.dataDirectory)).sort();
  expect(entries).toEqual(["db.sqlite", "files", "maps", "settings.json"]);

  // The uploaded file is stored inside <data>/files.
  const storedFiles = await fs.readdir(path.join(root.dataDirectory, "files"));
  expect(storedFiles).toContain(`${uploadedId}.png`);

  // The fixture map folder is served from inside <data>/maps.
  const mapResponse = await httpRequest({
    baseUrl: server.baseUrl,
    path: "/api/map/fixture-map/map",
  });
  expect(mapResponse.status).toBe(200);
});

test("PUT /files rejects paths containing '..' and writes nothing outside files/", async () => {
  server = await startTestServer({ root });

  const entriesBefore = (await fs.readdir(root.rootDirectory)).sort();

  // URL-encoded traversal attempt ("token-image/../escape.png"). The route
  // throws "Invalid request." — surfaced as a 500 by Express (current
  // behavior; there is no dedicated 4xx handler for this).
  const response = await httpRequest({
    baseUrl: server.baseUrl,
    path: "/files/token-image/..%2Fescape.png",
    method: "PUT",
    body: TINY_PNG,
  });
  expect(response.status).toBe(500);

  // Nothing may have escaped the files directory.
  expect(
    await fs.pathExists(path.join(root.dataDirectory, "files", "escape.png"))
  ).toBe(false);
  expect(await fs.pathExists(path.join(root.dataDirectory, "escape.png"))).toBe(
    false
  );
  const entriesAfter = (await fs.readdir(root.rootDirectory)).sort();
  expect(entriesAfter).toEqual(entriesBefore);
});

test("uploads with an unregistered id are rejected (401) and not stored", async () => {
  server = await startTestServer({ root });

  const response = await httpRequest({
    baseUrl: server.baseUrl,
    path: "/files/token-image/not-registered.png",
    method: "PUT",
    body: TINY_PNG,
  });
  expect(response.status).toBe(401);

  expect(
    await fs.pathExists(
      path.join(
        root.dataDirectory,
        "files",
        "token-image",
        "not-registered.png"
      )
    )
  ).toBe(false);
});

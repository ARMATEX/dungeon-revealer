/**
 * Baseline P1.3 — File uploads (media library + guarded PUT endpoint).
 *
 * Covers POST /api/images (busboy multipart, DM only), retrieval via
 * /api/images/:id and the static /files handler, plus the current behavior
 * for missing files and dangerous file names.
 */
import * as fs from "fs-extra";
import * as path from "path";
import { createTestRoot, TestRoot } from "./test-helpers/create-test-root";
import { startTestServer, TestServer } from "./test-helpers/start-test-server";
import {
  httpRequest,
  uploadMultipart,
  uploadMultipartWithRetry,
} from "./test-helpers/http-client";
import { TINY_PNG } from "./test-helpers/fixtures";

jest.setTimeout(20000);

const DM_PASSWORD = "test-dm-secret";
const PC_PASSWORD = "test-pc-secret";

let root: TestRoot;
let server: TestServer | null = null;

beforeEach(async () => {
  root = await createTestRoot();
  server = await startTestServer({
    root,
    dmPassword: DM_PASSWORD,
    pcPassword: PC_PASSWORD,
  });
});

afterEach(async () => {
  if (server) {
    await server.close();
    server = null;
  }
  await root.cleanup();
});

test("the DM can upload a small image; it is stored under files/ with a random id", async () => {
  const response = await uploadMultipartWithRetry({
    baseUrl: server!.baseUrl,
    path: "/api/images",
    token: DM_PASSWORD,
    files: [
      {
        fieldName: "file",
        fileName: "my-image.png",
        contentType: "image/png",
        data: TINY_PNG,
      },
    ],
  });
  expect(response.status).toBe(200);
  const record = response.json().data.item;
  expect(record).toMatchObject({
    title: "my-image.png",
    path: `${record.id}.png`,
  });

  // Stored inside the temporary data directory, named by id (not by the
  // client-provided file name).
  const storedPath = path.join(root.dataDirectory, "files", `${record.id}.png`);
  expect(await fs.readFile(storedPath)).toEqual(TINY_PNG);

  // Retrievable through the REST endpoint and the static /files route.
  const byId = await httpRequest({
    baseUrl: server!.baseUrl,
    path: `/api/images/${record.id}?authorization=${encodeURIComponent(
      PC_PASSWORD
    )}`,
  });
  expect(byId.status).toBe(200);

  const byStaticRoute = await httpRequest({
    baseUrl: server!.baseUrl,
    path: `/files/${record.id}.png`,
  });
  expect(byStaticRoute.status).toBe(200);
});

test("players cannot upload images (401)", async () => {
  const response = await uploadMultipart({
    baseUrl: server!.baseUrl,
    path: "/api/images",
    token: PC_PASSWORD,
    files: [
      {
        fieldName: "file",
        fileName: "player-upload.png",
        contentType: "image/png",
        data: TINY_PNG,
      },
    ],
  });
  expect(response.status).toBe(401);
});

test("KNOWN DEFECT (documented): a multipart request without any file part yields 500, not 422", async () => {
  // routes/files.js intends to answer 422 ("No file was sent.") from the
  // request 'end' handler, but the busboy 'finish' handler unconditionally
  // calls fileStorage.store() with a temp file that was never created, and
  // that 500 wins the response race (observed current behavior).
  const response = await uploadMultipart({
    baseUrl: server!.baseUrl,
    path: "/api/images",
    token: DM_PASSWORD,
    files: [],
  });
  expect(response.status).toBe(500);
  expect(response.json().error.code).toBe("ERR_UNEXPECTED");
});

test("a dangerous client-supplied file name cannot control the storage location", async () => {
  const response = await uploadMultipartWithRetry({
    baseUrl: server!.baseUrl,
    path: "/api/images",
    token: DM_PASSWORD,
    files: [
      {
        fieldName: "file",
        fileName: "../../escape.png",
        contentType: "image/png",
        data: TINY_PNG,
      },
    ],
  });
  expect(response.status).toBe(200);
  const record = response.json().data.item;
  // The storage name derives from a server-generated UUID plus the parsed
  // extension; the client name only becomes the display title.
  expect(record.path).toBe(`${record.id}.png`);
  expect(
    await fs.pathExists(
      path.join(root.dataDirectory, "files", `${record.id}.png`)
    )
  ).toBe(true);
  expect(await fs.pathExists(path.join(root.rootDirectory, "escape.png"))).toBe(
    false
  );
});

test("uploaded images can be listed and deleted again", async () => {
  const uploadResponse = await uploadMultipartWithRetry({
    baseUrl: server!.baseUrl,
    path: "/api/images",
    token: DM_PASSWORD,
    files: [
      {
        fieldName: "file",
        fileName: "to-delete.png",
        contentType: "image/png",
        data: TINY_PNG,
      },
    ],
  });
  const record = uploadResponse.json().data.item;

  const listResponse = await httpRequest({
    baseUrl: server!.baseUrl,
    path: `/api/images?authorization=${encodeURIComponent(DM_PASSWORD)}`,
  });
  expect(listResponse.status).toBe(200);
  expect(listResponse.json().data.list.map((entry: any) => entry.id)).toContain(
    record.id
  );

  const deleteResponse = await httpRequest({
    baseUrl: server!.baseUrl,
    path: `/api/images/${record.id}?authorization=${encodeURIComponent(
      DM_PASSWORD
    )}`,
    method: "DELETE",
  });
  expect(deleteResponse.status).toBe(200);

  expect(
    await fs.pathExists(
      path.join(root.dataDirectory, "files", `${record.id}.png`)
    )
  ).toBe(false);
});

test("KNOWN DEFECT (documented): image list/read/delete endpoints do not require any role", async () => {
  // routes/files.js only guards POST /api/images with roleMiddleware.dm.
  // GET /api/images, GET/PATCH/DELETE /api/images/:id have no role check,
  // so unauthenticated callers can enumerate and delete uploads.
  const uploadResponse = await uploadMultipartWithRetry({
    baseUrl: server!.baseUrl,
    path: "/api/images",
    token: DM_PASSWORD,
    files: [
      {
        fieldName: "file",
        fileName: "unprotected.png",
        contentType: "image/png",
        data: TINY_PNG,
      },
    ],
  });
  const record = uploadResponse.json().data.item;

  const anonymousList = await httpRequest({
    baseUrl: server!.baseUrl,
    path: "/api/images",
  });
  expect(anonymousList.status).toBe(200);

  const anonymousDelete = await httpRequest({
    baseUrl: server!.baseUrl,
    path: `/api/images/${record.id}`,
    method: "DELETE",
  });
  expect(anonymousDelete.status).toBe(200);
  expect(
    await fs.pathExists(
      path.join(root.dataDirectory, "files", `${record.id}.png`)
    )
  ).toBe(false);
});

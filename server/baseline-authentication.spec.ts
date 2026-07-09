/**
 * Baseline P0.4 — REST authentication.
 *
 * Documents the current password/role model of `server/server.js`:
 * - the REST "token" IS the plaintext password (Authorization header or
 *   `?authorization=` query parameter);
 * - an unset password makes that role public;
 * - `getRole` resolves DM before PC when both passwords match.
 * Test passwords below are throwaway values, not real secrets.
 */
import { createTestRoot, TestRoot } from "./test-helpers/create-test-root";
import { startTestServer, TestServer } from "./test-helpers/start-test-server";
import { getJson, httpRequest, sendJson } from "./test-helpers/http-client";

jest.setTimeout(20000);

const DM_PASSWORD = "test-dm-secret";
const PC_PASSWORD = "test-pc-secret";

let root: TestRoot;
let server: TestServer | null = null;

afterEach(async () => {
  if (server) {
    await server.close();
    server = null;
  }
  await root.cleanup();
});

describe("with both DM and PC passwords configured", () => {
  beforeEach(async () => {
    root = await createTestRoot();
    server = await startTestServer({
      root,
      dmPassword: DM_PASSWORD,
      pcPassword: PC_PASSWORD,
    });
  });

  test("GET /api/auth resolves the role from the bearer token", async () => {
    const asDm = await getJson({
      baseUrl: server!.baseUrl,
      path: "/api/auth",
      token: DM_PASSWORD,
    });
    expect(asDm.json().data.role).toBe("DM");

    const asPc = await getJson({
      baseUrl: server!.baseUrl,
      path: "/api/auth",
      token: PC_PASSWORD,
    });
    expect(asPc.json().data.role).toBe("PC");

    const wrongPassword = await getJson({
      baseUrl: server!.baseUrl,
      path: "/api/auth",
      token: "wrong-password",
    });
    expect(wrongPassword.json().data.role).toBeNull();

    const noCredentials = await getJson({
      baseUrl: server!.baseUrl,
      path: "/api/auth",
    });
    expect(noCredentials.json().data.role).toBeNull();
  });

  test("the password can also be sent via the ?authorization= query parameter", async () => {
    const response = await httpRequest({
      baseUrl: server!.baseUrl,
      path: `/api/auth?authorization=${encodeURIComponent(PC_PASSWORD)}`,
    });
    expect(response.json().data.role).toBe("PC");
  });

  test("player routes require the PC or DM role", async () => {
    const asPc = await getJson({
      baseUrl: server!.baseUrl,
      path: "/api/active-map",
      token: PC_PASSWORD,
    });
    expect(asPc.status).toBe(200);

    const asDm = await getJson({
      baseUrl: server!.baseUrl,
      path: "/api/active-map",
      token: DM_PASSWORD,
    });
    expect(asDm.status).toBe(200);

    const unauthenticated = await getJson({
      baseUrl: server!.baseUrl,
      path: "/api/active-map",
    });
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.json().error.code).toBe(
      "ERR_UNAUTHENTICATED_ACCESS"
    );

    const wrongPassword = await getJson({
      baseUrl: server!.baseUrl,
      path: "/api/active-map",
      token: "wrong-password",
    });
    expect(wrongPassword.status).toBe(401);
  });

  test("DM routes reject PC and unauthenticated callers", async () => {
    const asPc = await sendJson({
      baseUrl: server!.baseUrl,
      path: "/api/active-map",
      token: PC_PASSWORD,
      body: { mapId: "some-map" },
    });
    expect(asPc.status).toBe(401);

    const unauthenticated = await sendJson({
      baseUrl: server!.baseUrl,
      path: "/api/active-map",
      body: { mapId: "some-map" },
    });
    expect(unauthenticated.status).toBe(401);

    const asDm = await sendJson({
      baseUrl: server!.baseUrl,
      path: "/api/active-map",
      token: DM_PASSWORD,
      body: { mapId: "some-map" },
    });
    expect(asDm.status).toBe(200);
  });

  test("a malformed Authorization header (no scheme separator) yields no role", async () => {
    const response = await httpRequest({
      baseUrl: server!.baseUrl,
      path: "/api/auth",
      headers: { Authorization: DM_PASSWORD },
    });
    // "DM_PASSWORD".split(" ")[1] is undefined => getRole(undefined) => null.
    expect(response.json().data.role).toBeNull();
  });
});

describe("with no passwords configured (public access)", () => {
  beforeEach(async () => {
    root = await createTestRoot();
    server = await startTestServer({ root });
  });

  test("every request gets the DM role, even without credentials", async () => {
    const response = await getJson({
      baseUrl: server!.baseUrl,
      path: "/api/auth",
    });
    expect(response.json().data.role).toBe("DM");
  });

  test("DM-only routes are open to everyone", async () => {
    const response = await sendJson({
      baseUrl: server!.baseUrl,
      path: "/api/active-map",
      body: { mapId: "whatever" },
    });
    expect(response.status).toBe(200);
  });
});

describe("with only the DM password configured", () => {
  beforeEach(async () => {
    root = await createTestRoot();
    server = await startTestServer({ root, dmPassword: DM_PASSWORD });
  });

  test("everyone is at least PC; only the DM password grants DM", async () => {
    const anonymous = await getJson({
      baseUrl: server!.baseUrl,
      path: "/api/auth",
    });
    expect(anonymous.json().data.role).toBe("PC");

    const withWrongPassword = await getJson({
      baseUrl: server!.baseUrl,
      path: "/api/auth",
      token: "wrong-password",
    });
    expect(withWrongPassword.json().data.role).toBe("PC");

    const asDm = await getJson({
      baseUrl: server!.baseUrl,
      path: "/api/auth",
      token: DM_PASSWORD,
    });
    expect(asDm.json().data.role).toBe("DM");
  });
});

/**
 * Baseline P1.4 — Map/token persistence (Maps class, backend level).
 *
 * Exercises the authoritative `Maps` store directly (creation, token CRUD,
 * on-disk persistence, legacy backfill) against a disposable directory,
 * without booting the whole HTTP server.
 */
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { Maps } from "./maps";
import { createResourceTaskProcessor } from "./util";
import { createMapFixture, TINY_PNG } from "./test-helpers/fixtures";

jest.setTimeout(20000);

let dataDirectory: string;

const createMapsStore = () =>
  new Maps({
    processTask: createResourceTaskProcessor(),
    dataDirectory,
  });

/** Stages a copy of the tiny PNG the way upload routes do (temp file that is moved). */
const stageImageFile = async () => {
  const stagedPath = path.join(dataDirectory, `staged-${Date.now()}.png`);
  await fs.writeFile(stagedPath, TINY_PNG);
  return stagedPath;
};

beforeEach(async () => {
  dataDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "dungeon-revealer-maps-test-")
  );
});

afterEach(async () => {
  await fs.remove(dataDirectory);
});

test("createMap persists the map folder, image and settings.json", async () => {
  const maps = createMapsStore();
  const map = await maps.createMap({
    title: "Created Map",
    filePath: await stageImageFile(),
    fileExtension: "png",
  });

  expect(map).toMatchObject({
    title: "Created Map",
    mapPath: "map.png",
    fogProgressPath: null,
    fogLivePath: null,
    tokens: [],
  });

  const mapFolder = path.join(dataDirectory, "maps", map.id);
  expect(await fs.pathExists(path.join(mapFolder, "map.png"))).toBe(true);
  const settings = await fs.readJSON(path.join(mapFolder, "settings.json"));
  expect(settings).toMatchObject({ id: map.id, title: "Created Map" });
});

test("addTokens applies the documented defaults and persists to disk", async () => {
  const maps = createMapsStore();
  const map = await maps.createMap({
    title: "Token Map",
    filePath: await stageImageFile(),
    fileExtension: "png",
  });

  const { tokens } = await maps.addTokens(map.id, [{ x: 5, y: 7 }]);
  expect(tokens).toHaveLength(1);
  expect(tokens[0]).toMatchObject({
    x: 5,
    y: 7,
    radius: 25, // (grid?.columnWidth ?? 50) / 2
    color: "red",
    label: "A",
    // Note: new tokens default to NOT visible and NOT movable by players,
    // while legacy tokens loaded from disk backfill isMovableByPlayers=true.
    isVisibleForPlayers: false,
    isMovableByPlayers: false,
    isLocked: false,
    rotation: 0,
    tokenImageId: null,
  });

  const settings = await fs.readJSON(
    path.join(dataDirectory, "maps", map.id, "settings.json")
  );
  expect(settings.tokens).toHaveLength(1);
  expect(settings.tokens[0].id).toBe(tokens[0].id);
});

test("updateToken, updateManyTokens and removeTokensById mutate and persist state", async () => {
  const maps = createMapsStore();
  const map = await maps.createMap({
    title: "Mutation Map",
    filePath: await stageImageFile(),
    fileExtension: "png",
  });
  const { tokens } = await maps.addTokens(map.id, [
    { x: 0, y: 0, label: "A" },
    { x: 1, y: 1, label: "B" },
  ]);
  const [tokenA, tokenB] = tokens;

  const { token: updated } = await maps.updateToken(map.id, tokenA.id, {
    x: 100,
    y: 200,
    label: "Z",
  });
  expect(updated).toMatchObject({ x: 100, y: 200, label: "Z" });

  await maps.updateManyTokens(map.id, new Set([tokenA.id, tokenB.id]), {
    color: "green",
    isVisibleForPlayers: true,
    isMovableByPlayers: undefined,
    tokenImageId: undefined,
    rotation: undefined,
  });

  const removed = await maps.removeTokensById(map.id, new Set([tokenB.id]));
  expect(removed).toEqual(new Set([tokenB.id]));

  // A brand-new Maps instance must read the same state back from disk.
  const reloaded = createMapsStore();
  const reloadedMap = reloaded.get(map.id);
  expect(reloadedMap).not.toBeNull();
  expect(reloadedMap!.tokens).toHaveLength(1);
  expect(reloadedMap!.tokens[0]).toMatchObject({
    id: tokenA.id,
    x: 100,
    y: 200,
    label: "Z",
    color: "green",
    isVisibleForPlayers: true,
  });
});

// NOTE: a test for `updateToken` on an unknown map id is intentionally NOT
// present. The rejection surfaces correctly to the caller, but
// `createResourceTaskProcessor` (server/util.ts) chains `.finally()` onto the
// failed task and never handles that derived promise, producing an unhandled
// promise rejection that Jest (and Node >= 15 by default) treats as fatal.
// Documented as a known defect in docs/BASELINE_TEST_PLAN.md.

test("legacy tokens loaded from disk are backfilled by prepareToken", async () => {
  await createMapFixture(dataDirectory, {
    id: "legacy-map",
    title: "Legacy Map",
    tokens: [
      // Minimal legacy token: none of the newer fields exist yet.
      { id: "legacy-token", x: 1, y: 2, radius: 10, color: "red", label: "L" },
    ],
  });

  const maps = createMapsStore();
  const map = maps.get("legacy-map");
  expect(map).not.toBeNull();
  expect(map!.tokens[0]).toMatchObject({
    id: "legacy-token",
    type: "entity",
    isLocked: false,
    isMovableByPlayers: true,
    rotation: 0,
    reference: null,
    tokenImageId: null,
  });
});

test("KNOWN DEFECT (documented): fogLiveRevision is loaded from fogProgressRevision", async () => {
  // maps.ts _loadMaps assigns `rawMap.fogProgressRevision` to
  // `fogLiveRevision` (copy/paste slip), so the persisted fogLiveRevision is
  // ignored on load. This test pins the current behavior.
  await createMapFixture(dataDirectory, {
    id: "revision-map",
    fogProgressRevision: "progress-revision",
    fogLiveRevision: "live-revision",
  });

  const maps = createMapsStore();
  const map = maps.get("revision-map");
  expect(map!.fogProgressRevision).toBe("progress-revision");
  expect(map!.fogLiveRevision).toBe("progress-revision");
});

test("deleteMap removes the folder from disk and the map from memory", async () => {
  const maps = createMapsStore();
  const map = await maps.createMap({
    title: "Doomed Map",
    filePath: await stageImageFile(),
    fileExtension: "png",
  });

  await maps.deleteMap(map.id);
  expect(maps.get(map.id)).toBeNull();
  expect(await fs.pathExists(path.join(dataDirectory, "maps", map.id))).toBe(
    false
  );
});

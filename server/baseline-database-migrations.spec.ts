/**
 * Baseline P0.2 — SQLite schema migrations.
 *
 * Protects the migration runner (`server/database.ts`, PRAGMA user_version
 * fall-through switch) without modifying any migration: fresh directory ends
 * on version 4 with the expected tables/indexes, and re-opening an existing
 * database neither re-runs migrations nor destroys data.
 */
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import type { Database } from "sqlite";
import { initialize } from "./database";

jest.setTimeout(20000);

let dataPath: string;
let db: Database | null = null;

beforeEach(async () => {
  dataPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "dungeon-revealer-db-test-")
  );
});

afterEach(async () => {
  if (db) {
    await db.close();
    db = null;
  }
  await fs.remove(dataPath);
});

const getTableNames = async (database: Database): Promise<Array<string>> => {
  const rows = await database.all(
    `SELECT "name" FROM "sqlite_master" WHERE "type" = 'table' ORDER BY "name";`
  );
  return rows.map((row) => row.name);
};

const getIndexNames = async (database: Database): Promise<Array<string>> => {
  const rows = await database.all(
    `SELECT "name" FROM "sqlite_master" WHERE "type" = 'index' ORDER BY "name";`
  );
  return rows.map((row) => row.name);
};

test("creates db.sqlite in an empty directory and migrates to user_version 4", async () => {
  db = await initialize({ dataPath });

  expect(await fs.pathExists(path.join(dataPath, "db.sqlite"))).toBe(true);

  const version = await db.get(`PRAGMA "user_version";`);
  expect(version.user_version).toBe(4);

  const tables = await getTableNames(db);
  expect(tables).toEqual(
    expect.arrayContaining([
      "file_uploads",
      "notes",
      "notes_search",
      "tokenImages",
    ])
  );

  const indexes = await getIndexNames(db);
  expect(indexes).toEqual(
    expect.arrayContaining([
      "notes_desc_created_at_desc_id",
      "index_tokenImages_sha256",
    ])
  );
});

test("expected columns exist on the notes table (including migration 2 additions)", async () => {
  db = await initialize({ dataPath });
  const columns = await db.all(`PRAGMA table_info("notes");`);
  const columnNames = columns.map((column) => column.name);
  expect(columnNames).toEqual(
    expect.arrayContaining([
      "id",
      "title",
      "content",
      "created_at",
      "updated_at",
      "type",
      "is_entry_point",
    ])
  );
});

test("re-opening an existing database is idempotent and preserves data", async () => {
  db = await initialize({ dataPath });

  await db.run(
    `INSERT INTO "notes" ("id", "title", "content", "created_at", "updated_at", "type", "is_entry_point")
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    "note-1",
    "Baseline Note",
    "Some content",
    1000,
    1000,
    "admin",
    1
  );
  await db.run(
    `INSERT INTO "file_uploads" ("id", "title", "path", "created_at")
     VALUES (?, ?, ?, ?);`,
    "upload-1",
    "image.png",
    "upload-1.png",
    1000
  );
  await db.close();
  db = null;

  // Second boot against the same directory: the fall-through switch matches
  // no case for user_version 4, so nothing may change.
  db = await initialize({ dataPath });

  const version = await db.get(`PRAGMA "user_version";`);
  expect(version.user_version).toBe(4);

  const note = await db.get(`SELECT * FROM "notes" WHERE "id" = ?;`, "note-1");
  expect(note).toMatchObject({
    id: "note-1",
    title: "Baseline Note",
    content: "Some content",
    type: "admin",
    is_entry_point: 1,
  });

  const upload = await db.get(
    `SELECT * FROM "file_uploads" WHERE "id" = ?;`,
    "upload-1"
  );
  expect(upload).toMatchObject({ id: "upload-1", path: "upload-1.png" });
});

test("legacy notes/*.json files are imported by migration 1", async () => {
  const legacyNotesDirectory = path.join(dataPath, "notes");
  await fs.mkdirp(legacyNotesDirectory);
  await fs.writeJSON(path.join(legacyNotesDirectory, "legacy-note.json"), {
    id: "legacy-note",
    title: "Legacy",
    content: "Old content",
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
  });

  db = await initialize({ dataPath });

  const note = await db.get(
    `SELECT * FROM "notes" WHERE "id" = ?;`,
    "legacy-note"
  );
  expect(note).toMatchObject({
    id: "legacy-note",
    title: "Legacy",
    // Migration 1 prefixes the content with a markdown title.
    content: "# Legacy\n\nOld content",
    // Migration 2 marks pre-existing notes as entry points.
    is_entry_point: 1,
  });
});

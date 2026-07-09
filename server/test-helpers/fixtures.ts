import * as fs from "fs-extra";
import * as path from "path";
import { randomUUID } from "crypto";

/** A valid 1x1 transparent PNG (68 bytes). The server never decodes images. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

export type MapFixtureToken = { [key: string]: unknown };

export type MapFixtureOptions = {
  id?: string;
  title?: string;
  tokens?: Array<MapFixtureToken>;
  fogProgressRevision?: string;
  fogLiveRevision?: string;
};

/**
 * Writes a minimal on-disk map (`maps/<id>/settings.json` + `map.png`) into a
 * test data directory. Must be called BEFORE the server boots, because maps
 * are loaded into memory once at startup (`Maps._loadMaps`).
 */
export const createMapFixture = async (
  dataDirectory: string,
  options: MapFixtureOptions = {}
) => {
  const id = options.id ?? randomUUID();
  const mapFolder = path.join(dataDirectory, "maps", id);
  await fs.mkdirp(mapFolder);
  await fs.writeFile(path.join(mapFolder, "map.png"), TINY_PNG);

  const settings = {
    id,
    title: options.title ?? "Test Map",
    mapPath: "map.png",
    fogProgressPath: null,
    fogLivePath: null,
    showGrid: false,
    showGridToPlayers: false,
    grid: null,
    tokens: options.tokens ?? [],
    fogProgressRevision: options.fogProgressRevision ?? randomUUID(),
    fogLiveRevision: options.fogLiveRevision ?? randomUUID(),
  };
  await fs.writeJSON(path.join(mapFolder, "settings.json"), settings, {
    spaces: 2,
  });

  return { id, mapFolder, settings };
};

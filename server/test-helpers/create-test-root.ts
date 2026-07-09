import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

/**
 * A unique, disposable directory tree for a single test (or test suite).
 * Everything the server writes during a test must stay inside `rootDirectory`.
 *
 * - `dataDirectory` is passed to the server as DATA_DIRECTORY.
 * - `publicPath` is a minimal fake of the built frontend (`build/`) so that
 *   `bootstrapServer` can read `index.html` and serve the favicon without
 *   depending on a real `npm run build` output.
 */
export type TestRoot = {
  rootDirectory: string;
  dataDirectory: string;
  publicPath: string;
  cleanup: () => Promise<void>;
};

const FAKE_INDEX_HTML = `<!DOCTYPE html>
<html>
  <head>
    <base href="/" />
    <title>dungeon-revealer test</title>
  </head>
  <body>
    __PUBLIC_URL_PLACEHOLDER__
  </body>
</html>
`;

export const createTestRoot = async (): Promise<TestRoot> => {
  const rootDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "dungeon-revealer-test-")
  );
  const dataDirectory = path.join(rootDirectory, "data");
  const publicPath = path.join(rootDirectory, "public");

  await fs.mkdirp(path.join(publicPath, "images", "icons"));
  await fs.writeFile(path.join(publicPath, "index.html"), FAKE_INDEX_HTML);
  // serve-favicon only needs a file to exist at this path.
  await fs.writeFile(
    path.join(publicPath, "images", "icons", "favicon.ico"),
    Buffer.from([0x00, 0x00, 0x01, 0x00])
  );

  return {
    rootDirectory,
    dataDirectory,
    publicPath,
    cleanup: async () => {
      await fs.remove(rootDirectory);
    },
  };
};

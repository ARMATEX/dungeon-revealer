import type { Server as HTTPServer } from "http";
import type { Socket as NetSocket } from "net";
import type { Server as IOServer } from "socket.io";
import type { Database } from "sqlite";
import type { EventEmitter } from "events";
import type { TestRoot } from "./create-test-root";

// server.js is plain CommonJS (mixed JS/TS codebase).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bootstrapServer } = require("../server");

export type TestServer = {
  port: number;
  baseUrl: string;
  httpServer: HTTPServer;
  io: IOServer;
  db: Database;
  emitter: EventEmitter;
  /** Closes Socket.IO, the HTTP server, open connections and the database. */
  close: () => Promise<void>;
};

export type TestServerOptions = {
  root: TestRoot;
  dmPassword?: string | null;
  pcPassword?: string | null;
  publicUrl?: string;
};

/**
 * Boots the real `bootstrapServer` against a disposable test root and starts
 * listening on a dynamic port (`listen(0)`) bound to 127.0.0.1 only.
 */
export const startTestServer = async (
  options: TestServerOptions
): Promise<TestServer> => {
  const env = {
    DATA_DIRECTORY: options.root.dataDirectory,
    PUBLIC_PATH: options.root.publicPath,
    PUBLIC_URL: options.publicUrl ?? "",
    PORT: 0,
    HOST: "127.0.0.1",
    PC_PASSWORD: options.pcPassword ?? null,
    DM_PASSWORD: options.dmPassword ?? null,
  };

  const { httpServer, io, db, emitter, fileStorage } = await bootstrapServer(
    env
  );

  const connections = new Set<NetSocket>();
  httpServer.on("connection", (connection: NetSocket) => {
    connections.add(connection);
    connection.on("close", () => {
      connections.delete(connection);
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => {
      httpServer.removeListener("error", reject);
      resolve();
    });
  });

  const address = httpServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected the HTTP server to expose an address object.");
  }
  const port = address.port;

  let closed = false;
  const close = async () => {
    if (closed) {
      return;
    }
    closed = true;
    // io.close also closes the underlying HTTP server it is attached to.
    const ioClosed = new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
    for (const connection of connections) {
      connection.destroy();
    }
    await ioClosed;
    // FileStorage keeps lazily prepared statements; they must be finalized
    // or sqlite refuses to close (SQLITE_BUSY) and the db file stays locked
    // on Windows.
    await fileStorage.destroy();
    await db.close();
  };

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    httpServer,
    io,
    db,
    emitter,
    close,
  };
};

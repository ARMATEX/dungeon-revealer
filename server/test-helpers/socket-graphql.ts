import { io as createSocketClient, Socket } from "socket.io-client";
import { createSocketIOGraphQLClient } from "@n1ru4l/socket-io-graphql-client";
import { applyLiveQueryJSONDiffPatch } from "@n1ru4l/graphql-live-query-patch-jsondiffpatch";

export type GraphQLResult = {
  data?: Record<string, any> | null;
  errors?: Array<{ message: string }>;
};

/**
 * Connects a Socket.IO client the same way the real frontend does
 * (`src/socket.ts`): path `/api/socket.io`. Reconnection is disabled so tests
 * stay deterministic; websocket transport avoids lingering polling requests.
 */
export const connectTestSocket = (baseUrl: string): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const socket = createSocketClient(baseUrl, {
      path: "/api/socket.io",
      transports: ["websocket"],
      reconnection: false,
    });
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Timed out while connecting the test socket."));
    }, 5000);
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      socket.close();
      reject(error);
    });
  });

/**
 * Emits the `authenticate` event exactly like the real client
 * (`src/authenticated-app-shell.tsx`) and resolves once the server replies
 * with `authenticated`.
 */
export const authenticateSocket = (
  socket: Socket,
  params: { password?: string; desiredRole?: "admin" | "user" },
  timeoutMs = 3000
): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("authenticated", onAuthenticated);
      reject(
        new Error(
          `The server did not confirm authentication within ${timeoutMs}ms.`
        )
      );
    }, timeoutMs);
    const onAuthenticated = () => {
      clearTimeout(timeout);
      resolve();
    };
    socket.once("authenticated", onAuthenticated);
    socket.emit("authenticate", {
      password: params.password,
      desiredRole: params.desiredRole,
    });
  });

/**
 * Asserts that a given event is NOT emitted within a short window.
 * Used for documenting the current behavior on failed authentication
 * (the server stays silent instead of sending an error).
 */
export const expectNoEvent = (
  socket: Socket,
  eventName: string,
  windowMs = 750
): Promise<void> =>
  new Promise((resolve, reject) => {
    const onEvent = () => {
      clearTimeout(timeout);
      reject(new Error(`Did not expect the "${eventName}" event to fire.`));
    };
    const timeout = setTimeout(() => {
      socket.off(eventName, onEvent);
      resolve();
    }, windowMs);
    socket.once(eventName, onEvent);
  });

export type CollectedResults<T> = {
  values: Array<T>;
  waitForValueCount: (count: number, timeoutMs?: number) => Promise<void>;
  stop: () => void;
};

/**
 * Consumes an AsyncIterableIterator in the background and lets tests await a
 * specific number of emissions (initial live query result + patches) without
 * arbitrary sleeps.
 */
export const collectAsyncIterable = <T>(
  iterable: AsyncIterableIterator<T>
): CollectedResults<T> => {
  const values: Array<T> = [];
  let error: unknown = null;
  let done = false;
  let notify: Array<() => void> = [];

  const flushNotifications = () => {
    const listeners = notify;
    notify = [];
    listeners.forEach((listener) => listener());
  };

  void (async () => {
    try {
      for await (const value of iterable) {
        values.push(value);
        flushNotifications();
      }
    } catch (err) {
      error = err;
    } finally {
      done = true;
      flushNotifications();
    }
  })();

  return {
    values,
    waitForValueCount: (count, timeoutMs = 5000) =>
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error(
              `Timed out waiting for ${count} emission(s); received ${values.length}.`
            )
          );
        }, timeoutMs);
        const check = () => {
          if (error != null) {
            clearTimeout(timeout);
            reject(error);
            return;
          }
          if (values.length >= count) {
            clearTimeout(timeout);
            resolve();
            return;
          }
          if (done) {
            clearTimeout(timeout);
            reject(
              new Error(
                `Stream ended after ${values.length} emission(s); expected ${count}.`
              )
            );
            return;
          }
          notify.push(check);
        };
        check();
      }),
    stop: () => {
      void iterable.return?.();
    },
  };
};

export type GraphQLTestClient = {
  /** Executes an operation and resolves with the single (first) result. */
  execute: (params: {
    operation: string;
    variables?: Record<string, unknown>;
  }) => Promise<GraphQLResult>;
  /** Starts a `@live` query and returns the collected emissions. */
  executeLive: (params: {
    operation: string;
    variables?: Record<string, unknown>;
  }) => CollectedResults<GraphQLResult>;
  destroy: () => void;
};

export const createGraphQLTestClient = (socket: Socket): GraphQLTestClient => {
  const client = createSocketIOGraphQLClient<GraphQLResult>(socket);
  return {
    execute: async ({ operation, variables }) => {
      const iterable = client.execute({ operation, variables });
      for await (const result of iterable) {
        void iterable.return?.();
        return result;
      }
      throw new Error("The operation completed without yielding a result.");
    },
    executeLive: ({ operation, variables }) =>
      collectAsyncIterable(
        applyLiveQueryJSONDiffPatch<GraphQLResult>(
          client.execute({ operation, variables })
        )
      ),
    destroy: () => client.destroy(),
  };
};

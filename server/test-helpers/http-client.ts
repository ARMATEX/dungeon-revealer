import * as http from "http";

export type TestHttpResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  json: () => any;
};

/**
 * Minimal HTTP client on top of node's `http` module (no extra dependencies).
 */
export const httpRequest = (options: {
  baseUrl: string;
  path: string;
  method?: string;
  headers?: http.OutgoingHttpHeaders;
  body?: Buffer | string | null;
}): Promise<TestHttpResponse> =>
  new Promise((resolve, reject) => {
    const url = new URL(`${options.baseUrl}${options.path}`);
    const request = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: options.method ?? "GET",
        headers: options.headers,
      },
      (response) => {
        const chunks: Array<Buffer> = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf-8");
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body,
            json: () => JSON.parse(body),
          });
        });
      }
    );
    request.on("error", reject);
    if (options.body != null) {
      request.write(options.body);
    }
    request.end();
  });

const buildAuthorizationHeaders = (
  token: string | null
): http.OutgoingHttpHeaders =>
  token == null ? {} : { Authorization: `Bearer ${token}` };

export const getJson = (params: {
  baseUrl: string;
  path: string;
  token?: string | null;
}) =>
  httpRequest({
    baseUrl: params.baseUrl,
    path: params.path,
    method: "GET",
    headers: buildAuthorizationHeaders(params.token ?? null),
  });

export const sendJson = (params: {
  baseUrl: string;
  path: string;
  method?: string;
  token?: string | null;
  body: unknown;
}) => {
  const body = JSON.stringify(params.body);
  return httpRequest({
    baseUrl: params.baseUrl,
    path: params.path,
    method: params.method ?? "POST",
    headers: {
      ...buildAuthorizationHeaders(params.token ?? null),
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  });
};

export type MultipartFile = {
  fieldName: string;
  fileName: string;
  contentType: string;
  data: Buffer;
};

/**
 * Builds a multipart/form-data body by hand so we do not need any
 * additional HTTP testing dependency (busboy on the server parses it).
 */
export const buildMultipartBody = (files: Array<MultipartFile>) => {
  const boundary = `----dungeon-revealer-test-${Date.now()}`;
  const chunks: Array<Buffer> = [];
  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"\r\n` +
          `Content-Type: ${file.contentType}\r\n\r\n`
      )
    );
    chunks.push(file.data);
    chunks.push(Buffer.from(`\r\n`));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    } as http.OutgoingHttpHeaders,
  };
};

export const uploadMultipart = (params: {
  baseUrl: string;
  path: string;
  token?: string | null;
  files: Array<MultipartFile>;
}) => {
  const { body, headers } = buildMultipartBody(params.files);
  return httpRequest({
    baseUrl: params.baseUrl,
    path: params.path,
    method: "POST",
    headers: {
      ...buildAuthorizationHeaders(params.token ?? null),
      ...headers,
      "Content-Length": body.length,
    },
    body,
  });
};

/**
 * KNOWN DEFECT workaround (documented in docs/BASELINE_TEST_PLAN.md):
 * the upload routes call `fileStorage.store()` from busboy's "finish" event
 * without waiting for the temp-file write stream to close, so an upload can
 * intermittently fail with 500 (ENOENT on the staging file). This helper
 * retries a limited number of times so the baseline suite stays
 * deterministic while the legacy race remains unfixed. Only use it for
 * success-path uploads — tests that assert error responses must call
 * `uploadMultipart` directly.
 */
export const uploadMultipartWithRetry = async (
  params: {
    baseUrl: string;
    path: string;
    token?: string | null;
    files: Array<MultipartFile>;
  },
  attempts = 3
): Promise<TestHttpResponse> => {
  let lastResponse: TestHttpResponse | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    lastResponse = await uploadMultipart(params);
    if (lastResponse.status !== 500) {
      return lastResponse;
    }
  }
  return lastResponse!;
};

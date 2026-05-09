import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Adola, AdolaAPIError } from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(__dirname, "../../fixtures");

async function fixture(name) {
  return JSON.parse(await readFile(path.join(fixtures, name), "utf8"));
}

async function withServer(handler, run) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

test("models sends auth and parses response", async () => {
  const models = await fixture("models-response.json");

  await withServer((request, response) => {
    assert.equal(request.url, "/v1/models");
    assert.equal(request.headers.authorization, "Bearer test-key");
    assert.equal(request.headers["user-agent"], "adola-node/0.1.0");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(models));
  }, async (baseUrl) => {
    const client = new Adola({ apiKey: "test-key", baseUrl });
    assert.equal((await client.models())[0].id, "rose-1");
  });
});

test("compress posts schema payload", async () => {
  const compressResponse = await fixture("compress-response.json");

  await withServer(async (request, response) => {
    assert.equal(request.url, "/v1/compress");
    assert.deepEqual(await readJson(request), {
      input: "source text",
      query: "needle",
      compression: { target_ratio: 0.5 },
      include_spans: false,
    });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(compressResponse));
  }, async (baseUrl) => {
    const client = new Adola({ apiKey: "test-key", baseUrl });
    const result = await client.compress({
      input: "source text",
      query: "needle",
      compression: { target_ratio: 0.5 },
      include_spans: false,
    });
    assert.equal(result.receipt.tokens_saved, 6);
  });
});

test("compress accepts spans without input", async () => {
  const compressResponse = await fixture("compress-response.json");

  await withServer(async (request, response) => {
    assert.deepEqual((await readJson(request)).spans, [{ id: "a", text: "span text" }]);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(compressResponse));
  }, async (baseUrl) => {
    const client = new Adola({ apiKey: "test-key", baseUrl });
    const result = await client.compress({ spans: [{ id: "a", text: "span text" }] });
    assert.equal(result.model, "rose-1");
  });
});

test("batchCompress posts request array", async () => {
  const compressRequest = await fixture("compress-request.json");
  const compressResponse = await fixture("compress-response.json");

  await withServer(async (request, response) => {
    assert.equal(request.url, "/v1/batch/compress");
    assert.deepEqual(await readJson(request), { requests: [compressRequest] });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify([compressResponse]));
  }, async (baseUrl) => {
    const client = new Adola({ apiKey: "test-key", baseUrl });
    const result = await client.batchCompress([compressRequest]);
    assert.match(result[0].output, /^Adola removes/);
  });
});

test("api errors include status and request id", async () => {
  await withServer((_request, response) => {
    response.statusCode = 422;
    response.setHeader("content-type", "application/json");
    response.setHeader("x-request-id", "req_123");
    response.end(JSON.stringify({ detail: [{ msg: "input or spans is required" }] }));
  }, async (baseUrl) => {
    const client = new Adola({ apiKey: "test-key", baseUrl });
    await assert.rejects(client.models(), (error) => {
      assert.ok(error instanceof AdolaAPIError);
      assert.equal(error.statusCode, 422);
      assert.equal(error.requestId, "req_123");
      assert.equal(error.message, "input or spans is required");
      return true;
    });
  });
});

test("timeouts become AdolaAPIError", async () => {
  await withServer((_request, response) => {
    setTimeout(() => response.end("{}"), 100);
  }, async (baseUrl) => {
    const client = new Adola({ apiKey: "test-key", baseUrl, timeoutMs: 10 });
    await assert.rejects(client.models(), /Request timed out/);
  });
});

test("env configuration is supported", async () => {
  const previousKey = process.env.ADOLA_API_KEY;
  const previousBaseUrl = process.env.ADOLA_BASE_URL;

  try {
    await withServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([{ id: "rose-1", name: "Rose 1", mode: "context-compression", target: "production-llm-systems" }]));
    }, async (baseUrl) => {
      process.env.ADOLA_API_KEY = "env-key";
      process.env.ADOLA_BASE_URL = `${baseUrl}/`;
      const client = new Adola();
      assert.equal((await client.models())[0].name, "Rose 1");
    });
  } finally {
    if (previousKey === undefined) {
      delete process.env.ADOLA_API_KEY;
    } else {
      process.env.ADOLA_API_KEY = previousKey;
    }
    if (previousBaseUrl === undefined) {
      delete process.env.ADOLA_BASE_URL;
    } else {
      process.env.ADOLA_BASE_URL = previousBaseUrl;
    }
  }
});

test("injected fetch is supported", async () => {
  const calls = [];
  const client = new Adola({
    apiKey: "test-key",
    baseUrl: "https://unit.test",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(await fixture("models-response.json")), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal((await client.models())[0].id, "rose-1");
  assert.equal(calls[0].url, "https://unit.test/v1/models");
});

test("live models and compress", { skip: !process.env.ADOLA_API_KEY }, async () => {
  const client = new Adola({ apiKey: process.env.ADOLA_API_KEY });
  assert.equal((await client.models())[0].id, "rose-1");
  const response = await client.compress({
    input: "Adola trims prompt context before the request reaches a model.",
    query: "What does Adola trim?",
    compression: { target_ratio: 0.5 },
  });
  assert.ok(response.receipt.tokens_saved >= 0);
});

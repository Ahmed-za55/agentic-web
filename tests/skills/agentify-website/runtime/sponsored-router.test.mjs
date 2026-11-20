// Checks the runtime's sponsored router: a default router the site pays for, which takes
// no visitor key and never receives one. See runtime/README.md, "Sponsored router".
// Run from the repository root: node --test "tests/**/*.test.mjs"
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { selectPeerRouter, selectTopRouter } from "../../../../skills/agentify-website/runtime/engine.js";
import { InUseLine } from "../../../../skills/agentify-website/runtime/in-use-line.js";
import { LlmClient } from "../../../../skills/agentify-website/runtime/llm.js";

const WORKER = "https://tollfree.example.workers.dev/v1";
const OTARI = "https://api.otari.ai/api/v1";
const SPONSORED = {
  llm_router: {
    base_url: WORKER,
    sponsored: true,
    mock: false,
    byok_router: OTARI,
  },
};

/**
 * Stand in for fetch: keep each request and answer with a one-chunk SSE stream.
 */
class RecordingFetch {
  constructor() {
    this.requests = [];
  }

  /**
   * Record the request and answer it.
   *
   * :param url: The URL called.
   * :param init: The request options.
   * :return: A streamed chat completion that says "hi".
   */
  async call(url, init) {
    this.requests.push({url: String(url), headers: {...init.headers}, body: JSON.parse(init.body)});
    const chunk = {choices: [{delta: {content: "hi"}, finish_reason: "stop"}]};
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
      status: 200,
      headers: {"Content-Type": "text/event-stream"},
    });
  }
}

/**
 * Run one chat call with fetch replaced.
 *
 * :param client: The LlmClient.
 * :return: The recorded requests.
 */
async function chatOnce(client) {
  const recorder = new RecordingFetch();
  const saved = globalThis.fetch;
  globalThis.fetch = recorder.call.bind(recorder);
  try {
    await client.chat({model: "alibaba/qwen3.8-flash", messages: [{role: "user", content: "hello"}]});
  } finally {
    globalThis.fetch = saved;
  }
  return recorder.requests;
}

test("with no key, the sponsored default router is chosen and not called a mock", () => {
  assert.deepEqual(selectTopRouter(SPONSORED, "", ""), {
    baseUrl: WORKER,
    mock: false,
    sponsored: true,
    upgradedToByok: false,
  });
  // A saved override that is the sponsored router itself stays sponsored.
  assert.equal(selectTopRouter(SPONSORED, WORKER, "").sponsored, true);
});

test("a visitor's own key switches to the BYOK router, even from a saved sponsored override", () => {
  for (const override of ["", WORKER, `${WORKER}/`]) {
    assert.deepEqual(selectTopRouter(SPONSORED, override, "sk-visitor-0000000000"), {
      baseUrl: OTARI,
      mock: false,
      sponsored: false,
      upgradedToByok: true,
    });
  }
});

test("sponsored needs the manifest's word: plain and mock routers are not sponsored", () => {
  const plain = {llm_router: {base_url: OTARI, byok_router: OTARI}};
  assert.equal(selectTopRouter(plain, "", "").sponsored, false);
  const mock = {llm_router: {base_url: WORKER, sponsored: true, mock: true, byok_router: OTARI}};
  assert.equal(selectTopRouter(mock, "", "").sponsored, false);
  // A visitor's own router is not sponsored, even when the site's is.
  assert.equal(selectTopRouter(SPONSORED, "https://openrouter.ai/api/v1", "sk-visitor-0000000000").sponsored, false);
});

test("a partner network runs on the caller's sponsored router", () => {
  assert.deepEqual(selectPeerRouter({baseUrl: WORKER, mock: false, sponsored: true}), {
    baseUrl: WORKER,
    mock: false,
    sponsored: true,
  });
});

test("the sponsored client calls with no key and never sends the visitor's", async () => {
  const client = new LlmClient({baseUrl: WORKER, apiKey: "sk-visitor-0000000000", sponsored: true});
  const requests = await chatOnce(client);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${WORKER}/chat/completions`);
  assert.equal(requests[0].headers.Authorization, undefined);
  assert.ok(!JSON.stringify(requests[0]).includes("sk-visitor"));
});

test("a plain router with no key still stops with the setup error", async () => {
  const client = new LlmClient({baseUrl: OTARI, apiKey: ""});
  await assert.rejects(chatOnce(client), /An AI provider key is required/);
});

test("the in-use line says the site pays", () => {
  assert.equal(
    InUseLine.text({sponsored: true, key: "", router: WORKER, model: "", siteModel: "alibaba/qwen3.8-flash"}),
    "In use: alibaba/qwen3.8-flash (this site's model) · paid for by this site, no key needed",
  );
});


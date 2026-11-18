import { createHash } from "node:crypto";

/**
 * A mock OpenRouter: its sign-in page, its key exchange and its chat endpoint.
 *
 * approve() plays the visitor approving on the sign-in page. It returns the address
 * OpenRouter would send the visitor back to. The key exchange checks the PKCE verifier
 * against the challenge, as OpenRouter does, and each code works once. The chat endpoint
 * records the key and model of each request. The keys are made-up strings.
 */
export class MockOpenRouter {
  /**
   * The sign-in page's address.
   */
  static AUTH_URL = "https://openrouter.ai/auth";

  /**
   * Start with no codes, exchanges or chat requests.
   */
  constructor() {
    this.codes = new Map();
    this.approvals = [];
    this.exchanges = [];
    this.chats = [];
    this.issued = 0;
    // When true, the key exchange never answers, like an unreachable server.
    this.hangExchange = false;
  }

  /**
   * Approve the sign-in on the mock sign-in page.
   *
   * :param authUrl: The address the page sent the visitor to.
   * :return: The callback address with `code` and, when one was sent, `state`.
   * :raises Error: When the address is not the sign-in page or has no S256 challenge.
   */
  approve(authUrl) {
    const url = new URL(authUrl);
    if (url.origin + url.pathname !== MockOpenRouter.AUTH_URL) {
      throw new Error(`Not the OpenRouter sign-in page: ${authUrl}`);
    }
    const challenge = url.searchParams.get("code_challenge") || "";
    if (!challenge || url.searchParams.get("code_challenge_method") !== "S256") {
      throw new Error("The sign-in has no S256 code challenge.");
    }
    this.issued += 1;
    const code = `mock-code-${this.issued}`;
    this.codes.set(code, {
      challenge,
      key: `sk-or-v1-mock-key-${this.issued}`,
    });
    this.approvals.push(url.searchParams.get("key_label"));
    const back = new URL(url.searchParams.get("callback_url"));
    back.searchParams.set("code", code);
    const state = url.searchParams.get("state");
    if (state) back.searchParams.set("state", state);
    return back.href;
  }

  /**
   * Answer a request to openrouter.ai.
   *
   * :param url: The request's address.
   * :param init: The fetch options.
   * :return: The response.
   */
  async answer(url, init) {
    const path = new URL(url).pathname;
    if (init.method === "POST" && path === "/api/v1/auth/keys" && this.hangExchange) {
      return new Promise(MockOpenRouter.failOnAbort.bind(null, init.signal));
    }
    if (init.method === "POST" && path === "/api/v1/auth/keys") return this.exchangeKey(init);
    if (init.method === "POST" && path === "/api/v1/chat/completions") return this.chat(init);
    return MockOpenRouter.json(404, { error: { message: "Not found" } });
  }

  /**
   * Leave a request unanswered until its signal aborts, then fail it as fetch does.
   *
   * Node does not let the timer behind AbortSignal.timeout keep the process running, so
   * an interval does that until the abort.
   *
   * :param signal: The request's abort signal.
   * :param resolve: The promise's resolve function. It is never called.
   * :param reject: The promise's reject function.
   */
  static failOnAbort(signal, resolve, reject) {
    if (!signal) return;
    const keepAlive = setInterval(MockOpenRouter.idle, 1000);
    signal.addEventListener("abort", MockOpenRouter.abort.bind(null, signal, keepAlive, reject), { once: true });
  }

  /**
   * Fail a hanging request once its signal aborts.
   *
   * :param signal: The request's abort signal.
   * :param keepAlive: The interval that kept the process running.
   * :param reject: The promise's reject function.
   */
  static abort(signal, keepAlive, reject) {
    clearInterval(keepAlive);
    reject(signal.reason);
  }

  /**
   * Do nothing. The keep-alive interval calls it.
   */
  static idle() {}

  /**
   * Swap a code for a key when the verifier matches the code's challenge.
   *
   * :param init: The fetch options of the request.
   * :return: The key, or a 403 error as OpenRouter sends it.
   */
  exchangeKey(init) {
    const body = JSON.parse(init.body);
    this.exchanges.push(body);
    const entry = this.codes.get(body.code);
    const challenge = createHash("sha256").update(String(body.code_verifier || "")).digest("base64url");
    if (!entry || body.code_challenge_method !== "S256" || challenge !== entry.challenge) {
      return MockOpenRouter.json(403, {
        error: {
          message: "Invalid code or code_verifier",
          code: 403,
        },
      });
    }
    this.codes.delete(body.code);
    return MockOpenRouter.json(200, {
      key: entry.key,
      user_id: "user_mock",
    });
  }

  /**
   * Record a chat request's key and model, and answer with one streamed message.
   *
   * :param init: The fetch options of the request.
   * :return: A server-sent events response with one chunk.
   */
  chat(init) {
    const body = JSON.parse(init.body);
    this.chats.push({
      authorization: new Headers(init.headers).get("authorization"),
      model: body.model,
    });
    const chunk = {
      model: body.model,
      choices: [
        {
          delta: { content: "Hello from the mock." },
          finish_reason: "stop",
        },
      ],
    };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  /**
   * Build a JSON response.
   *
   * :param status: The HTTP status.
   * :param body: The body, before it is turned into JSON.
   * :return: The response.
   */
  static json(status, body) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

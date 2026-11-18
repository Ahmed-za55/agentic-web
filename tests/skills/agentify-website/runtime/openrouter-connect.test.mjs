// Checks the Connect with OpenRouter sign-in against a mock OpenRouter.
// Run from the repository root: node --test "tests/**/*.test.mjs"
// The mock answers every request and the keys are made up. Nothing is sent anywhere.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  getSelectedByokProfile,
  loadByokStore,
  loadTabByokSetup,
} from "../../../../skills/agentify-website/runtime/byok.js";
import { LlmClient } from "../../../../skills/agentify-website/runtime/llm.js";
import { OpenRouterConnect } from "../../../../skills/agentify-website/runtime/openrouter-connect.js";
import { FakeBrowser } from "./fake_browser.mjs";
import { MockOpenRouter } from "./mock_openrouter.mjs";

/**
 * Tests the OpenRouter sign-in: start(), finish() and the saved key.
 *
 * Each test opens a fake tab on a booking page, signs in on the mock OpenRouter and
 * checks the address, the saved setup and the requests the mock received.
 */
class TestOpenRouterConnect {
  /**
   * The page the visitor starts the sign-in from. Its query and fragment must come back.
   */
  static PAGE = "https://tours.example/book/?runner=langchain#chat";

  /**
   * The key label the panel would send for this site.
   */
  static LABEL = "Harbor Tours (tours.example)";

  /**
   * The session storage item that holds the pending sign-in.
   */
  static PENDING = OpenRouterConnect.PENDING_ITEM;

  /**
   * Open a fake tab on a page, with a fresh mock OpenRouter.
   *
   * :param page: The page's address.
   * :return: The tab, already installed as the page's globals.
   */
  static open(page = TestOpenRouterConnect.PAGE) {
    const browser = new FakeBrowser(page, new MockOpenRouter());
    browser.install();
    return browser;
  }

  /**
   * Start a sign-in and approve it on the mock, without finishing it.
   *
   * :param browser: The tab.
   * :return: The callback address the mock sent the visitor to.
   */
  static async approve(browser) {
    await OpenRouterConnect.start(TestOpenRouterConnect.LABEL);
    return browser.openRouter.approve(browser.assigned.at(-1));
  }

  /**
   * Change one field of the pending sign-in, as if the tab had kept another value.
   *
   * :param browser: The tab.
   * :param field: The field's name.
   * :param value: Its new value.
   */
  static editPending(browser, field, value) {
    const pending = JSON.parse(browser.session.getItem(TestOpenRouterConnect.PENDING));
    pending[field] = value;
    browser.session.setItem(TestOpenRouterConnect.PENDING, JSON.stringify(pending));
  }

  /**
   * Return the S256 challenge of a verifier, computed with Node's crypto.
   *
   * :param verifier: The PKCE verifier.
   * :return: The base64url SHA-256 of the verifier.
   */
  static challengeOf(verifier) {
    return createHash("sha256").update(verifier).digest("base64url");
  }

  /**
   * start() sends the visitor to OpenRouter with an S256 challenge, a state and the key
   * label. The callback is the page's path, and the verifier stays out of the URL.
   */
  static async testStartSendsChallenge() {
    const browser = TestOpenRouterConnect.open();
    try {
      await OpenRouterConnect.start(TestOpenRouterConnect.LABEL);
      const authUrl = new URL(browser.assigned.at(-1));
      const pending = JSON.parse(browser.session.getItem(TestOpenRouterConnect.PENDING));
      assert.equal(authUrl.origin + authUrl.pathname, "https://openrouter.ai/auth");
      assert.equal(authUrl.searchParams.get("callback_url"), "https://tours.example/book/");
      assert.equal(authUrl.searchParams.get("code_challenge_method"), "S256");
      assert.equal(authUrl.searchParams.get("code_challenge"), TestOpenRouterConnect.challengeOf(pending.verifier));
      assert.equal(authUrl.searchParams.get("state"), pending.state);
      assert.equal(authUrl.searchParams.get("key_label"), TestOpenRouterConnect.LABEL);
      assert.ok(pending.verifier.length >= 43, "A PKCE verifier needs at least 43 characters.");
      assert.ok(!authUrl.href.includes(pending.verifier), "The verifier must not be in the URL.");
    } finally {
      browser.restore();
    }
  }

  /**
   * After approval, finish() removes the code from the address, saves the key as this
   * tab's OpenRouter setup, and a model call then sends that key to OpenRouter.
   */
  static async testSignInSavesAndUsesKey() {
    const browser = TestOpenRouterConnect.open();
    try {
      browser.visit(await TestOpenRouterConnect.approve(browser));
      assert.ok(browser.search.includes("code="), "The mock did not send a code back.");
      const result = await OpenRouterConnect.finish();
      assert.equal(result?.status, "connected");
      assert.equal(browser.href, TestOpenRouterConnect.PAGE, "The code or state stayed in the address.");
      assert.equal(browser.session.getItem(TestOpenRouterConnect.PENDING), null);

      const setup = loadTabByokSetup();
      assert.equal(setup.key, "sk-or-v1-mock-key-1");
      assert.equal(setup.router, OpenRouterConnect.ROUTER);
      assert.equal(setup.model, OpenRouterConnect.MODEL);
      assert.equal(getSelectedByokProfile()?.name, "OpenRouter");
      assert.equal(getSelectedByokProfile()?.key, setup.key);

      const client = new LlmClient({
        baseUrl: setup.router,
        apiKey: setup.key,
      });
      await client.chat({
        model: setup.model,
        messages: [
          {
            role: "user",
            content: "Hi",
          },
        ],
      });
      assert.equal(browser.openRouter.chats.length, 1);
      assert.equal(browser.openRouter.chats[0].authorization, `Bearer ${setup.key}`);
      assert.equal(browser.openRouter.chats[0].model, "google/gemma-4-31b-it:free");
    } finally {
      browser.restore();
    }
  }

  /**
   * A reply whose state differs from the one this tab sent is refused before any key
   * exchange, and the code is still removed from the address.
   */
  static async testWrongStateRefused() {
    const browser = TestOpenRouterConnect.open();
    try {
      const back = new URL(await TestOpenRouterConnect.approve(browser));
      back.searchParams.set("state", "someone-else");
      browser.visit(back.href);
      const result = await OpenRouterConnect.finish();
      assert.equal(result?.status, "failed");
      assert.match(result.message, /did not match/);
      assert.equal(browser.href, TestOpenRouterConnect.PAGE);
      assert.equal(browser.openRouter.exchanges.length, 0);
      assert.equal(loadTabByokSetup().key, "");
    } finally {
      browser.restore();
    }
  }

  /**
   * A code that OpenRouter refuses, here because the verifier is wrong, saves nothing and
   * shows OpenRouter's reason.
   */
  static async testRefusedCodeSavesNothing() {
    const browser = TestOpenRouterConnect.open();
    try {
      browser.visit(await TestOpenRouterConnect.approve(browser));
      TestOpenRouterConnect.editPending(browser, "verifier", "not-the-verifier-sent-with-the-challenge-xx");
      const result = await OpenRouterConnect.finish();
      assert.equal(result?.status, "failed");
      assert.match(result.message, /Invalid code or code_verifier/);
      assert.equal(browser.openRouter.exchanges.length, 1);
      assert.equal(browser.href, TestOpenRouterConnect.PAGE);
      assert.equal(loadTabByokSetup().key, "");
      assert.equal(loadByokStore().profiles.length, 0);
    } finally {
      browser.restore();
    }
  }

  /**
   * A code that came back more than 10 minutes after the sign-in started is refused
   * without asking OpenRouter.
   */
  static async testExpiredSignInRefused() {
    const browser = TestOpenRouterConnect.open();
    try {
      browser.visit(await TestOpenRouterConnect.approve(browser));
      TestOpenRouterConnect.editPending(browser, "startedAt", Date.now() - 11 * 60 * 1000);
      const result = await OpenRouterConnect.finish();
      assert.equal(result?.status, "failed");
      assert.match(result.message, /more than 10 minutes/);
      assert.equal(browser.openRouter.exchanges.length, 0);
      assert.equal(browser.href, TestOpenRouterConnect.PAGE);
    } finally {
      browser.restore();
    }
  }

  /**
   * When OpenRouter does not answer the key exchange in time, the sign-in fails and the
   * page goes on, so boot() never waits forever.
   */
  static async testUnansweredExchangeTimesOut() {
    const browser = TestOpenRouterConnect.open();
    const timeout = OpenRouterConnect.EXCHANGE_TIMEOUT_MS;
    try {
      browser.visit(await TestOpenRouterConnect.approve(browser));
      browser.openRouter.hangExchange = true;
      OpenRouterConnect.EXCHANGE_TIMEOUT_MS = 50;
      const result = await OpenRouterConnect.finish();
      assert.equal(result?.status, "failed");
      assert.match(result.message, /could not reach OpenRouter/);
      assert.equal(browser.href, TestOpenRouterConnect.PAGE);
      assert.equal(loadTabByokSetup().key, "");
    } finally {
      OpenRouterConnect.EXCHANGE_TIMEOUT_MS = timeout;
      browser.restore();
    }
  }

  /**
   * A page's own `code` parameter is left alone when this tab started no sign-in.
   */
  static async testPageCodeLeftAlone() {
    const page = "https://tours.example/book/?code=SPRING10";
    const browser = TestOpenRouterConnect.open(page);
    try {
      assert.equal(await OpenRouterConnect.finish(), null);
      assert.equal(browser.href, page);
      assert.equal(browser.openRouter.exchanges.length, 0);
    } finally {
      browser.restore();
    }
  }

  /**
   * Coming back without a code, for example with the Back button, ends the sign-in and
   * tells the visitor, and saves nothing.
   */
  static async testCancelledSignIn() {
    const browser = TestOpenRouterConnect.open();
    try {
      await OpenRouterConnect.start(TestOpenRouterConnect.LABEL);
      browser.visit(TestOpenRouterConnect.PAGE);
      const result = await OpenRouterConnect.finish();
      assert.equal(result?.status, "cancelled");
      assert.equal(browser.session.getItem(TestOpenRouterConnect.PENDING), null);
      assert.equal(loadTabByokSetup().key, "");
      assert.equal(await OpenRouterConnect.finish(), null, "A sign-in must finish only once.");
    } finally {
      browser.restore();
    }
  }

  /**
   * Connecting again replaces the key in the same setup instead of adding another setup.
   */
  static async testConnectAgainKeepsOneSetup() {
    const browser = TestOpenRouterConnect.open();
    try {
      for (let round = 0; round < 2; round += 1) {
        browser.visit(await TestOpenRouterConnect.approve(browser));
        assert.equal((await OpenRouterConnect.finish())?.status, "connected");
      }
      let openRouterSetups = 0;
      for (const profile of loadByokStore().profiles) {
        if (profile.name === "OpenRouter") openRouterSetups += 1;
      }
      assert.equal(openRouterSetups, 1);
      assert.equal(getSelectedByokProfile()?.key, "sk-or-v1-mock-key-2");
    } finally {
      browser.restore();
    }
  }

  /**
   * The settings link holds the key's SHA-256 in hex, as OpenRouter's docs describe.
   */
  static async testKeySettingsUrl() {
    const key = "sk-or-v1-made-up-example";
    const hex = createHash("sha256").update(key).digest("hex");
    assert.equal(await OpenRouterConnect.keySettingsUrl(key), `https://openrouter.ai/keys/${hex}`);
  }

  /**
   * The Connect button works only in a secure context and when the page is not in a frame.
   */
  static testNeedsOwnSecureTab() {
    const browser = TestOpenRouterConnect.open();
    try {
      assert.equal(OpenRouterConnect.isAvailable(), true);
      globalThis.isSecureContext = false;
      assert.equal(OpenRouterConnect.isAvailable(), false);
      globalThis.isSecureContext = true;
      globalThis.top = {};
      assert.equal(OpenRouterConnect.isAvailable(), false);
    } finally {
      browser.restore();
    }
  }
}

test("start() sends an S256 challenge, a state and the key label", TestOpenRouterConnect.testStartSendsChallenge);
test("a finished sign-in clears the address, saves the key and uses it", TestOpenRouterConnect.testSignInSavesAndUsesKey);
test("a reply with the wrong state is refused", TestOpenRouterConnect.testWrongStateRefused);
test("a code OpenRouter refuses saves nothing", TestOpenRouterConnect.testRefusedCodeSavesNothing);
test("a code older than 10 minutes is refused", TestOpenRouterConnect.testExpiredSignInRefused);
test("an unanswered key exchange times out", TestOpenRouterConnect.testUnansweredExchangeTimesOut);
test("a page's own code parameter is left alone", TestOpenRouterConnect.testPageCodeLeftAlone);
test("coming back without a code cancels the sign-in", TestOpenRouterConnect.testCancelledSignIn);
test("connecting again keeps one OpenRouter setup", TestOpenRouterConnect.testConnectAgainKeepsOneSetup);
test("the key settings link uses the key's SHA-256", TestOpenRouterConnect.testKeySettingsUrl);
test("the Connect button needs its own secure tab", TestOpenRouterConnect.testNeedsOwnSecureTab);

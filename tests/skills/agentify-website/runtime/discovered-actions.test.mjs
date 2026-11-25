// Checks that a discovered form action fills its form without touching the live page.
// Run from the repository root: node --test "tests/**/*.test.mjs"
// The parsed page, its form and FormData are stand-ins. The test removes the global
// document, so any use of the live page makes the action fail.
import assert from "node:assert/strict";
import test from "node:test";
import { registerDiscoveredActions } from "../../../../skills/agentify-website/runtime/discovered-actions.js";
import { sha256Hex } from "../../../../skills/agentify-website/runtime/web-crypto.js";
import { StubFormData } from "./stub_form_data.mjs";
import { StubFormParser } from "./stub_form_parser.mjs";

/**
 * Tests that a discovered form action fills a copy of the source page's form inside the
 * parsed page. That page has no window, so nothing in the form loads or runs.
 *
 * The class also stands in for the action registry and for fetch.
 */
class TestDiscoveredActions {
  /**
   * The page the form is read from.
   */
  static PAGE = "https://shop.example/order.html";

  /**
   * The address the form sends to.
   */
  static ENDPOINT = "https://shop.example/order";

  /**
   * The globals the test replaces and puts back.
   */
  static GLOBALS = ["DOMParser", "FormData", "fetch", "document"];

  /**
   * The actions registered so far.
   */
  static registered = [];

  /**
   * The addresses fetched so far.
   */
  static requests = [];

  /**
   * Record an action, as the action registry does.
   *
   * :param definition: The action's name, schema, policy and execute function.
   */
  static register(definition) {
    TestDiscoveredActions.registered.push(definition);
  }

  /**
   * Answer a request: the form page with an empty form, or the form's answer.
   *
   * :param url: The address, as a string or URL.
   * :param init: The request options, unused.
   * :return: A promise of the response.
   */
  static async fetch(url, init) {
    TestDiscoveredActions.requests.push(String(url));
    if (String(url) === TestDiscoveredActions.PAGE) {
      return new Response("<form></form>", { headers: { "Content-Type": "text/html" } });
    }
    return new Response("Order received", { headers: { "Content-Type": "text/plain" } });
  }

  /**
   * A catalog with one form action whose fingerprint matches the stub form.
   *
   * :return: A promise of the catalog.
   */
  static async catalog() {
    // Discovery fingerprints a form by its attributes and controls. The stub form has none.
    const contract = {
      attributes: {},
      controls: [],
    };
    const action = {
      enabled: true,
      name: "website_order_status",
      description: "Look up an order.",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {},
      },
      request: {
        kind: "form",
        method: "GET",
        page: TestDiscoveredActions.PAGE,
        url: TestDiscoveredActions.ENDPOINT,
        index: 0,
        fingerprint: await sha256Hex(JSON.stringify(contract)),
      },
    };
    return {
      version: 1,
      actions: [action],
    };
  }

  /**
   * Replace globals, keeping what was there.
   *
   * :param values: The new value of each name in GLOBALS.
   * :return: Each name's old property descriptor, or undefined where there was none.
   */
  static replaceGlobals(values) {
    const saved = new Map();
    for (const name of TestDiscoveredActions.GLOBALS) {
      saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, {
        value: values[name],
        configurable: true,
        writable: true,
      });
    }
    return saved;
  }

  /**
   * Put back the globals replaceGlobals replaced.
   *
   * :param saved: What replaceGlobals returned.
   */
  static restoreGlobals(saved) {
    for (const [name, descriptor] of saved) {
      if (descriptor === undefined) {
        delete globalThis[name];
      } else {
        Object.defineProperty(globalThis, name, descriptor);
      }
    }
  }

  /**
   * The action fills a full copy of the parsed form and sends it, with no live page at all.
   */
  static async testFormIsFilledInsideTheParsedPage() {
    const saved = TestDiscoveredActions.replaceGlobals({
      DOMParser: StubFormParser,
      FormData: StubFormData,
      fetch: TestDiscoveredActions.fetch,
      document: undefined,
    });
    try {
      registerDiscoveredActions(TestDiscoveredActions, await TestDiscoveredActions.catalog());
      const result = await TestDiscoveredActions.registered[0].execute({}, {});
      assert.equal(result.httpStatus, 200);
      assert.deepEqual(TestDiscoveredActions.requests, [TestDiscoveredActions.PAGE, TestDiscoveredActions.ENDPOINT]);
      assert.equal(StubFormData.lastForm.source, StubFormParser.lastForm);
      assert.equal(StubFormData.lastForm.deep, true);
    } finally {
      TestDiscoveredActions.restoreGlobals(saved);
    }
  }
}

test("a discovered form is filled inside the parsed page, not the live one", TestDiscoveredActions.testFormIsFilledInsideTheParsedPage);

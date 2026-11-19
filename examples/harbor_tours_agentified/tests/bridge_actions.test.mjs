// Checks the reads and the booking this site shares with other agent sites through its
// action bridge (bridge/bridge-actions.js). Each read is for the callers it lists that the
// page's agents may also call, takes the same input as the page's action of that name, and
// answers as the page's own action does, without the basket and panels only the page has.
// The booking is for the guesthouse, and keeps the visitor's details in this site's window.
// These tests use the real page code with a stub document. They call no LLM provider.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SiteHarness } from "./site_harness.mjs";
import { StubParser } from "./stub_parser.mjs";

const { registerActions } = await import("../bridge/bridge-actions.js");
const { BookingWindow } = await import("../bridge/booking-window.js");
const { TripBook } = await import("../js/trip-book.js");
// The page's HTML, which the bridge fetches for its facts.
const PAGE_HTML = await readFile(new URL("../index.html", import.meta.url), "utf8");

/**
 * Compares each shared read with the page's action of the same name.
 */
class BridgeActionsTest {
  /**
   * This site's own origin in the local three-site setup. It never needs to call itself.
   */
  static OWN_ORIGIN = "http://localhost:8081";

  /**
   * The state the page keeps and a partner has none of.
   */
  static PAGE_ONLY = ["basket", "search", "confirmation", "managePanel"];

  /**
   * The booking, which only the bridge shares and which runs in this site's own window.
   */
  static BOOKING = "book_departure";

  /**
   * List the bridge's actions by name.
   *
   * :return: A map of name to definition.
   */
  static async shared() {
    const definitions = [];
    await registerActions({register: definitions.push.bind(definitions)});
    const byName = new Map();
    for (const definition of definitions) {
      byName.set(definition.name, definition);
    }
    return byName;
  }

  /**
   * List the page's registered actions by name.
   *
   * :return: A map of name to registry entry.
   */
  static async page() {
    const registry = await SiteHarness.registry();
    const byName = new Map();
    for (const entry of registry.entries.values()) {
      byName.set(entry.name, entry);
    }
    return byName;
  }

  /**
   * Answer the bridge's fetch of the page with its HTML.
   *
   * :param url: The address fetched.
   * :return: The response.
   */
  static async fetchPage(url) {
    if (String(url).endsWith("/index.html")) {
      return new Response(PAGE_HTML, {status: 200});
    }
    return new Response("Not found", {status: 404});
  }

  /**
   * Run a bridge read that fetches and parses the page, with stand-ins for both.
   *
   * :param definition: The bridge action.
   * :param args: Its arguments.
   * :return: Its result.
   */
  static async withPage(definition, args) {
    const saved = {
      fetch: globalThis.fetch,
      parser: globalThis.DOMParser,
    };
    globalThis.fetch = BridgeActionsTest.fetchPage;
    globalThis.DOMParser = StubParser;
    StubParser.url = `${SiteHarness.BASE}/`;
    try {
      return await definition.execute(args);
    } finally {
      globalThis.fetch = saved.fetch;
      if (saved.parser === undefined) {
        delete globalThis.DOMParser;
      } else {
        globalThis.DOMParser = saved.parser;
      }
    }
  }

  /**
   * The bridge shares three reads and the booking. Each read is for the callers it lists,
   * each an exact origin other than this site's or "*", and the page registers an action
   * of the same name that the manifest lets agents call.
   */
  static async testSharedReadsAreForListedCallers() {
    const manifest = JSON.parse(await readFile(new URL("../agent-manifest.json", import.meta.url), "utf8"));
    const page = await BridgeActionsTest.page();
    const shared = await BridgeActionsTest.shared();
    assert.deepEqual([...shared.keys()], ["get_tours_state", "get_good_to_know", "find_departures", BridgeActionsTest.BOOKING]);
    for (const [name, definition] of shared) {
      if (name === BridgeActionsTest.BOOKING) {
        continue;
      }
      assert.equal(definition.effect, "read", `${name} is not a read.`);
      assert.equal(definition.availability, "bridge", `${name} is not shared through the bridge.`);
      assert.ok(definition.callerOrigins.length > 0, `${name} lists no callers.`);
      for (const origin of definition.callerOrigins) {
        // "*" shares the read with every site, which the linking guide allows for public facts.
        if (origin === "*") {
          continue;
        }
        assert.equal(new URL(origin).origin, origin, `${name} lists ${origin}, which is neither an exact origin nor "*".`);
        assert.notEqual(origin, BridgeActionsTest.OWN_ORIGIN, `${name} lists this site's own origin.`);
      }
      assert.ok(manifest.actions.agentTools.includes(name), `${name} is not in actions.agentTools, so partner agents never get it.`);
      assert.ok(page.has(name), `The page has no ${name}, so the network's instructions may not fit it.`);
    }
  }

  /**
   * Each shared read takes exactly the input of the page's action of the same name.
   */
  static async testSharedReadsTakeThePageInput() {
    const page = await BridgeActionsTest.page();
    for (const [name, definition] of await BridgeActionsTest.shared()) {
      if (name === BridgeActionsTest.BOOKING) {
        continue;
      }
      assert.deepEqual(definition.inputSchema, page.get(name).inputSchema, `${name} takes other input than the page's.`);
    }
  }

  /**
   * The shared state read gives the page's own state and facts, without the basket and the
   * panels only the page has.
   */
  static async testStateReadMatchesThePage() {
    const page = await BridgeActionsTest.page();
    const shared = await BridgeActionsTest.shared();
    const pageState = await page.get("get_tours_state").execute({});
    const bridgeState = await BridgeActionsTest.withPage(shared.get("get_tours_state"), {});
    for (const key of Object.keys(bridgeState)) {
      assert.deepEqual(bridgeState[key], pageState[key], `${key} differs from the page's.`);
    }
    assert.ok(Object.keys(bridgeState).includes("pageFacts"));
    for (const key of BridgeActionsTest.PAGE_ONLY) {
      assert.equal(bridgeState[key], undefined, `The shared state has ${key}, which only the page has.`);
    }
  }

  /**
   * Without a browser, the state read says so instead of sending a request.
   */
  static async testStateReadNeedsABrowser() {
    const shared = await BridgeActionsTest.shared();
    await assert.rejects(shared.get("get_tours_state").execute({}), /needs a browser/);
  }

  /**
   * find_departures gives what the page's own action gives, from a fresh trip book.
   */
  static async testDeparturesMatchThePage() {
    const page = await BridgeActionsTest.page();
    const shared = await BridgeActionsTest.shared();
    const args = {
      date: "2026-11-13",
      adults: 2,
      children: 1,
      under4s: 0,
    };
    const result = await shared.get("find_departures").execute(args);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result, await page.get("find_departures").execute(args));
  }

  /**
   * The booking is irreversible, for the guesthouse only, and confirmed in this site's
   * window. Its input holds the trip and the tickets and no personal details, since the
   * visitor types those in the window.
   */
  static async testBookingIsForTheGuesthouse() {
    const manifest = JSON.parse(await readFile(new URL("../agent-manifest.json", import.meta.url), "utf8"));
    const booking = (await BridgeActionsTest.shared()).get(BridgeActionsTest.BOOKING);
    assert.equal(booking.effect, "irreversible");
    assert.equal(booking.availability, "bridge");
    assert.equal(booking.confirmsInWindow, true, "The window's own form confirms the booking.");
    assert.deepEqual(booking.callerOrigins, ["http://127.0.0.1:8080"]);
    assert.deepEqual(Object.keys(booking.inputSchema.properties), ["tourId", "date", "time", "adults", "children", "under4s"]);
    assert.ok(booking.description.includes("never ask for them"), "The description says not to ask for the visitor's details.");
    assert.ok(manifest.actions.agentTools.includes(BridgeActionsTest.BOOKING), "The booking is not in actions.agentTools, so partner agents never get it.");
  }

  /**
   * A trip the site would refuse gets its reason at once, before any window opens.
   */
  static testBookingRefusesBeforeAWindow() {
    // The sea wall walk does not run on Fridays.
    const result = BookingWindow.book({
      tourId: "sea-wall-walk",
      date: "2026-11-13",
      time: "10:30",
      adults: 2,
      children: 0,
      under4s: 0,
    }, {callerOrigin: "http://127.0.0.1:8080"});
    assert.equal(result.ok, false);
    assert.ok(result.reason, "The refusal gives the site's reason.");
  }

  /**
   * What the booking returns to the calling assistant has the code and the trip, and
   * leaves out the visitor's name, email and phone.
   */
  static testBookingKeepsDetailsInTheWindow() {
    const trip = TripBook.copyTrip({
      tourId: "seal-rocks",
      date: "2026-11-13",
      time: "10:00",
      adults: 2,
      children: 0,
      under4s: 0,
    });
    const result = new TripBook().reserve([trip], {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "555 0100 200",
      notes: "",
    });
    assert.ok(result.reservation, JSON.stringify(result.errors));
    const described = BookingWindow.describe(result.reservation);
    assert.deepEqual(Object.keys(described), ["ok", "code", "status", "trips", "total", "cancelBy", "note"]);
    assert.equal(described.code, result.reservation.code);
    assert.equal(described.total, "$79.00");
    const text = JSON.stringify(described);
    for (const detail of ["Ada", "Lovelace", "ada@example.com", "555 0100 200"]) {
      assert.ok(!text.includes(detail), `${detail} went back to the chat.`);
    }
  }
}

test("each shared action is a read for the callers it lists that the page's agents may call", BridgeActionsTest.testSharedReadsAreForListedCallers);
test("each shared read takes the input of the page's action of that name", BridgeActionsTest.testSharedReadsTakeThePageInput);
test("the shared state read matches the page's, without the page's own panels", BridgeActionsTest.testStateReadMatchesThePage);
test("without a browser, the shared state read says it needs one", BridgeActionsTest.testStateReadNeedsABrowser);
test("find_departures gives what the page gives", BridgeActionsTest.testDeparturesMatchThePage);
test("the shared booking is for the guesthouse and confirmed in this site's window", BridgeActionsTest.testBookingIsForTheGuesthouse);
test("the shared booking refuses a trip the site would refuse, before any window opens", BridgeActionsTest.testBookingRefusesBeforeAWindow);
test("the shared booking keeps the visitor's name, email and phone in the window", BridgeActionsTest.testBookingKeepsDetailsInTheWindow);

// Checks which site actions the skill's runtime gives an agent as website_* tools. The
// visitor's own site gets its local-only actions. A partner network gets only the actions
// its own bridge shares with this page, never this page's actions, and its writes are
// confirmed in its own window, not with this page's dialog.
// Run from the repository root: node --test "tests/**/*.test.mjs"
// The registry and the network are built in memory. No model is called.
import assert from "node:assert/strict";
import test from "node:test";
import { ActionRegistry } from "../../../../skills/agentify-website/runtime/actions.js";
import { AgentNetwork } from "../../../../skills/agentify-website/runtime/kernel.js";
import { buildToolTable, dispatchToolCall, websiteToolRefusal } from "../../../../skills/agentify-website/runtime/runner.js";

/**
 * Builds a page's action registry with the page's own actions and a partner's shared
 * ones, then asks the runtime which become tools for each network.
 */
class WebsiteToolTest {
  /**
   * The visitor's page and the partner it calls.
   */
  static PAGE = "http://127.0.0.1:8080";
  static PARTNER = "http://localhost:8081";

  /**
   * A network with one agent and no other tools, for the page or the partner.
   *
   * :param name: The network name.
   * :return: The AgentNetwork.
   */
  static network(name) {
    return new AgentNetwork({
      tools: [
        {
          name: "front",
          instructions: "Answer the visitor.",
          tools: [],
        },
      ],
    }, name);
  }

  /**
   * Describe an action, as a site module or a bridge catalog does.
   *
   * :param name: The action name.
   * :param effect: "read", "write" or "irreversible".
   * :param availability: "local-only", "bridge" or "top-level".
   * :return: The action definition.
   */
  static definition(name, effect, availability) {
    return {
      name: name,
      description: `The ${name} action.`,
      effect: effect,
      availability: availability,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: WebsiteToolTest.answer.bind(null, name),
    };
  }

  /**
   * Answer an action call with its name.
   *
   * :param name: The action name.
   * :return: A result that names the action.
   */
  static answer(name) {
    return {
      ok: true,
      ran: name,
    };
  }

  /**
   * Register the page's own actions and the partner's shared ones, as the engine does:
   * the page's from its module, the partner's from its bridge catalog.
   *
   * :return: The registry.
   */
  static registry() {
    const registry = new ActionRegistry();
    const page = {
      base: WebsiteToolTest.PAGE,
      network: "guesthouse",
    };
    const partner = {
      base: WebsiteToolTest.PARTNER,
      network: "tours",
    };
    registry.register(page, WebsiteToolTest.definition("get_state", "read", "local-only"));
    registry.register(page, WebsiteToolTest.definition("place_booking", "irreversible", "local-only"));
    registry.register(partner, WebsiteToolTest.definition("find_departures", "read", "bridge"));
    registry.register(partner, WebsiteToolTest.definition("get_hidden", "read", "bridge"));
    registry.register(partner, WebsiteToolTest.definition("book_departure", "irreversible", "bridge"));
    registry.register(partner, WebsiteToolTest.definition("get_in_window", "read", "top-level"));
    return registry;
  }

  /**
   * The runner context for the page's own network or for the partner's.
   *
   * :param registry: The registry from registry().
   * :param isTop: True for the visitor's own site, false for the partner.
   * :return: The context.
   */
  static context(registry, isTop) {
    const name = isTop ? "guesthouse" : "tours";
    // Each site lists in agentTools the actions its own agents may call. The partner leaves
    // out get_hidden, so its agents never get it, though its bridge shares it.
    const agentTools = isTop ? ["get_state", "place_booking"] : ["find_departures", "book_departure", "get_in_window"];
    return {
      network: WebsiteToolTest.network(name),
      manifest: {
        actions: {
          agentTools: agentTools,
        },
      },
      actions: registry,
      baseOrigin: isTop ? WebsiteToolTest.PAGE : WebsiteToolTest.PARTNER,
      displayOrigin: isTop ? "127.0.0.1:8080" : "localhost:8081",
      isTop: isTop,
      confirmWebsiteActions: WebsiteToolTest.approve,
      trace: {
        note: WebsiteToolTest.ignore,
      },
    };
  }

  /**
   * Approve every confirmation, as a visitor who clicks the confirm button.
   *
   * :return: True.
   */
  static async approve() {
    return true;
  }

  /**
   * Decline every confirmation, as a visitor who clicks Cancel in the page's dialog.
   *
   * :return: False.
   */
  static async decline() {
    return false;
  }

  /**
   * Take a trace note and do nothing.
   */
  static ignore() {}

  /**
   * List the website tools one network's agent gets.
   *
   * :param ctx: The context.
   * :return: The tool names.
   */
  static async websiteTools(ctx) {
    const table = await buildToolTable(ctx, ctx.network.getAgentSpec("front"), [], null);
    const names = [];
    for (const name of table.toolByName.keys()) {
      if (name.startsWith("website_")) {
        names.push(name);
      }
    }
    return names;
  }

  /**
   * The visitor's own site gets its local-only actions, and never the partner's.
   */
  static async testOwnSiteGetsItsLocalActions() {
    const ctx = WebsiteToolTest.context(WebsiteToolTest.registry(), true);
    assert.deepEqual(await WebsiteToolTest.websiteTools(ctx), ["website_get_state", "website_place_booking"]);
  }

  /**
   * A partner gets only the actions its bridge shares that its own agentTools lists, reads
   * and writes: not one that needs a top-level window on every call, not one it leaves out
   * of agentTools, and never the page's own actions.
   */
  static async testPartnerGetsOnlyItsSharedActions() {
    const ctx = WebsiteToolTest.context(WebsiteToolTest.registry(), false);
    assert.deepEqual(await WebsiteToolTest.websiteTools(ctx), ["website_find_departures", "website_book_departure"]);
  }

  /**
   * Each refusal says why, for the visitor's site and for a partner.
   */
  static testRefusalReasons() {
    const registry = WebsiteToolTest.registry();
    const top = WebsiteToolTest.context(registry, true);
    const partner = WebsiteToolTest.context(registry, false);
    const cases = [
      {
        ctx: partner,
        action: WebsiteToolTest.definition("find_departures", "read", "bridge"),
        reason: "",
      },
      {
        ctx: partner,
        action: WebsiteToolTest.definition("get_hidden", "read", "bridge"),
        reason: "not listed in the manifest's actions.agentTools",
      },
      {
        ctx: partner,
        action: WebsiteToolTest.definition("book_departure", "irreversible", "bridge"),
        reason: "",
      },
      {
        ctx: partner,
        action: WebsiteToolTest.definition("get_in_window", "read", "top-level"),
        reason: "a partner network gets only actions its bridge shares",
      },
      {
        ctx: partner,
        action: WebsiteToolTest.definition("find_departures", "read", "local-only"),
        reason: "a partner network gets only actions its bridge shares",
      },
      {
        ctx: top,
        action: WebsiteToolTest.definition("get_state", "read", "bridge"),
        reason: "not a local-only action",
      },
      {
        ctx: Object.assign({}, top, {confirmWebsiteActions: undefined}),
        action: WebsiteToolTest.definition("place_booking", "irreversible", "local-only"),
        reason: "irreversible, and the page has no confirmation dialog",
      },
      {
        ctx: top,
        action: null,
        reason: "no such action is registered for this network",
      },
    ];
    for (const item of cases) {
      assert.equal(websiteToolRefusal(item.ctx, item.action), item.reason, JSON.stringify(item.action));
    }
  }

  /**
   * List each registered action's ref by "<base>#<name>".
   *
   * :param registry: The registry.
   * :return: The refs.
   */
  static refs(registry) {
    const refs = new Map();
    for (const entry of registry.entries.values()) {
      refs.set(`${entry.base}#${entry.name}`, entry.ref);
    }
    return refs;
  }

  /**
   * A partner's call to a shared read or write runs it. A call that names a refused
   * action, or the page's own action, is refused when the model makes it, even if the
   * model guessed it.
   */
  static async testPartnerCallsAreCheckedAgain() {
    const registry = WebsiteToolTest.registry();
    const ctx = WebsiteToolTest.context(registry, false);
    const refs = WebsiteToolTest.refs(registry);
    for (const name of ["find_departures", "book_departure"]) {
      const receipt = await dispatchToolCall(ctx, {
        kind: "website",
        ref: refs.get(`${WebsiteToolTest.PARTNER}#${name}`),
      }, {}, null, []);
      assert.equal(receipt.status, "succeeded", name);
      assert.deepEqual(receipt.result, {
        ok: true,
        ran: name,
      });
    }
    const refused = [
      `${WebsiteToolTest.PARTNER}#get_hidden`,
      `${WebsiteToolTest.PARTNER}#get_in_window`,
      `${WebsiteToolTest.PAGE}#get_state`,
    ];
    for (const key of refused) {
      await assert.rejects(dispatchToolCall(ctx, {
        kind: "website",
        ref: refs.get(key),
      }, {}, null, []), /Website action is not callable by this agent\./, key);
    }
  }

  /**
   * A partner's irreversible write never asks this page's dialog: the partner's own window
   * confirms it. The page's own irreversible action still asks, so a decline stops it.
   */
  static async testOnlyThePageAsksForItsOwnWrites() {
    const registry = WebsiteToolTest.registry();
    const refs = WebsiteToolTest.refs(registry);
    const partner = Object.assign(WebsiteToolTest.context(registry, false), {confirmWebsiteActions: WebsiteToolTest.decline});
    const booked = await dispatchToolCall(partner, {
      kind: "website",
      ref: refs.get(`${WebsiteToolTest.PARTNER}#book_departure`),
    }, {}, null, []);
    assert.equal(booked.status, "succeeded", "The page's dialog was asked about the partner's write.");
    const top = Object.assign(WebsiteToolTest.context(registry, true), {confirmWebsiteActions: WebsiteToolTest.decline});
    const own = await dispatchToolCall(top, {
      kind: "website",
      ref: refs.get(`${WebsiteToolTest.PAGE}#place_booking`),
    }, {}, null, []);
    assert.equal(own.status, "cancelled", "The page's own irreversible action ran without its dialog.");
  }
}

test("the visitor's own site gets its local-only actions as tools", WebsiteToolTest.testOwnSiteGetsItsLocalActions);
test("a partner network gets only the actions its bridge shares and lists in agentTools", WebsiteToolTest.testPartnerGetsOnlyItsSharedActions);
test("each refused action gets its reason", WebsiteToolTest.testRefusalReasons);
test("a partner's calls are checked again when the model makes them", WebsiteToolTest.testPartnerCallsAreCheckedAgain);
test("only the page's own irreversible actions ask the page's dialog", WebsiteToolTest.testOnlyThePageAsksForItsOwnWrites);

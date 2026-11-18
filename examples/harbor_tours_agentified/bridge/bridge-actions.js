// The read actions this site shares with other agent sites, through its action bridge.
// bridge/agent-manifest.json loads this module in the bridge frame, which has no tour
// page. So it reads the tour data and a fresh trip book, and fetches the page's HTML for
// its facts. Each action has the name the page's own action has (site-actions.js), so the
// network's instructions fit both.
import { GoodToKnow } from "../js/good-to-know.js";
import { ToursPage } from "../js/tours-page.js";
import { TripBook } from "../js/trip-book.js";

/**
 * Shares three reads with the partner sites that call this site's network: the tours with
 * today's date and the page's facts, the departures on a date, and the Good to know page.
 *
 * A partner's agent calls them from the partner's page, and each call runs here, in a
 * hidden frame on this site's origin. The trip book starts from the site's fixed
 * reservations, like a fresh tour page. A real site would read its own server here.
 */
class BridgeActions {
  /**
   * The sites allowed to call these actions: the guesthouse and the pizza site, as exact
   * origins. These reads show only public facts, so "*" would also be allowed, but it
   * would share them with every site on the web.
   */
  static CALLERS = [
    "http://127.0.0.1:8080",
    "http://[::1]:8083",
  ];

  /**
   * The site's page and its Good to know page, next to this folder.
   */
  static PAGE = new URL("../index.html", import.meta.url).href;
  static POLICIES = new URL("../policies.html", import.meta.url).href;

  /**
   * Register the shared reads with the bridge's registry.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    actions.register(BridgeActions.toursAction());
    actions.register(BridgeActions.goodToKnowAction());
    actions.register(BridgeActions.departuresAction());
  }

  /**
   * Describe the shared read of the tours, the dates and the page's facts.
   *
   * :return: The action definition.
   */
  static toursAction() {
    return {
      name: "get_tours_state",
      description: "Read the tours (days, times, prices, ages, dogs, access), today and the next days with weekdays, the first and last bookable dates, the limits per trip, and page facts such as payment, booking, contact and where to stay, with links. Changes nothing. Call it before answering about trips or prices.",
      effect: "read",
      availability: "bridge",
      callerOrigins: BridgeActions.CALLERS,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: BridgeActions.readTours,
    };
  }

  /**
   * Read the state that needs no page, and the facts from the page's HTML.
   *
   * :return: A promise of the tours, the dates, the limits and the page's facts.
   */
  static async readTours() {
    const page = await BridgeActions.readPage(BridgeActions.PAGE);
    return Object.assign(ToursPage.siteState(), {
      pageFacts: ToursPage.factsIn(page),
    });
  }

  /**
   * Describe the shared read of the Good to know page.
   *
   * :return: The action definition.
   */
  static goodToKnowAction() {
    return {
      name: "get_good_to_know",
      description: "Read the Good to know page: tickets and ages, booking and cancelling, weather, prices and payment, the meeting point and getting here, what to bring, accessibility and dogs. Changes nothing.",
      effect: "read",
      availability: "bridge",
      callerOrigins: BridgeActions.CALLERS,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: BridgeActions.readGoodToKnow,
    };
  }

  /**
   * Read the Good to know page next to this folder.
   *
   * :return: A promise of the page's sections.
   */
  static readGoodToKnow() {
    return GoodToKnow.read(BridgeActions.POLICIES);
  }

  /**
   * Describe the shared read of the departures on a date for a party. Its input is the
   * same as the page's find_departures (a test checks it).
   *
   * :return: The action definition.
   */
  static departuresAction() {
    return {
      name: "find_departures",
      description: "List every departure on a date for a party: places left, the party's price, or the problem if it does not fit, and the trip's age limit. The site does not check children's ages against an age limit: check each child against it before you offer a trip. Changes nothing.",
      effect: "read",
      availability: "bridge",
      callerOrigins: BridgeActions.CALLERS,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["date", "adults", "children", "under4s"],
        properties: {
          adults: {
            type: "integer",
            minimum: 0,
            maximum: 50,
            description: "Adult tickets (16 and over), from the visitor.",
          },
          children: {
            type: "integer",
            minimum: 0,
            maximum: 50,
            description: "Child tickets (4 to 15), from the visitor.",
          },
          under4s: {
            type: "integer",
            minimum: 0,
            maximum: 50,
            description: "Free tickets for children under 4, from the visitor. They take no place.",
          },
          date: {
            type: "string",
            format: "date",
            description: "Trip date as YYYY-MM-DD, worked out from today in website_get_tours_state.",
          },
        },
      },
      execute: BridgeActions.findDepartures,
    };
  }

  /**
   * List the departures through a fresh trip book, with the page's own code.
   *
   * :param args: The validated date and tickets.
   * :return: The departures, or ok false with the site's reason.
   */
  static findDepartures(args) {
    // findDepartures uses only the trip book, so a page object without a document works.
    const page = Object.create(ToursPage.prototype);
    page.book = new TripBook();
    return page.findDepartures(args);
  }

  /**
   * Fetch one of the site's pages and parse it, so its facts can be read as on the page.
   *
   * :param url: The page's address.
   * :return: A promise of the parsed document, with links resolved against the page.
   * :raises Error: When there is no DOMParser, or the page cannot be read.
   */
  static async readPage(url) {
    // Check first: Node has fetch but no DOMParser, so a test never sends a real request.
    if (typeof DOMParser === "undefined") {
      throw new Error("Reading the site's page needs a browser.");
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`The site's page answered ${response.status}.`);
    }
    const page = new DOMParser().parseFromString(await response.text(), "text/html");
    // A parsed page resolves links against this frame's address. A base element makes
    // them resolve against the page's own address, as they do on the page.
    const base = page.createElement("base");
    base.href = url;
    page.head.prepend(base);
    return page;
  }
}

export const registerActions = BridgeActions.registerActions;

// The read actions this site shares with other agent sites, through its action bridge.
// bridge/agent-manifest.json loads this module in the bridge frame, which has no booking
// page. So it reads the guesthouse data and a fresh reservation book, and fetches the
// page's HTML for its facts. Each action has the name the page's own action has
// (site-actions.js), so the network's instructions fit both.
import { BookingPage } from "../js/booking-page.js";
import { GuesthouseData } from "../js/guesthouse-data.js";
import { HousePolicies } from "../js/house-policies.js";
import { ReservationBook } from "../js/reservation-book.js";

/**
 * Shares four reads with the partner sites that call this site's network: the rooms with
 * today's date and the page's facts, the house policies, the free rooms for a stay, and
 * the price of a stay.
 *
 * A partner's agent calls them from the partner's page, and each call runs here, in a
 * hidden frame on this site's origin. The reservation book starts from the site's fixed
 * bookings, like a fresh booking page. A real site would read its own server here.
 */
class BridgeActions {
  /**
   * The sites allowed to call these actions: the tour site and the pizza site, as exact
   * origins. These reads show only public facts, so "*" would also be allowed, but it
   * would share them with every site on the web.
   */
  static CALLERS = [
    "http://localhost:8081",
    "http://[::1]:8083",
  ];

  /**
   * The site's page, next to this folder.
   */
  static PAGE = new URL("../index.html", import.meta.url).href;

  /**
   * Register the shared reads with the bridge's registry.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    actions.register(BridgeActions.readStateAction());
    actions.register(BridgeActions.readPoliciesAction());
    actions.register(BridgeActions.searchRoomsAction());
    actions.register(BridgeActions.quoteStayAction());
  }

  /**
   * List the ids of the rooms or the extras.
   *
   * :param list: GuesthouseData.ROOMS or GuesthouseData.EXTRAS.
   * :return: The ids.
   */
  static ids(list) {
    const ids = [];
    for (const item of list) {
      ids.push(item.id);
    }
    return ids;
  }

  /**
   * Describe a date argument.
   *
   * :param description: What the date is.
   * :return: The schema.
   */
  static dateField(description) {
    return {
      type: "string",
      format: "date",
      description: description,
    };
  }

  /**
   * Describe the guest count, as the page's actions do.
   *
   * :return: The schema.
   */
  static guestsField() {
    return {
      type: "integer",
      minimum: 0,
      maximum: 20,
      description: "Number of guests the visitor gave, counted as the house policies say.",
    };
  }

  /**
   * Describe a stay in one room: room, dates, guests and extras, as the page's actions do.
   *
   * :return: The schema's properties.
   */
  static stayProperties() {
    return {
      roomId: {
        type: "string",
        enum: BridgeActions.ids(GuesthouseData.ROOMS),
        description: "Room id from website_get_guesthouse_state.",
      },
      checkIn: BridgeActions.dateField("Check-in date the visitor wants, YYYY-MM-DD."),
      checkOut: BridgeActions.dateField("Check-out date the visitor wants, YYYY-MM-DD."),
      guests: BridgeActions.guestsField(),
      extras: {
        type: "array",
        maxItems: 10,
        items: {
          type: "string",
          enum: BridgeActions.ids(GuesthouseData.EXTRAS),
        },
        description: "Extra ids from website_get_guesthouse_state, each once. Leave out for none.",
      },
    };
  }

  /**
   * Describe the shared read of the rooms, the terms and the page's facts.
   *
   * :return: The action definition.
   */
  static readStateAction() {
    return {
      name: "get_guesthouse_state",
      description: "Read the rooms (beds, guest limit, rates, amenities, access, pets), extras, fees, stay limits, arrival times, cancellation fees, today's date and the home page's facts (contact, payment, changing a booking, tours, getting here, demo note). It does not show which rooms are free. Work out dates from today's date here.",
      effect: "read",
      availability: "bridge",
      callerOrigins: BridgeActions.CALLERS,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: BridgeActions.readState,
    };
  }

  /**
   * Read the state that needs no page, and the facts from the page's HTML.
   *
   * :return: A promise of today, the rooms, the extras, the terms and the page's facts.
   */
  static async readState() {
    const page = await BridgeActions.readPage(BridgeActions.PAGE);
    return Object.assign(BookingPage.siteState(), {
      pageFacts: BookingPage.factsIn(page),
    });
  }

  /**
   * Describe the shared read of the house policies page.
   *
   * :return: The action definition.
   */
  static readPoliciesAction() {
    return {
      name: "get_house_policies",
      description: "Read the house policies page: check-in and check-out, length of stay, cancellation and changes, fees and payment, pets, quiet hours, children and who counts as a guest, and accessibility. Returns each section's text, table rows and links. When children come, call it with your first read: it says who counts as a guest.",
      effect: "read",
      availability: "bridge",
      callerOrigins: BridgeActions.CALLERS,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: BridgeActions.readPolicies,
    };
  }

  /**
   * Read the policies page, which HousePolicies finds next to its own module.
   *
   * :return: A promise of the page's sections.
   */
  static readPolicies() {
    return HousePolicies.read();
  }

  /**
   * Describe the shared availability search. Its input is the same as the page's
   * search_rooms (a test checks it).
   *
   * :return: The action definition.
   */
  static searchRoomsAction() {
    return {
      name: "search_rooms",
      description: "Find the rooms that are free for a stay and fit the guests, each with its price for the nights, cleaning fee and tourist tax, without extras. Changes nothing. Returns ok false with the site's reason when the dates or guests break a booking rule.",
      effect: "read",
      availability: "bridge",
      callerOrigins: BridgeActions.CALLERS,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["checkIn", "checkOut", "guests"],
        properties: {
          checkIn: BridgeActions.dateField("Check-in date the visitor wants, YYYY-MM-DD."),
          checkOut: BridgeActions.dateField("Check-out date the visitor wants, YYYY-MM-DD."),
          guests: BridgeActions.guestsField(),
        },
      },
      execute: BridgeActions.searchRooms,
    };
  }

  /**
   * Search through a fresh reservation book, with the page's own code.
   *
   * :param args: The validated arguments with checkIn, checkOut and guests.
   * :return: The free rooms with prices, or ok false with a reason.
   */
  static searchRooms(args) {
    return BridgeActions.pageWithoutDocument().searchRooms(args);
  }

  /**
   * Describe the shared price quote for one room. Its input is the same as the page's
   * quote_stay (a test checks it).
   *
   * :return: The action definition.
   */
  static quoteStayAction() {
    return {
      name: "quote_stay",
      description: "Price a stay in one room with extras, line by line, after checking the booking rules and that the room is free. Changes nothing. Returns ok false with the site's reason otherwise.",
      effect: "read",
      availability: "bridge",
      callerOrigins: BridgeActions.CALLERS,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["roomId", "checkIn", "checkOut", "guests"],
        properties: BridgeActions.stayProperties(),
      },
      execute: BridgeActions.quoteStay,
    };
  }

  /**
   * Price a stay through a fresh reservation book, with the page's own code.
   *
   * :param args: The validated stay.
   * :return: The priced stay, or ok false with a reason.
   */
  static quoteStay(args) {
    return BridgeActions.pageWithoutDocument().quoteStay(args);
  }

  /**
   * Make a booking page object with a fresh reservation book but no document.
   * searchRooms and quoteStay use only the book, so they work on it.
   *
   * :return: The page object.
   */
  static pageWithoutDocument() {
    const page = Object.create(BookingPage.prototype);
    page.book = new ReservationBook();
    return page;
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

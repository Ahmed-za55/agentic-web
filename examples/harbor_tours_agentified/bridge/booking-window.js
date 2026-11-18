// The booking this site shares with the guesthouse's assistant, through its action bridge.
// bridge-actions.js registers it.
//
// A booking is a write, so the runtime runs it in a window on this site that the visitor
// sees. This module shows the trip and a details form there, with the site's own
// stylesheet. The visitor types their name, email and phone here, and the calling
// assistant gets back only the reservation code and the trip.
import { Calendar } from "../js/calendar.js";
import { FareCalculator } from "../js/fare-calculator.js";
import { TourData } from "../js/tour-data.js";
import { ToursPage } from "../js/tours-page.js";
import { TripBook } from "../js/trip-book.js";

/**
 * Shares a booking of one departure for a party, in one call, with the trip book rules
 * the page uses.
 *
 * The window starts a fresh trip book, like a fresh tour page, so the booking lives only
 * in that window. A real site would send it to its own server here.
 */
export class BookingWindow {
  /**
   * The site allowed to book through this window: the guesthouse, as an exact origin.
   */
  static CALLERS = [
    "http://127.0.0.1:8080",
  ];

  /**
   * The form's fields, in order, with the trip book's names. Fields with the same row
   * share a line, so the window needs less scrolling.
   */
  static FIELDS = [
    {
      name: "firstName",
      label: "First name",
      type: "text",
      autocomplete: "given-name",
      maxLength: 60,
      row: "name",
    },
    {
      name: "lastName",
      label: "Last name",
      type: "text",
      autocomplete: "family-name",
      maxLength: 60,
      row: "name",
    },
    {
      name: "email",
      label: "Email",
      type: "email",
      autocomplete: "email",
      maxLength: 120,
      row: "contact",
    },
    {
      name: "phone",
      label: "Mobile phone",
      type: "tel",
      autocomplete: "tel",
      maxLength: 20,
      row: "contact",
    },
  ];

  /**
   * The note under the contact row, as on the site's own basket form.
   */
  static PHONE_NOTE = "We call or text your mobile if the weather cancels your trip.";

  /**
   * Layout for this small window, on top of the site's stylesheet. The site's page is
   * wide, so its heading sizes are too big here.
   */
  static STYLE = `
.booking-window header { flex-direction: row; align-items: center; padding: 12px 18px; }
.booking-window main { max-width: 620px; padding-top: 4px; }
.booking-window .intro { padding: 4px 0 0; }
.booking-window h1 { font-size: 1.8rem; margin: 2px 0 6px; }
.booking-window .panel { margin-top: 16px; padding: 16px 18px; }
.booking-window .summary { margin: 8px 0; }
.booking-window label { margin-top: 10px; }
.booking-window .panel h2, .booking-window .confirmation h2 { font-size: 1.4rem; margin: 0 0 2px; }
.booking-window .price { margin-top: 14px; }
.booking-window .price td:last-child { text-align: right; white-space: nowrap; }
.booking-window .price td:nth-child(2) { color: #55625f; }
.booking-window .price tr.total td { font-weight: 700; border-bottom: 0; padding-top: 10px; }
.booking-window fieldset { margin: 0; }
.booking-window legend { margin-bottom: 2px; }
.booking-window .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
.booking-window .actions button { margin-top: 0; }
.booking-window .code { font-family: Georgia, serif; font-size: 2rem; font-weight: 700; letter-spacing: .04em; margin: 0 0 8px; }
.booking-window .field-error[hidden] { display: none; }
`;

  /**
   * Describe the shared booking.
   *
   * :return: The action definition.
   */
  static definition() {
    return {
      name: "book_departure",
      description: "Book one departure for a party, in one call. Call find_departures first and use its tourId and time. A window opens on this site, where the visitor checks the trip and types their own name, email and phone, so never ask for them. It returns only once the visitor has booked or cancelled there: with ok true, the trip is booked and the window has closed. Returns the reservation code, the trip, the total and the cancelling terms, or ok false with the site's reason, such as the visitor cancelling. Takes no payment: the visitor pays at the ticket hut.",
      effect: "irreversible",
      availability: "bridge",
      callerOrigins: BookingWindow.CALLERS,
      // The form below shows the trip and asks the visitor to book or cancel, so the
      // runtime's generic dialog is not needed.
      confirmsInWindow: true,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: [
          "tourId",
          "date",
          "time",
          "adults",
          "children",
          "under4s",
        ],
        properties: {
          tourId: {
            type: "string",
            enum: BookingWindow.tourIds(),
            description: "Tour id from find_departures.",
          },
          date: {
            type: "string",
            format: "date",
            description: "Trip date as YYYY-MM-DD.",
          },
          time: {
            type: "string",
            enum: BookingWindow.departureTimes(),
            description: "Departure time as HH:MM, from find_departures.",
          },
          adults: {
            type: "integer",
            minimum: 0,
            maximum: 50,
            description: "Adult tickets (16 and over).",
          },
          children: {
            type: "integer",
            minimum: 0,
            maximum: 50,
            description: "Child tickets (4 to 15).",
          },
          under4s: {
            type: "integer",
            minimum: 0,
            maximum: 50,
            description: "Free tickets for children under 4. They take no place.",
          },
        },
      },
      execute: BookingWindow.book,
    };
  }

  /**
   * List every tour id.
   *
   * :return: The ids.
   */
  static tourIds() {
    const ids = [];
    for (const tour of TourData.TOURS) {
      ids.push(tour.id);
    }
    return ids;
  }

  /**
   * List every departure time of every tour, once each, in order.
   *
   * :return: The times as "HH:MM".
   */
  static departureTimes() {
    const times = [];
    for (const tour of TourData.TOURS) {
      for (const time of tour.times) {
        if (!times.includes(time)) {
          times.push(time);
        }
      }
    }
    return times.sort();
  }

  /**
   * Check the trip, then ask the visitor for their details in this window.
   *
   * :param args: The validated tour, date, time and tickets.
   * :param context: The bridge's call details, with the calling site's origin.
   * :return: A refusal now, or a promise of the booking or the visitor's cancel.
   */
  static book(args, context) {
    const book = new TripBook();
    const trip = TripBook.copyTrip(args);
    // A trip the site would refuse gets no form.
    const problem = book.basketProblem([trip]);
    if (problem) {
      return ToursPage.refusal({basket: problem});
    }
    const state = {
      book: book,
      trip: trip,
      caller: BookingWindow.hostOf(context?.callerOrigin),
      done: false,
    };
    return new Promise(BookingWindow.showForm.bind(null, state));
  }

  /**
   * Show the trip and the details form, and wait for the visitor.
   *
   * :param state: The trip book, the trip, the caller and whether the form is done.
   * :param resolve: Resolves the action with its result.
   */
  static showForm(state, resolve) {
    state.resolve = resolve;
    document.title = "Book with Marrow Point Harbor Tours";
    BookingWindow.addStyles();
    document.body.classList.add("booking-window");
    const box = BookingWindow.element("main", "");
    box.append(
      BookingWindow.intro(state),
      BookingWindow.tripCard(state),
      BookingWindow.form(state, box),
    );
    document.body.append(BookingWindow.header(), box);
    state.form.elements.firstName.focus();
  }

  /**
   * Add the site's stylesheet, its icon and this window's layout to the page head.
   */
  static addStyles() {
    // Resolved from this module, so the bridge page's own location does not matter.
    const sheet = document.createElement("link");
    sheet.rel = "stylesheet";
    sheet.href = new URL("../styles.css", import.meta.url).href;
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.type = "image/svg+xml";
    icon.href = new URL("../favicon.svg", import.meta.url).href;
    document.head.append(sheet, icon, BookingWindow.element("style", BookingWindow.STYLE));
  }

  /**
   * Make the site's header, with its name, so the visitor sees whose window this is.
   *
   * :return: The header element.
   */
  static header() {
    const header = document.createElement("header");
    const brand = BookingWindow.element("span", "Marrow Point ", "brand");
    brand.append(BookingWindow.element("span", "Harbor Tours"));
    header.append(brand, BookingWindow.element("span", "Booking window", "note"));
    return header;
  }

  /**
   * Say which site asked for this booking, and where the visitor's details go.
   *
   * :param state: The booking state, with the caller's host.
   * :return: The intro section.
   */
  static intro(state) {
    const intro = BookingWindow.element("section", "", "intro");
    intro.append(
      BookingWindow.element("p", "Booking from another site's chat", "eyebrow"),
      BookingWindow.element("h1", "Book your trip"),
      BookingWindow.element("p", `The assistant on ${state.caller} asked us to book this trip for you. Type your details here, not in the chat. When you book, its chat gets the reservation code and the trip, not your details.`, "note"),
    );
    return intro;
  }

  /**
   * Show the trip, the party, the itemized price and the payment and cancelling terms.
   *
   * :param state: The booking state, with the trip book and the trip.
   * :return: The trip card.
   */
  static tripCard(state) {
    const tour = TourData.findById(TourData.TOURS, state.trip.tourId);
    const quote = state.book.quote(state.trip).quote;
    const how = tour.vessel ? `On the ${tour.vessel}` : "On foot";
    const card = BookingWindow.element("section", "", "panel");
    card.setAttribute("aria-label", "Your trip");
    card.append(
      BookingWindow.element("h2", tour.name),
      BookingWindow.element("p", `${how} · ${tour.minutes} minutes`, "note"),
      BookingWindow.summary([
        ["When", `${Calendar.format(state.trip.date)} at ${Calendar.formatTime(state.trip.time)}`],
        ["Party", FareCalculator.partyText(state.trip)],
      ]),
      BookingWindow.priceTable(quote),
    );
    let terms = "Nothing to pay now. Pay at the ticket hut before you board, by card or cash.";
    const cancelBy = TripBook.lastCancelDay([state.trip]);
    if (cancelBy) {
      terms += ` Free cancellation online until the end of ${Calendar.format(cancelBy)}.`;
    }
    card.append(BookingWindow.element("p", terms, "note"));
    return card;
  }

  /**
   * Make the price table: one row per quote line, then the total.
   *
   * :param quote: The trip book's quote, with its lines and total in cents.
   * :return: The table.
   */
  static priceTable(quote) {
    const table = BookingWindow.element("table", "", "price");
    const body = document.createElement("tbody");
    for (const line of quote.lines) {
      body.append(BookingWindow.row([line.label, line.detail, FareCalculator.money(line.amount)], ""));
    }
    body.append(BookingWindow.row(["Total", "", FareCalculator.money(quote.total)], "total"));
    table.append(body);
    return table;
  }

  /**
   * Make a table row with one text cell per value.
   *
   * :param cells: The cell texts.
   * :param className: The row's class, or "".
   * :return: The row.
   */
  static row(cells, className) {
    const row = BookingWindow.element("tr", "", className);
    for (const text of cells) {
      row.append(BookingWindow.element("td", text));
    }
    return row;
  }

  /**
   * Make a two-column list of terms and values, in the site's summary style.
   *
   * :param pairs: Each term with its value.
   * :return: The list.
   */
  static summary(pairs) {
    const list = BookingWindow.element("dl", "", "summary");
    for (const [term, value] of pairs) {
      list.append(BookingWindow.element("dt", term), BookingWindow.element("dd", value));
    }
    return list;
  }

  /**
   * Make the details form, with Book and Cancel.
   *
   * :param state: The booking state. The form and its error lines are stored on it.
   * :param box: The window's content, replaced once the visitor books or cancels.
   * :return: The form.
   */
  static form(state, box) {
    const form = BookingWindow.element("form", "", "panel");
    form.noValidate = true;
    state.form = form;
    state.messages = {};
    // A problem with the trip itself, such as no places left, shows above the fields.
    state.messages.basket = BookingWindow.message("basket");
    state.messages.basket.setAttribute("role", "alert");
    const fieldset = document.createElement("fieldset");
    fieldset.append(BookingWindow.element("legend", "Your details"));
    const rows = {};
    for (const field of BookingWindow.FIELDS) {
      // The first field of a row makes it, so rows keep the order of FIELDS.
      if (!rows[field.row]) {
        rows[field.row] = BookingWindow.element("div", "", "field-row");
        fieldset.append(rows[field.row]);
      }
      rows[field.row].append(BookingWindow.field(state, field));
    }
    fieldset.append(BookingWindow.element("p", BookingWindow.PHONE_NOTE, "note"));
    const bookButton = BookingWindow.element("button", "Book this trip");
    bookButton.type = "submit";
    const cancelButton = BookingWindow.element("button", "Cancel", "secondary");
    cancelButton.type = "button";
    const actions = BookingWindow.element("div", "", "actions");
    actions.append(bookButton, cancelButton);
    form.append(state.messages.basket, fieldset, actions);
    form.addEventListener("submit", BookingWindow.submit.bind(null, state, box));
    cancelButton.addEventListener("click", BookingWindow.cancel.bind(null, state, box));
    return form;
  }

  /**
   * Make one labelled input with its error line.
   *
   * :param state: The booking state. The field's error line is stored on it.
   * :param field: The field from FIELDS.
   * :return: The field's wrapper.
   */
  static field(state, field) {
    const id = `book-${field.name}`;
    const wrap = BookingWindow.element("div", "", "field");
    const label = BookingWindow.element("label", field.label);
    label.htmlFor = id;
    const input = document.createElement("input");
    input.id = id;
    input.name = field.name;
    input.type = field.type;
    input.autocomplete = field.autocomplete;
    input.maxLength = field.maxLength;
    input.required = true;
    state.messages[field.name] = BookingWindow.message(field.name);
    input.setAttribute("aria-describedby", state.messages[field.name].id);
    wrap.append(label, input, state.messages[field.name]);
    return wrap;
  }

  /**
   * Check the details with the trip book's rules, and book when they pass.
   *
   * :param state: The booking state, with the form, the trip book and the resolver.
   * :param box: The window's content, replaced once the booking is made.
   * :param event: The submit event.
   */
  static submit(state, box, event) {
    event.preventDefault();
    if (state.done) {
      return;
    }
    const contact = {
      notes: "",
    };
    for (const field of BookingWindow.FIELDS) {
      contact[field.name] = state.form.elements[field.name].value;
    }
    const errors = state.book.reserveErrors([state.trip], contact);
    BookingWindow.showErrors(state, errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    const result = state.book.reserve([state.trip], contact);
    state.done = true;
    box.replaceChildren(BookingWindow.confirmation(state, result.reservation));
    state.resolve(BookingWindow.describe(result.reservation));
  }

  /**
   * Show each error under its field, mark the field invalid, and focus the first one.
   *
   * :param state: The booking state, with the form and its error lines.
   * :param errors: The trip book's errors by field name, empty when all is fine.
   */
  static showErrors(state, errors) {
    let first = null;
    for (const name of Object.keys(state.messages)) {
      const text = errors[name] || "";
      state.messages[name].textContent = text;
      state.messages[name].hidden = !text;
      const input = state.form.elements[name];
      if (input) {
        input.setAttribute("aria-invalid", text ? "true" : "false");
        if (text && !first) {
          first = input;
        }
      }
    }
    first?.focus();
  }

  /**
   * Show the booking in this window, as the site's own confirmation box does, with the
   * details the visitor typed so they can check them here.
   *
   * :param state: The booking state, with the trip and the caller's host.
   * :param reservation: The new reservation.
   * :return: The confirmation section.
   */
  static confirmation(state, reservation) {
    const box = BookingWindow.element("section", "", "confirmation");
    box.append(
      BookingWindow.element("h2", "Booked"),
      BookingWindow.element("p", "Your reservation code is"),
      BookingWindow.element("p", reservation.code, "code"),
      BookingWindow.summary([
        ["Trip", TripBook.label(state.trip)],
        ["Name", `${reservation.contact.firstName} ${reservation.contact.lastName}`],
        ["Email", reservation.contact.email],
        ["Phone", reservation.contact.phone],
      ]),
      BookingWindow.element("p", `This window closes now. The chat on ${state.caller} shows the code too.`, "note"),
    );
    return box;
  }

  /**
   * End the action without booking, after the visitor clicks Cancel.
   *
   * :param state: The resolver, the caller's host and whether the form is done.
   * :param box: The window's content.
   */
  static cancel(state, box) {
    if (state.done) {
      return;
    }
    state.done = true;
    const notice = BookingWindow.element("section", "", "panel");
    notice.append(
      BookingWindow.element("h2", "Cancelled"),
      BookingWindow.element("p", `Nothing was booked. This window closes now, and the chat on ${state.caller} carries on.`),
    );
    box.replaceChildren(notice);
    state.resolve({
      ok: false,
      reason: "The visitor cancelled in the booking window. Nothing was booked.",
    });
  }

  /**
   * Describe a reservation for the calling assistant. It leaves out the visitor's name,
   * email and phone: they stay in this site's window.
   *
   * :param reservation: The new reservation.
   * :return: The code, status, trips, total and cancelling terms.
   */
  static describe(reservation) {
    // describeReservation uses no page state, so a page object without a document works.
    const page = Object.create(ToursPage.prototype);
    const described = page.describeReservation(reservation, TripBook.lastCancelDay(reservation.trips));
    return {
      ok: true,
      code: described.code,
      status: described.status,
      trips: described.trips,
      total: described.total,
      cancelBy: described.cancelBy,
      note: `Booked. The visitor checked the trip and typed their details in this site's window, which has now closed. ${described.note}`,
    };
  }

  /**
   * Give the host of the calling site, for the window's text.
   *
   * :param origin: The caller's origin from the bridge, if any.
   * :return: The host, or "another site" when the origin is missing or not a URL.
   */
  static hostOf(origin) {
    try {
      return new URL(origin).host;
    } catch {
      return "another site";
    }
  }

  /**
   * Make an element with text and an optional class.
   *
   * :param tag: The tag name.
   * :param text: The text.
   * :param className: The class, or "" for none.
   * :return: The element.
   */
  static element(tag, text, className = "") {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) {
      element.className = className;
    }
    return element;
  }

  /**
   * Make a hidden error line for one field, in the site's error style.
   *
   * :param name: The field's name, for the line's id.
   * :return: The element.
   */
  static message(name) {
    const line = BookingWindow.element("p", "", "field-error");
    line.id = `book-${name}-error`;
    line.hidden = true;
    return line;
  }
}

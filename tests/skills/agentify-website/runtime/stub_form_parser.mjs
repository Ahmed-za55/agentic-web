// A stand-in for the browser's DOMParser, for the discovered-actions tests.
import { StubForm } from "./stub_form.mjs";

/**
 * Parses any page into a stub page with one empty form.
 *
 * It keeps the form of the last page it parsed, so a test can check which form was filled.
 */
export class StubFormParser {
  /**
   * The form in the last parsed page, or null before any parse.
   */
  static lastForm = null;

  /**
   * Parse a page.
   *
   * :param html: The page's HTML, unused.
   * :param type: The page's media type, unused.
   * :return: The stub page, with its one form in "forms".
   */
  parseFromString(html, type) {
    StubFormParser.lastForm = new StubForm();
    return { forms: [StubFormParser.lastForm] };
  }
}

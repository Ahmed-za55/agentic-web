// A stand-in for the browser's FormData, for the discovered-actions tests.

/**
 * A form's values. Node's own FormData does not take a form, so this one stands in.
 *
 * It keeps the last form it read, so a test can check which form was sent.
 */
export class StubFormData {
  /**
   * The form passed to the last new StubFormData, or null before any.
   */
  static lastForm = null;

  /**
   * Read a form's values.
   *
   * :param form: The form.
   */
  constructor(form) {
    StubFormData.lastForm = form;
  }

  /**
   * The form's name and value pairs. The stub form has no controls, so there are none.
   *
   * :return: An iterator over no pairs.
   */
  [Symbol.iterator]() {
    return [][Symbol.iterator]();
  }
}

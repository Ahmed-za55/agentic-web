// A stand-in for a form in a page parsed with DOMParser, for the discovered-actions tests.

/**
 * A form with no attributes and no controls, as in a parsed page.
 *
 * It records how it was copied, so a test can check that the form that gets filled is a
 * full copy of the parsed one.
 */
export class StubForm {
  /**
   * Make a form.
   *
   * :param source: The form this one was copied from, or null for a parsed form.
   * :param deep: Whether the copy took the form's children too.
   */
  constructor(source = null, deep = false) {
    this.source = source;
    this.deep = deep;
    this.attributes = [];
  }

  /**
   * Copy the form, as Node.cloneNode does. The copy stays in the same page.
   *
   * :param deep: Whether to copy the form's children too.
   * :return: The copy.
   */
  cloneNode(deep) {
    return new StubForm(this, deep);
  }

  /**
   * Find the form's controls. The stub form has none.
   *
   * :param selector: The CSS selector, unused.
   * :return: An empty list.
   */
  querySelectorAll(selector) {
    return [];
  }

  /**
   * Check the form's values. A form with no controls is always valid.
   *
   * :return: true.
   */
  checkValidity() {
    return true;
  }
}

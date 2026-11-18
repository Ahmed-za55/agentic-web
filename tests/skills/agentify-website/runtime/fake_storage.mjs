/**
 * An in-memory stand-in for the browser's localStorage and sessionStorage.
 *
 * It has the Storage methods the runtime uses. Values are kept as strings, as a browser
 * keeps them.
 */
export class FakeStorage {
  /**
   * Start with no items.
   */
  constructor() {
    this.items = new Map();
  }

  /**
   * Return an item's value.
   *
   * :param name: The item's name.
   * :return: The value, or null when there is no such item.
   */
  getItem(name) {
    const key = String(name);
    return this.items.has(key) ? this.items.get(key) : null;
  }

  /**
   * Set an item's value.
   *
   * :param name: The item's name.
   * :param value: The value. It is stored as a string.
   */
  setItem(name, value) {
    this.items.set(String(name), String(value));
  }

  /**
   * Remove an item, if there is one.
   *
   * :param name: The item's name.
   */
  removeItem(name) {
    this.items.delete(String(name));
  }

  /**
   * Remove every item.
   */
  clear() {
    this.items.clear();
  }
}

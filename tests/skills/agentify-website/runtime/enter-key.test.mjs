// Checks which keydowns in the chat box send the message.
// Run from the repository root: node --test "tests/**/*.test.mjs"
// The events are plain objects with the fields a browser's keydown event has.
import assert from "node:assert/strict";
import test from "node:test";
import { EnterKey } from "../../../../skills/agentify-website/runtime/enter-key.js";

/**
 * Tests that Enter sends the message, except the Enter that confirms an input method's
 * characters, as with Japanese, Chinese or Korean.
 */
class TestEnterKey {
  /**
   * Build a keydown event like a browser's.
   *
   * :param fields: The fields to set over a plain Enter outside any composition.
   * :return: The event.
   */
  static keydown(fields = {}) {
    const base = {
      key: "Enter",
      keyCode: 13,
      isComposing: false,
    };
    return Object.assign(base, fields);
  }

  /**
   * A plain Enter sends the message.
   */
  static testPlainEnterSends() {
    assert.equal(EnterKey.sendsMessage(TestEnterKey.keydown()), true);
  }

  /**
   * An Enter while the input method composes does not send. This is the event the issue
   * dispatches from the console.
   */
  static testComposingEnterDoesNotSend() {
    const event = TestEnterKey.keydown({
      isComposing: true,
      keyCode: 229,
    });
    assert.equal(EnterKey.sendsMessage(event), false);
    assert.equal(EnterKey.sendsMessage(TestEnterKey.keydown({isComposing: true})), false);
  }

  /**
   * Safari's confirming Enter has isComposing false but keyCode 229, and does not send.
   */
  static testSafariConfirmingEnterDoesNotSend() {
    assert.equal(EnterKey.sendsMessage(TestEnterKey.keydown({keyCode: 229})), false);
  }

  /**
   * Other keys do not send.
   */
  static testOtherKeysDoNotSend() {
    const event = TestEnterKey.keydown({
      key: "a",
      keyCode: 65,
    });
    assert.equal(EnterKey.sendsMessage(event), false);
  }
}

test("a plain Enter sends the message", TestEnterKey.testPlainEnterSends);
test("an Enter while an input method composes does not send", TestEnterKey.testComposingEnterDoesNotSend);
test("Safari's confirming Enter, keyCode 229, does not send", TestEnterKey.testSafariConfirmingEnterDoesNotSend);
test("other keys do not send", TestEnterKey.testOtherKeysDoNotSend);

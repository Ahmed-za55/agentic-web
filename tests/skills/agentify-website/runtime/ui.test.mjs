// Checks which provider the settings panel finds for a pasted key.
// Run from the repository root: node --test "tests/**/*.test.mjs"
// The keys are made-up strings in each provider's format. Nothing is sent anywhere.
import assert from "node:assert/strict";
import test from "node:test";
import {
  providerButtons,
  providerForApiKey,
} from "../../../../skills/agentify-website/runtime/ui.js";

/**
 * Tests the provider list behind the ⚙ AI model settings panel.
 *
 * Each test checks the provider a key's prefix points to, and the settings it fills in.
 */
class SettingsPanelTest {
  /**
   * Return a made-up key: a prefix and 64 letters.
   *
   * :param prefix: The key's prefix.
   * :return: The key.
   */
  static fakeKey(prefix) {
    return prefix + "x".repeat(64);
  }

  /**
   * A hosted Otari key fills in hosted Otari and its model, and Otari is the first button.
   */
  static testHostedOtariKey() {
    const provider = providerForApiKey(SettingsPanelTest.fakeKey("otk_"));
    assert.equal(provider?.name, "Otari");
    assert.equal(provider.router, "https://api.otari.ai/api/v1");
    assert.equal(provider.model, "alibaba/qwen3.8-flash");
    assert.equal(providerButtons()[0].name, "Otari", "Otari is not the first provider button.");
  }

  /**
   * An Otari EU key fills in the EU gateway, which is the only one that accepts it. A key
   * for the default region still gets the default gateway.
   */
  static testEuOtariKey() {
    const euProvider = providerForApiKey(SettingsPanelTest.fakeKey("otk_v1_eu_"));
    assert.equal(euProvider?.name, "Otari EU");
    assert.equal(euProvider.router, "https://eu.api.otari.ai/api/v1");
    assert.equal(euProvider.model, "alibaba/qwen3.8-flash");

    const usProvider = providerForApiKey(SettingsPanelTest.fakeKey("otk_v1_us_"));
    assert.equal(usProvider?.name, "Otari");
    assert.equal(usProvider.router, "https://api.otari.ai/api/v1");
  }

  /**
   * The panel shows one Otari button. Both regions make keys on the same dashboard, so the
   * EU entry has no button of its own.
   */
  static testOneOtariButton() {
    const names = [];
    for (const provider of providerButtons()) {
      names.push(provider.name);
    }
    assert.deepEqual(names, ["Otari", "Google AI Studio", "Groq", "OpenRouter", "OpenAI", "Anthropic"]);
  }

  /**
   * A self-hosted Otari key matches no provider, so the panel keeps the Provider URL and asks
   * the visitor to check it.
   */
  static testSelfHostedOtariKey() {
    assert.equal(providerForApiKey(SettingsPanelTest.fakeKey("tk-")), null);
  }

  /**
   * A Google AI Studio key fills in Gemini under the name Google's model list uses. The
   * panel checks the model against that list, so a name without "models/" is refused.
   */
  static testGoogleKey() {
    const provider = providerForApiKey(SettingsPanelTest.fakeKey("AIza"));
    assert.equal(provider?.name, "Google AI Studio");
    assert.equal(provider.router, "https://generativelanguage.googleapis.com/v1beta/openai");
    assert.equal(provider.model, "models/gemini-3.8-flash");
  }

  /**
   * An OpenRouter key, pasted or from Connect with OpenRouter, fills in OpenRouter and its
   * free default model.
   */
  static testOpenRouterKey() {
    const provider = providerForApiKey(SettingsPanelTest.fakeKey("sk-or-v1-"));
    assert.equal(provider?.name, "OpenRouter");
    assert.equal(provider.router, "https://openrouter.ai/api/v1");
    assert.equal(provider.model, "google/gemma-4-31b-it:free");
  }

  /**
   * The providers the panel knew before still match their keys.
   */
  static testOtherProviders() {
    const cases = [
      {
        prefix: "AIza",
        name: "Google AI Studio",
      },
      {
        prefix: "gsk_",
        name: "Groq",
      },
      {
        prefix: "sk-proj-",
        name: "OpenAI",
      },
      {
        prefix: "sk-ant-",
        name: "Anthropic",
      },
    ];
    for (const item of cases) {
      assert.equal(providerForApiKey(SettingsPanelTest.fakeKey(item.prefix))?.name, item.name);
    }
  }
}

test("a hosted Otari key fills in hosted Otari, the first provider", SettingsPanelTest.testHostedOtariKey);
test("an Otari EU key fills in the EU gateway", SettingsPanelTest.testEuOtariKey);
test("the panel shows one Otari button", SettingsPanelTest.testOneOtariButton);
test("a self-hosted Otari key matches no provider", SettingsPanelTest.testSelfHostedOtariKey);
test("a Google AI Studio key fills in Gemini under the name Google's model list uses", SettingsPanelTest.testGoogleKey);
test("an OpenRouter key fills in OpenRouter", SettingsPanelTest.testOpenRouterKey);
test("the other providers still match their keys", SettingsPanelTest.testOtherProviders);

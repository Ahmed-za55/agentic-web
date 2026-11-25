// Checks that the chat works on a page that turns on Trusted Types.
// Run from the repository root: node --test "tests/**/*.test.mjs"
// No browser is needed: the policy is tested with a stand-in for the browser's
// trustedTypes, and the runtime, the skill's templates and each example site are read to
// find writes that skip the policy.
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const SKILL_RUNTIME = path.join(ROOT, "skills/agentify-website/runtime");
const SKILL_TEMPLATES = path.join(ROOT, "skills/agentify-website/templates");
const MODULE = new URL("../../../../skills/agentify-website/runtime/trusted-types.js", import.meta.url).href;

/**
 * Tests the runtime's Trusted Types policy and where the runtime and site code use it.
 *
 * With require-trusted-types-for 'script', the browser refuses a plain string for
 * innerHTML, outerHTML, insertAdjacentHTML, DOMParser.parseFromString and new Worker.
 * The runtime and site code pass each one through the policy, "agentify-website".
 */
class TestTrustedTypes {
  static loads = 0;

  /**
   * Load a fresh copy of trusted-types.js, so each test creates its own policy.
   *
   * :return: The module.
   */
  static async freshModule() {
    TestTrustedTypes.loads += 1;
    return import(`${MODULE}?load=${TestTrustedTypes.loads}`);
  }

  /**
   * A stand-in for the browser's trustedTypes that records the policies created.
   *
   * :param refuse: True to refuse every policy name, as a page does whose
   *   Content-Security-Policy lists other policies only.
   * :return: The stand-in, with the names it created in `made`.
   */
  static fakeTrustedTypes(refuse = false) {
    const made = [];
    return {
      made,
      createPolicy(name, rules) {
        if (refuse) throw new TypeError(`Policy "${name}" disallowed.`);
        made.push(name);
        return {
          createHTML: (s) => ({ type: "TrustedHTML", value: rules.createHTML(s) }),
          createScriptURL: (s) => ({ type: "TrustedScriptURL", value: rules.createScriptURL(s) }),
        };
      },
    };
  }

  /**
   * Run a function with globalThis.trustedTypes set, then put the old value back.
   *
   * :param fake: The stand-in, or undefined for a browser without Trusted Types.
   * :param run: The function.
   */
  static async withTrustedTypes(fake, run) {
    const had = Object.hasOwn(globalThis, "trustedTypes");
    const old = globalThis.trustedTypes;
    globalThis.trustedTypes = fake;
    try {
      await run();
    } finally {
      if (had) globalThis.trustedTypes = old;
      else delete globalThis.trustedTypes;
    }
  }

  /**
   * The runtime creates one policy named agentify-website, once, and passes HTML and
   * script URLs through it unchanged.
   */
  static async testPolicy() {
    const fake = TestTrustedTypes.fakeTrustedTypes();
    await TestTrustedTypes.withTrustedTypes(fake, async () => {
      const { trustedHtml, trustedScriptUrl } = await TestTrustedTypes.freshModule();
      assert.deepEqual(trustedHtml('<div class="ns-header">x</div>'), { type: "TrustedHTML", value: '<div class="ns-header">x</div>' });
      assert.deepEqual(trustedScriptUrl(new URL("https://site.example/runtime/sandbox-worker.js")),
        { type: "TrustedScriptURL", value: "https://site.example/runtime/sandbox-worker.js" });
      trustedHtml("<p>again</p>");
      assert.deepEqual(fake.made, ["agentify-website"], "The policy must be created once, with this name.");
    });
  }

  /**
   * Without Trusted Types, as in older browsers, the strings stay strings.
   */
  static async testNoTrustedTypes() {
    await TestTrustedTypes.withTrustedTypes(undefined, async () => {
      const { trustedHtml, trustedScriptUrl } = await TestTrustedTypes.freshModule();
      assert.equal(trustedHtml("<p>plain</p>"), "<p>plain</p>");
      assert.equal(trustedScriptUrl("runtime/sandbox-worker.js"), "runtime/sandbox-worker.js");
    });
  }

  /**
   * A page that does not allow this policy's name gets the plain strings, so a default
   * policy, if the page has one, still receives them.
   */
  static async testPolicyNotAllowed() {
    await TestTrustedTypes.withTrustedTypes(TestTrustedTypes.fakeTrustedTypes(true), async () => {
      const { trustedHtml, trustedScriptUrl } = await TestTrustedTypes.freshModule();
      assert.equal(trustedHtml("<p>x</p>"), "<p>x</p>");
      assert.equal(trustedScriptUrl("runtime/sandbox-worker.js"), "runtime/sandbox-worker.js");
    });
  }

  /**
   * Every runtime folder: the skill's and each example's copy.
   *
   * :return: The folders' paths.
   */
  static async runtimeFolders() {
    const folders = [SKILL_RUNTIME];
    for (const name of await readdir(path.join(ROOT, "examples"))) {
      const folder = path.join(ROOT, "examples", name, "runtime");
      if (await stat(folder).then((s) => s.isDirectory(), () => false)) folders.push(folder);
    }
    return folders;
  }

  /**
   * Every .js file that can write or parse HTML on an agentified site: the skill's runtime
   * and templates, and each example site with its runtime, bridge and own code.
   *
   * :return: The files' paths.
   */
  static async codeFiles() {
    const folders = [SKILL_RUNTIME, SKILL_TEMPLATES];
    for (const runtime of (await TestTrustedTypes.runtimeFolders()).slice(1)) {
      folders.push(path.dirname(runtime));
    }
    const files = [];
    for (const folder of folders) {
      for (const name of await readdir(folder, { recursive: true })) {
        if (TestTrustedTypes.isScanned(name)) {
          files.push(path.join(folder, name));
        }
      }
    }
    return files;
  }

  /**
   * Whether the sink check reads a file. Tests run in Node, and trusted-types.js is the
   * policy itself, so both are left out.
   *
   * :param name: The file's path inside its folder.
   * :return: True for a .js file outside any tests folder, other than trusted-types.js.
   */
  static isScanned(name) {
    const parts = name.split(path.sep);
    return name.endsWith(".js") && !parts.includes("tests") && parts[parts.length - 1] !== "trusted-types.js";
  }

  /**
   * In the runtime, the skill's templates and each example site, each HTML write, HTML
   * parse and worker start goes through the policy, so Trusted Types cannot block it.
   * Comment lines are ignored.
   */
  static async testEveryWriteUsesThePolicy() {
    const sinks = [
      ["innerHTML or outerHTML", /\.(?:inner|outer)HTML\s*=(?!\s*trustedHtml\()/g],
      ["insertAdjacentHTML", /\.insertAdjacentHTML\([^,]+,(?!\s*trustedHtml\()/g],
      ["DOMParser.parseFromString", /\.parseFromString\((?!\s*trustedHtml\()/g],
      ["new Worker", /new Worker\((?!\s*trustedScriptUrl\()/g],
    ];
    const found = [];
    for (const file of await TestTrustedTypes.codeFiles()) {
      // Blank out comment lines, keeping their line breaks so line numbers stay right.
      const code = (await readFile(file, "utf8")).replace(/^[ \t]*\/\/.*$/gm, "");
      for (const [name, pattern] of sinks) {
        for (const match of code.matchAll(pattern)) {
          const line = code.slice(0, match.index).split("\n").length;
          found.push(`${path.relative(ROOT, file)}:${line} ${name}`);
        }
      }
    }
    assert.deepEqual(found, [], `These skip the Trusted Types policy:\n${found.join("\n")}`);
  }

  /**
   * Each example's copy of trusted-types.js is the skill's.
   */
  static async testExampleCopiesMatch() {
    const skill = await readFile(path.join(SKILL_RUNTIME, "trusted-types.js"), "utf8");
    for (const folder of (await TestTrustedTypes.runtimeFolders()).slice(1)) {
      assert.equal(await readFile(path.join(folder, "trusted-types.js"), "utf8"), skill, `${path.relative(ROOT, folder)} has another trusted-types.js.`);
    }
  }
}

test("the runtime's policy is agentify-website, created once, passing strings unchanged", TestTrustedTypes.testPolicy);
test("without Trusted Types the strings stay strings", TestTrustedTypes.testNoTrustedTypes);
test("a page that does not allow the policy's name gets plain strings", TestTrustedTypes.testPolicyNotAllowed);
test("every HTML write, HTML parse and worker start uses the policy, in the runtime, the templates and each example site", TestTrustedTypes.testEveryWriteUsesThePolicy);
test("each example has the skill's trusted-types.js", TestTrustedTypes.testExampleCopiesMatch);

// Checks how the skill's runtime puts streamed tool calls together, and that a Gemini
// thought signature goes back to the model on the call it came with.
// Run from the repository root: node --test "tests/**/*.test.mjs"
// The router, key and signature are fakes behind a stub fetch. No model is called.
import assert from "node:assert/strict";
import test from "node:test";
import { LlmClient } from "../../../../skills/agentify-website/runtime/llm.js";

/**
 * Streams scripted chat replies to LlmClient through a stub fetch.
 *
 * Gemini sends each tool call whole, with no index, and signs the first call of a step.
 * Other routers number the pieces of each call. Each test checks the calls LlmClient
 * builds from one kind of stream, or what it sends back on the next step.
 */
class LlmClientTest {
  /**
   * The router the client talks to.
   */
  static ROUTER = "https://router.test/v1";

  /**
   * Gemini's extra field on a signed call, as its OpenAI-compatible endpoint sends it.
   * The signature is made up.
   */
  static SIGNED = {
    google: {
      thought_signature: "fake-thought-signature",
    },
  };

  /**
   * Gemini's stream for two calls in one step: each call whole in its own chunk, with
   * no index, and only the first one signed.
   */
  static GEMINI_CALLS = [
    {
      tool_calls: [
        {
          extra_content: LlmClientTest.SIGNED,
          function: {
            arguments: "{\"city\":\"Paris\"}",
            name: "get_weather",
          },
          id: "call_1",
          type: "function",
        },
      ],
    },
    {
      tool_calls: [
        {
          function: {
            arguments: "{\"city\":\"Rome\"}",
            name: "get_weather",
          },
          id: "call_2",
          type: "function",
        },
      ],
    },
  ];

  /**
   * The two calls LlmClient should build from GEMINI_CALLS.
   */
  static GEMINI_RESULT = [
    {
      id: "call_1",
      type: "function",
      function: {
        name: "get_weather",
        arguments: "{\"city\":\"Paris\"}",
      },
      extra_content: LlmClientTest.SIGNED,
    },
    {
      id: "call_2",
      type: "function",
      function: {
        name: "get_weather",
        arguments: "{\"city\":\"Rome\"}",
      },
    },
  ];

  /**
   * Return the messages of a first request: the visitor's question.
   *
   * :return: A new message list.
   */
  static question() {
    return [
      {
        role: "user",
        content: "What is the weather in Paris and Rome?",
      },
    ];
  }

  /**
   * Return one tool-call piece that adds text to a call's arguments.
   *
   * :param index: The call's number, or null to leave it out.
   * :param text: The text to add.
   * :return: The piece.
   */
  static argumentsPiece(index, text) {
    const piece = {function: {arguments: text}};
    if (index !== null) {
      piece.index = index;
    }
    return piece;
  }

  /**
   * Wrap deltas as one streamed chat-completions response, one chunk per delta.
   *
   * :param deltas: The delta of each chunk, in order.
   * :param finishReason: The finish reason of the last chunk.
   * :return: The response.
   */
  static stream(deltas, finishReason) {
    let body = "";
    for (const delta of deltas) {
      const chunk = {
        model: "scripted",
        choices: [
          {
            index: 0,
            delta: delta,
          },
        ],
      };
      body += `data: ${JSON.stringify(chunk)}\n\n`;
    }
    const last = {
      model: "scripted",
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: finishReason,
        },
      ],
    };
    body += `data: ${JSON.stringify(last)}\n\ndata: [DONE]\n\n`;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
      },
    });
  }

  /**
   * The stub fetch. It records each request body and answers with the next reply.
   *
   * :param state: The replies still to send, and the request bodies so far.
   * :param input: The URL.
   * :param init: The fetch options.
   * :return: The next reply.
   */
  static async fetch(state, input, init) {
    assert.equal(String(input), `${LlmClientTest.ROUTER}/chat/completions`);
    state.bodies.push(JSON.parse(init.body));
    return state.replies.shift();
  }

  /**
   * Run some model steps with the stub fetch in place. After each step, add the
   * assistant's calls and one result per call to the messages, as runner.js does.
   *
   * :param replies: The router's replies, one per step.
   * :return: The request bodies, and the last step's result.
   */
  static async run(replies) {
    const state = {
      replies: replies,
      bodies: [],
    };
    const steps = replies.length;
    const messages = LlmClientTest.question();
    const savedFetch = globalThis.fetch;
    globalThis.fetch = LlmClientTest.fetch.bind(null, state);
    try {
      const client = new LlmClient({
        baseUrl: LlmClientTest.ROUTER,
        apiKey: "sk-test-not-a-real-key",
        trace: null,
        mock: false,
      });
      let result = null;
      for (let step = 0; step < steps; step++) {
        result = await client.chat({
          model: "models/gemini-3.8-flash",
          messages: messages,
          tools: [],
        });
        messages.push({
          role: "assistant",
          content: result.content || null,
          tool_calls: result.toolCalls,
        });
        for (const call of result.toolCalls) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: "Sunny.",
          });
        }
      }
      return {
        bodies: state.bodies,
        result: result,
      };
    } finally {
      globalThis.fetch = savedFetch;
    }
  }

  /**
   * Gemini's two calls stay two calls, and the first keeps its signature.
   */
  static async testGeminiCallsStaySeparate() {
    const run = await LlmClientTest.run([LlmClientTest.stream(LlmClientTest.GEMINI_CALLS, "stop")]);
    assert.deepEqual(run.result.toolCalls, LlmClientTest.GEMINI_RESULT);
  }

  /**
   * The next request sends the signature back on the same call, and on no other.
   */
  static async testSignatureGoesBack() {
    const run = await LlmClientTest.run([
      LlmClientTest.stream(LlmClientTest.GEMINI_CALLS, "stop"),
      LlmClientTest.stream([{content: "Sunny in both."}], "stop"),
    ]);
    assert.equal(run.result.content, "Sunny in both.");
    const sent = run.bodies[1].messages[1];
    assert.equal(sent.role, "assistant");
    assert.deepEqual(sent.tool_calls, LlmClientTest.GEMINI_RESULT);
  }

  /**
   * Numbered pieces of two calls are joined as before, with no extra field added.
   */
  static async testNumberedPieces() {
    const deltas = [
      {
        tool_calls: [
          {
            index: 0,
            id: "call_a",
            type: "function",
            function: {
              name: "get_weather",
              arguments: "",
            },
          },
        ],
      },
      {tool_calls: [LlmClientTest.argumentsPiece(0, "{\"city\":")]},
      {tool_calls: [LlmClientTest.argumentsPiece(0, "\"Paris\"}")]},
      {
        tool_calls: [
          {
            index: 1,
            id: "call_b",
            type: "function",
            function: {
              name: "get_weather",
              arguments: "{\"city\":\"Rome\"}",
            },
          },
        ],
      },
    ];
    const run = await LlmClientTest.run([LlmClientTest.stream(deltas, "tool_calls")]);
    const expected = [
      {
        id: "call_a",
        type: "function",
        function: {
          name: "get_weather",
          arguments: "{\"city\":\"Paris\"}",
        },
      },
      {
        id: "call_b",
        type: "function",
        function: {
          name: "get_weather",
          arguments: "{\"city\":\"Rome\"}",
        },
      },
    ];
    assert.deepEqual(run.result.toolCalls, expected);
  }

  /**
   * With no index, a piece with no id still joins the call before it.
   */
  static async testUnnumberedPiecesWithoutId() {
    const deltas = [
      {
        tool_calls: [
          {
            id: "call_x",
            function: {
              name: "get_weather",
              arguments: "{\"city\":",
            },
          },
        ],
      },
      {tool_calls: [LlmClientTest.argumentsPiece(null, "\"Paris\"}")]},
    ];
    const run = await LlmClientTest.run([LlmClientTest.stream(deltas, "tool_calls")]);
    const expected = [
      {
        id: "call_x",
        type: "function",
        function: {
          name: "get_weather",
          arguments: "{\"city\":\"Paris\"}",
        },
      },
    ];
    assert.deepEqual(run.result.toolCalls, expected);
  }
}

test("Gemini's two calls in one step stay two calls, and the first keeps its signature", LlmClientTest.testGeminiCallsStaySeparate);
test("the next request sends the signature back on the call it came with", LlmClientTest.testSignatureGoesBack);
test("numbered pieces of two calls are joined as before", LlmClientTest.testNumberedPieces);
test("with no index, a piece with no id joins the call before it", LlmClientTest.testUnnumberedPiecesWithoutId);

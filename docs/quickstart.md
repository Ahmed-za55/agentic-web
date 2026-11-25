# Quickstart

Design an agent network in Neuro SAN Studio, build it into your website with the
agentify-website skill, and try it with your own LLM provider API key.

## Design an agent network with Neuro SAN and a major LLM provider API key

Quickly prototype an agent network using the
[Neuro SAN BYOK](https://neuro-san.evolution.ml/multiAgentAccelerator?) service.

1. In the settings (top right corner), select your LLM provider and enter your API key. 
   Test and Save.
   ![Neuro SAN Settings API keys](images/neuro_san_settings_api_keys.png)
  
1. Back to the main page, click the blue "+" button to create a new agent network.  
   ![Neuro SAN Create Agent Network](images/neuro_san_create_agent_network.png)
  
1. In the bottom right corner, type in your prompt and click the blue "Send" arrow button. For instance:
   ```prompt
   Create an assistant for a pizza restaurant website, with sub agents for menu, order and delivery
   ```
   ![Neuro SAN ANDE prompt](images/neuro_san_ande_prompt.png)  
   The agent network designer will create an agent network and come back with
   a proposed design and a few sample queries.
  
1. Click on the generated agent network that appears in the left panel menu as
   a "Temporary" agent network to interact with it.
   It will be available for 3 days before it is automatically deleted.  
   ![Neuro SAN Temporary Agent Network](images/neuro_san_temporary_agent_network.png)
  
1. The agents are not grounded yet, but you can test the agent network by typing in queries
   and clicking the blue "Send" arrow button.  
   ![Neuro SAN Chat](images/neuro_san_chat.png)
  
1. Update the design as needed: click the `Edit this network` `🖊️` icon next to the
   agent network name under "Temporary" in the left panel menu.
   Then use the "NETWORK EDITOR" prompt at the bottom of the screen,
   below the agent network graph to tell the agent network designer what to change.
   
1. Once satisfied, click the "Download network
   definition" icon `⤓` next to the agent network.
   This will download the `.hocon` file describing the agent network: its agents, their
   instructions and their tools.

The download is a design, not yet a website. It may use Neuro SAN Studio features that
do not run in the browser, such as `include` files, `${...}` substitutions and server
tools like `web_fetch`. Its agents may also be told to make up answers (`demo_mode`).

## Build it into your website with the agentify-website skill

The [agentify-website skill](../skills/agentify-website/SKILL.md) walks a coding agent
through turning a website into an open agentic website, given its source folder or a
public URL. It needs Node.js 22 or newer. Give it your download as a starting point: the
skill writes the network again in the browser's format, grounds every answer in the
site's own data and functions, and uses one agent unless a job needs its own.

1. Pick the website to agentify. To try it first, use
   [examples/marrow_point_pizza/](../examples/marrow_point_pizza/), a plain pizza
   restaurant site with a menu, a cart and a demo checkout.
1. Ask your coding agent to follow the skill, with your download. For instance, from the
   repository root:
   ```prompt
   Read and follow skills/agentify-website/SKILL.md to agentify the website in
   examples/marrow_point_pizza, into examples/my_pizza_agentified. Use my Neuro SAN
   design in my_pizza_network.hocon as a starting point for the agent network.
   ```
1. The agent reads the site and shows you its plan before it writes anything: the
   agents, the site functions they call, which ones the visitor must confirm, and what
   the site can't do. Check it and confirm.
1. The agent then copies the site and the browser runtime, connects the site's
   functions, writes the network, adds the assistant to the page, and builds and checks
   the published files with the skill's `scripts/build_network.mjs`.
1. Serve the result with the skill's server, which also lets other agent sites read the
   public files:
   ```shell
   node skills/agentify-website/scripts/serve_site.mjs examples/my_pizza_agentified --port 8080
   ```
   Then open the address it prints.

[examples/marrow_point_pizza_agentified/](../examples/marrow_point_pizza_agentified/) is
what an agent made from the pizza site by following the skill. Its network,
[little_oven_pizza.hocon](../examples/marrow_point_pizza_agentified/little_oven_pizza.hocon),
is one agent that reads the menu, fills the cart and places a demo order through the
site's own functions.

## Test with your own LLM provider API key

The skill adds an assistant section to the page, with a heading such as
**Ask Little Oven Pizza**, a chat and a settings panel.

### AI model settings (bring your own key)

Expand the `⚙ AI model settings` panel and paste your
[Otari](https://otari.ai) API key. The skill's site uses hosted Otari and
`alibaba/qwen3.8-flash` by default, so you can leave Model and Provider URL empty.

To use another provider, select it in the panel, which fills in its Provider URL and
Model. Or open `Advanced settings (optional)` and set the Model and an OpenAI-compatible
Provider URL yourself. For instance:
- API key: `*****`
- Model: `gpt-5.2`
- Provider URL: `https://api.openai.com/v1`

Then select the `Save and start` button.

On `localhost`, `127.0.0.1` and `[::1]`, the runtime also saves keys in a cookie that any
local site can read, so use a key with a low spending limit. When you are done, select
`Delete setup` under `Advanced settings (optional)` and close the tab.

> [!NOTE]
> The runtime calls the router straight from the browser, so the router must allow
> browser calls (CORS). OpenAI, OpenRouter, LiteLLM, [Otari](https://otari.ai) and a
> local Ollama do. Anthropic does too, unless your Anthropic organization refuses browser
> calls. Then use OpenRouter or LiteLLM for Claude models. See
> [LLM providers](providers/providers.md) for setup steps for each provider.

### Chat interface

You can now type a request in the chat and select `Send`.
For instance:
```prompt
Do you have gluten free options?
```
The assistant answers from the site's own data. Ask it to add a pizza to your cart, and
the cart on the page updates. Before anything that can't be undone, such as placing an
order, the browser asks you to confirm.

### Make it useful

Now connect your site to other agentic websites: see
[Connect to other agent networks](../README.md#connect-to-other-agent-networks).

The runtime the skill copies into your site is an example. Once you know how it works,
change your site's copy as you like. We fix bugs and conflicts with the
[spec](worldwide_agentic_web_mvp_spec.md) in the skill's runtime. To share a new feature
with other sites, open a pull request.

Happy hacking!

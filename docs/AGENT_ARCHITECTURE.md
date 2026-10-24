# Agent architecture and SDK options

## Current implementation

NemoDoc uses React/TypeScript with Vite in the browser and Express on Node.js on the server. Zod validates tool and workflow contracts; `pg` supports PostgreSQL persistence, with local JSON persistence also available. There is currently no OpenAI Agents SDK, LangChain, LangGraph, or Python agent service dependency.

`server/workspace/service.ts` plans and snapshots research teams. `application-research.ts` manages independent message histories, bounded tool loops, parallel researchers and a final reviewer. `worker.ts` handles cancellation, deadlines, recovery and task lifecycle. `model-routing.ts` resolves each agent's tested model profile; `agent-connections.ts` uses native `fetch` against OpenAI-compatible `/chat/completions` endpoints. Scoped read tools and citation validation remain server-enforced. Local traces record requests, responses, tools and progress.

The optional NemoClaw route sends requests to verified `openclaw/<agent-id>` targets. OpenClaw owns native agent workspaces and ongoing `AGENTS.md`/`SOUL.md` files. NemoDoc's runtime configuration editor uses its native RPC interface. An agent SDK would not replace that sandbox or its policy enforcement.

## Providers

Application-managed research already supports separate endpoint/model/key profiles per agent, including providers exposing compatible Chat Completions and function calling. Each profile must pass a tool-call/result round trip before assignment. This is compatibility support, not a claim that every model or provider feature works. Notebook Chat and Studio retain the existing Nemotron model policy.

| Provider                 | API base URL for a research profile                       | Credential     |
| ------------------------ | --------------------------------------------------------- | -------------- |
| OpenAI                   | `https://api.openai.com/v1`                               | OpenAI API key |
| NVIDIA hosted NIM        | `https://integrate.api.nvidia.com/v1`                     | NVIDIA API key |
| Gemini compatibility API | `https://generativelanguage.googleapis.com/v1beta/openai` | Gemini API key |
| Local compatible server  | Your loopback `/v1` endpoint                              | Optional       |

Use an exact model ID available to your account and test the selected model. Compatibility varies for tool calling, structured output, reasoning controls, token limits and request parameters. The optional NemoClaw route configures provider credentials and allowed inference routes in NemoClaw itself.

References: [NVIDIA LLM API](https://docs.api.nvidia.com/nim/reference/llm-apis), [Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai).

## Proposed SDK migration

The [OpenAI orchestration guide](https://developers.openai.com/api/docs/guides/agents/orchestration) distinguishes handoffs, where a specialist takes over, from agents as tools, where a manager owns the final answer. The research workflow should retain its explicit researcher fan-out and reviewer fan-in, using SDK `Agent`, `tool` and `Runner` within each stage. A future conversational triage agent could use handoffs. Replacing the loop should preserve budgets, citation repair, cancellation, connection-revision checks, approvals, persistence and local trace reporting.

For the existing TypeScript backend, the minimal SDK dependency is `@openai/agents`; Zod v4 is already installed. Add `openai` as a direct dependency if constructing clients for compatible endpoints. A provider model can be assigned independently to every agent. Loading each reviewed Markdown snapshot into its agent instructions requires no Markdown parser or Python service.

For native Gemini or broader provider coverage, the SDK offers `@openai/agents-extensions/ai-sdk`; install the extensions package and the desired AI SDK provider packages, such as `@ai-sdk/google`. The adapter remains beta and requires provider-specific verification. OpenAI's own models can use the SDK's built-in provider. NVIDIA can use a Chat Completions model configured with its endpoint and key. No LangChain/LangGraph installation is required.

Keep trace export explicit: the SDK enables tracing by default in supported server runtimes. Preserve NemoDoc's local trace behavior and configure or disable remote exporting deliberately, especially for non-OpenAI providers. A provider key is not an OpenAI tracing key.

This document describes a migration option; the current code still uses the custom runner.

References: [TypeScript quickstart](https://openai.github.io/openai-agents-js/guides/quickstart/), [models](https://openai.github.io/openai-agents-js/guides/models/), [AI SDK adapter](https://openai.github.io/openai-agents-js/extensions/ai-sdk/).

# Agent architecture

## Current implementation

NemoDoc uses the **OpenAI Agents SDK for TypeScript** (`@openai/agents`) for research planning, researchers, reviewers, evidence/proposal workflows, and personal/scheduled agents. React/TypeScript and Vite serve the browser; Express runs the server. Zod validates tool and workflow contracts; `pg` supports PostgreSQL persistence, with local JSON persistence also available. No Python agent service is needed.

`server/agent-runner.ts` creates SDK `Agent` instances with explicit instructions, `FunctionTool` definitions and a model adapter. SDK `Runner` owns the model/tool loop, tool dispatch and conversation history. Local tools execute serially within each agent; separate researchers can run concurrently. Only domain validation (such as citation repair) can request another SDK run, using the same cumulative call budget. Validated proposal tools can finish through SDK `toolUseBehavior` without another model call. Provider failures are not automatically retried.

`server/workspace/service.ts` runs the planner and snapshots reviewed research teams. `application-research.ts` defines researcher/reviewer behavior, scoped tool handlers, source budgets and citation validation. `research-team.ts` retains the legacy three-agent gateway workflow using the same SDK runner. `worker.ts` owns evidence/proposal workflows, cancellation, deadlines and recovery; `server/agent.ts` supplies personal/scheduled tools, audited file access and delivery lifecycle. The application still controls the explicit researcher fan-out and reviewer fan-in. It does not ask a triage model to decide whether required stages should run.

The `NotebookModel` adapter implements the SDK's public `Model` interface for NemoDoc's text-and-function-call protocol. It maps SDK history to Chat Completions messages and maps provider outputs back to SDK items. `model-routing.ts` resolves each agent's tested model profile; `agent-connections.ts` retains its credential-scoped, revision-checked `fetch` transport. This preserves provider-specific request controls and redacted local request/response traces. The adapter deliberately accepts extracted text rather than original PDF/file uploads. Missing usage remains unknown in application records even though SDK accounting requires numeric fields.

The SDK handles repeated tool-call IDs without replaying the tool. Duplicate IDs in one response are rejected before execution. Tests issuing separate actions use separate call IDs. Scoped read/write tools, permissions, citation checks, proposal review and delivery approvals remain server-enforced.

The optional NemoClaw route sends SDK-controlled requests to verified `openclaw/<agent-id>` targets. OpenClaw owns native agent workspaces and ongoing `AGENTS.md`/`SOUL.md` files. NemoDoc's runtime configuration editor uses its native RPC interface. The SDK does not replace that sandbox or its policy enforcement. Existing runs, schedules, proposals and browser backups keep their format; interrupted work is not automatically replayed.

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

## Agent definitions and maintenance

The [OpenAI orchestration guide](https://developers.openai.com/api/docs/guides/agents/orchestration) distinguishes handoffs, where a specialist takes over, from agents as tools, where a manager owns the final answer. NemoDoc uses programmatic orchestration with SDK agents for its required workflow stages. A future conversational triage agent could use SDK handoffs without changing provider profiles or evidence permissions.

The direct framework dependency is `@openai/agents`; Zod v4 is already installed. `runNotebookAgent` supplies the shared SDK lifecycle while each workflow supplies its request/usage observer, scoped tool implementation and final-answer validation. To add a tool, define its schema and permission checks in the relevant workflow, then register its definition with that agent. Avoid adding another hand-written model/tool loop.

Every research agent's reviewed Markdown snapshot is passed into SDK `Agent.instructions` alongside NemoDoc's application instructions. No Markdown parser or arbitrary filesystem path is required. To introduce a new provider protocol, implement the SDK's `Model` interface or add a supported provider adapter at this boundary; do not bypass saved-route checks or credentials isolation.

Native Gemini or other provider-specific protocols could use `@openai/agents-extensions/ai-sdk` with an appropriate provider package, such as `@ai-sdk/google`. Those packages are not installed in this migration; Gemini currently uses its compatibility endpoint like the other saved profiles. Provider support remains capability-tested rather than an assurance that every model supports tools or every request option.

SDK remote tracing is disabled on every NemoDoc `Runner`, and sensitive-data tracing is disabled as well. Existing redacted local traces continue to drive the dashboard and exports. NVIDIA, Gemini and local-model users do not need an OpenAI API key for orchestration. An OpenAI key is required only when using an OpenAI inference endpoint.

## Verification

Run `npm run verify` for boundaries, TypeScript, unit/API regressions and the build. `tests/agent-runner.test.ts` exercises actual SDK execution, tool/result history, citation repair, serial effects, terminal proposal behavior, unknown-tool auditing, duplicate/repeated call IDs, cancellation, call caps and disabled remote tracing. Workflow tests use deterministic provider/gateway fixtures. Run `npm run verify:agents -- agent-configuration.spec.ts research-team.spec.ts agent.spec.ts autonomous-tools.spec.ts` for isolated browser journeys. These tests do not establish live model quality, native Gemini support or NemoClaw containment; live tests remain opt-in.

References: [TypeScript quickstart](https://openai.github.io/openai-agents-js/guides/quickstart/), [models](https://openai.github.io/openai-agents-js/guides/models/), [AI SDK adapter](https://openai.github.io/openai-agents-js/extensions/ai-sdk/).

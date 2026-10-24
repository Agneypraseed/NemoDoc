# Agent models and roles

## Sub-features

Create and select agents; name; primary model and ordered fallbacks; exact model IDs; role templates and Markdown; draft preservation and save conflicts.

## How to get to it (user POV)

Choose `Agent`, then the primary `Settings` tab. Instructions open first; `Models` and `Advanced` keep other controls separate. Expand `Add an agent` to create another workspace. Overview also offers `Configure roles & models` and per-card `Agent settings`.

## Driving it with Playwright

Run `npm run verify:agents -- agent-configuration.spec.ts`. The spec uses `Configure agent`, `Models`, `Primary model`, `Instructions`, `Start from a template`, `Role template`, and the `AGENTS.md content` editor. It changes model order and checks the recorded native configuration, inserts a role without dropping surrounding instructions, previews Markdown, changes agents while retaining drafts, creates a new agent and selects it for NemoDoc. The second scenario changes the remote revision and verifies the stale save leaves the draft available, then verifies disconnected setup. These paths must not make inference calls.

## Gotchas

The model catalog and native files are external-boundary fixtures. Model saves can restart a real gateway; the UI requires explicit reload and re-test. Role guidance does not grant tool permissions. Overview entry buttons are separate navigation paths; a settings-only proof does not establish both overview entry paths. A fixture save is not proof of a live host write.

Each runtime agent retains its own native `AGENTS.md` and optional `SOUL.md`. Switching settings sections preserves edits; switching agents preserves drafts independently. Task-specific instructions for application-managed research teams are edited in the reviewed team plan, rather than native runtime files.

The mobile journey creates a missing `AGENTS.md` in the selected agent’s own workspace and verifies that a sibling agent is unchanged. It records `output/agent-instructions-mobile.png`.

The desktop journey imports a local Markdown draft using `Import AGENTS.md`, then switches agents, previews, saves and reloads it through the native RPC fixture. Import alone does not save the runtime file or invoke inference.

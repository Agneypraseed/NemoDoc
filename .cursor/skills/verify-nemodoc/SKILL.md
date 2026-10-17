---
name: verify-nemodoc
description: Verify NemoDoc's browser journeys through Playwright, including the homepage, agent monitoring, model and role settings, notebook persistence, and saving answers. Use after UI or API changes to capture evidence and distinguish fixture coverage from live runtime proof.
---

# Verify NemoDoc

Created using [pstack/create-verification-skill](https://github.com/cursor/plugins/blob/101b274dd991f694e1f7024be2157e5f3adf07de/pstack/skills/create-verification-skill/SKILL.md).

## Launch

From the repository root, use Node >=22.13 and `npm ci`. Install the browser and recording support with `npx playwright install --with-deps chromium ffmpeg` once. Run `npm run verify:agents` for the mapped agent journeys. This builds the real frontend and starts the real Express app serving it at `http://127.0.0.1:4179`. The log `NemoDoc API ready at http://127.0.0.1:4179` means workspace initialization completed. The homepage is at `/`; the notebook workspace is at `/app`. The browser must also load the sample PDF canvas before driving the overview.

The executable helper `scripts/verify-agents.sh` creates an empty temporary data directory, disables dotenv loading, clears provider/database credentials, and lets Playwright own startup and shutdown. Fresh browser contexts seed the built-in sample notebook. The agent specs each create their own ephemeral API server and inject the external NemoClaw reader; this does not install or run NemoClaw. Port 4179 is fixed: concurrent verification runs are unsupported and a listener already there causes a refusal, never reuse. Do not run against a personal session.

For a system browser, prefix with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`. This workspace also reuses `/usr/bin/ffmpeg`: `output/playwright/ffmpeg-1011/ffmpeg-linux` is a symlink to it and `PLAYWRIGHT_BROWSERS_PATH` points at that absolute `output/playwright` directory. Normal setups should use the installation command above. To drive only monitoring: `npm run verify:agents -- agent-overview.spec.ts`.

## Doctor

The overview journey checks the workspace HTTP response at `/app`, the NemoDoc document title, and the sample PDF canvas before interacting. These are read-only readiness checks on the Playwright-owned instance. If startup fails, check the build output and port conflict; never terminate another listener. A successful HTTP response alone is insufficient. Run `npm run agent:preflight` only when diagnosing a real NemoClaw host; fixture success does not imply that runtime exists.

## Drive

See [the feature map](features/README.md). Use the app's accessible buttons, searchbox, selectors and editor, as the specs do. The agent suite proxies real browser API requests to isolated Express instances, replacing only external runtime/inference boundaries. Do not replace save handlers or directly set React state to make a journey pass. Homepage, agent, and library journeys are included in `verify:agents`. The answer journey uses the existing development harness (`npm run test:e2e -- save-answer.spec.ts`); it requires exclusive ports 5173/3001 and a disposable development data directory and is not covered by `verify:agents`.

## Evidence

`output/verification/report/index.html` is the report. `output/verification/results/` retains traces of actions, network requests and resulting state, plus browser videos, including successful runs. Overview screenshots are `output/agent-overview.png` and `output/agent-activity-mobile.png`; role editing writes `output/agent-role-editor.png`. Artifacts contain fixture data. Subsequent runs overwrite this output: copy it to a unique evidence directory before another run if preserving a prior proof.

Assert both visible outcomes and effects: overview makes zero inference calls; settings writes reach the native RPC fixture, preserve sibling agents, and retain unsaved drafts on conflict. Report exactly which feature journeys ran. Screenshots alone do not prove saves. A real NVIDIA/OpenClaw/sandbox/SMTP run requires a separately configured runtime and explicit delivery scope; never describe these fixtures as live proof. Tests are not formal verification.

## Cleanup

Playwright closes the server it started; each spec closes its own API server and repository in `finally`. The shell EXIT trap removes only that invocation's temporary storage, including on test failures. Never kill by process name. Keep `output/verification` and screenshots. After a run confirm `test -s output/verification/report/index.html` and `test -s output/agent-overview.png`. If forcefully interrupted, inspect ownership before cleaning up a remaining process; do not remove unrelated temporary directories.

## Helpers

`npm run verify:agents` invokes executable `scripts/verify-agents.sh`. `npm run lint` checks source dependency boundaries and regression-tests the checker. `npm run verify` runs those checks, TypeScript, unit/API tests and build. CI also runs the browser suite and database integration checks. Keep feature descriptions aligned with the executable tests; use pstack's `/maintain-verification-skill` after changing journeys.

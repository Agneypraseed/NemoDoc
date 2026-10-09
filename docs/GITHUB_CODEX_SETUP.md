# GitHub Codex setup for NemoDoc

This is the setup for the built-in `@codex` agent invoked from a pull request comment. It does not require adding a GitHub Actions workflow.

## Account and repository requirements

1. Use the ChatGPT account connected to the GitHub account that posts the `@codex` comment.
2. Grant the Codex GitHub integration access to `Agneypraseed/NemoDoc` and permission to push to the feature branch.
3. Configure a **Codex Cloud (Legacy)** environment for this exact repository in the same ChatGPT account/workspace. Official documentation says GitHub task mentions use this legacy environment system; newer published cloud environments are a separate system.
4. Use the existing open draft PR #2, with head branch `codex/save-answer-to-notes` and base `main`. Leave it unmerged.

## Environment configuration

- Repository: `Agneypraseed/NemoDoc`
- Runtime: Node.js 22 or newer
- Image: default universal Linux image
- Setup script, run from the repository root:

```bash
set -euo pipefail
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("NemoDoc requires Node.js 22+")'
npm ci
npx playwright install --with-deps chromium
```

- Agent guidance: root `AGENTS.md` and `docs/SAVE_ANSWER_TO_NOTES.md`.
- Checks: `npm run check`, `npm test`, `npm run test:e2e`, and `npm run build`.
- Credentials: **none needed for Save answer to Notes or its standard tests**. No Nebius, NVIDIA, or OpenAI API key needs to be added for this task. This built-in integration uses the connected Codex account. A separately configured OpenAI Codex GitHub Action would require its own API credentials.
- No changes to production deployment, repository visibility, or branch protections are needed.

## Current blocker (2026-10-09)

The GitHub connector can read/write the repository, the owner has admin permission, and the Codex bot receives PR #2 comments. Both implementation attempts received: "To use Codex here, create an environment for this repo." No implementation task started.

The signed-in newer cloud settings contain a NemoDoc environment. Both the bot's legacy settings URL and the legacy URL in the official documentation redirected to the ChatGPT home page in the inspected session. The environment-system mismatch is a plausible explanation, but the exact account-side cause has not been confirmed.

If the legacy environment controls remain inaccessible, contact OpenAI support with the PR link, bot response, both redirects, and the existing environment name. Ask how to associate this repository with an environment usable by the built-in GitHub `@codex` implementation tasks. Reinstalling the GitHub app or adding API keys has not been established as a fix.

## Official references

- [GitHub task mentions](https://learn.chatgpt.com/docs/third-party/github#give-codex-other-tasks)
- [Codex Cloud (Legacy)](https://learn.chatgpt.com/docs/environments/cloud-environment)
- [Newer cloud environments and the legacy distinction](https://learn.chatgpt.com/docs/environments/cloud-environments)
- [Draft PR #2](https://github.com/Agneypraseed/NemoDoc/pull/2)

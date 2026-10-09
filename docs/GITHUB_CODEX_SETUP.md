# GitHub Codex setup for NemoDoc

This is the setup for the built-in `@codex` agent invoked from a pull request comment. It does not require adding a GitHub Actions workflow.

## Account and repository requirements

1. Use the ChatGPT account connected to the GitHub account that posts the `@codex` comment.
2. Grant the Codex GitHub integration access to `Agneypraseed/NemoDoc` and permission to push to the feature branch.
3. Configure a **Codex Cloud (Legacy)** environment for this exact repository in the same ChatGPT account/workspace. Official documentation says GitHub task mentions use this legacy environment system; newer published cloud environments are a separate system.
4. Start from a feature branch or pull request and give the agent a specific task. Review and test its changes before merging.

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

## Legacy environment setup (2026-10-09)

The initial implementation attempts reported a missing repository environment. The newer NemoDoc cloud environment did not supply a legacy environment for GitHub task mentions.

The review bot's settings link opened the working [Legacy Codex Cloud settings](https://chatgpt.com/settings/cloud-environments). That page showed no legacy environments. A separate **NemoDoc GitHub Codex** environment was then created for `Agneypraseed/NemoDoc`, with Node.js 22, the setup script above, container caching, and a maintenance script that runs `npm ci` and `npx playwright install chromium`.

Agent internet access stays off after setup, and no provider secrets are configured. This built-in workflow uses the ChatGPT subscription's Codex allowance; API billing is separate. Use [Legacy Codex Cloud settings](https://chatgpt.com/settings/cloud-environments) to maintain this environment, rather than the newer environment setup screen.

The GitHub task successfully implemented Save to Notes in [the cloud task](https://chatgpt.com/remote/task_e_6ac8e3111658832e90673a2799213866). Its checkout had no Git remote, so publication required applying the agent changes to the existing PR branch and pushing from the local checkout. Independent verification also corrected interrupted-answer handling. No API-billed GitHub Action was used.

## Official references

- [GitHub task mentions](https://learn.chatgpt.com/docs/third-party/github#give-codex-other-tasks)
- [Codex Cloud (Legacy)](https://learn.chatgpt.com/docs/environments/cloud-environment)
- [Newer cloud environments and the legacy distinction](https://learn.chatgpt.com/docs/environments/cloud-environments)
- [Save to Notes PR #2](https://github.com/Agneypraseed/NemoDoc/pull/2)

# Agent activity

Run `npm run verify:agents -- agent-overview.spec.ts`. The browser opens **Agent → More → Agents**, reads local activity, searches by title, filters by status, and confirms that viewing activity makes no inference calls.

The API test in `tests/agent-monitor.test.ts` checks notebook scoping, credential redaction and bounded database reads. Deterministic fixtures do not prove live provider behavior.

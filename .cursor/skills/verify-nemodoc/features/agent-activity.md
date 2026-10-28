# Agent activity

Run `npm run verify:agents -- agent-overview.spec.ts`. The browser checks that Agent opens to Research without a task-type selector, that More retains tasks/schedules and study tools, and that Assistant has no duplicate activity list. It then opens Dashboard, filters recorded research/task activity by status, and confirms navigation makes no inference calls. Dashboard rows in this navigation test are deterministic fixtures; `research-team.spec.ts` separately exercises dashboard inspection against real stored fixture traces.

The API test in `tests/agent-monitor.test.ts` checks notebook scoping, credential redaction and bounded database reads. Deterministic fixtures do not prove live provider behavior.

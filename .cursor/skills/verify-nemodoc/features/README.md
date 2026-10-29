# NemoDoc feature map

| Feature                                 | Journey                                                                      | Harness                                                |
| --------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| [Homepage](homepage.md)                 | Introduction, interactive demos, FAQ, workspace entry                        | `npm run verify:agents -- home.spec.ts`                |
| [Agent activity](agent-activity.md)     | Research-first navigation, secondary tools and Dashboard status filters       | `npm run verify:agents -- agent-overview.spec.ts`      |
| Agent delegation                       | Unified agent instructions, web and notebook specialists, activity and traces | `npm run verify:agents -- agent-orchestration.spec.ts` |
| [Notebook library](notebooks.md)        | Search, create and reopen persisted notebooks                                | `npm run verify:agents -- library.spec.ts`             |
| [Research teams](research-teams.md)     | Unified scheduled team jobs, saved role instructions, pause/resume and mobile   | `npm run verify:agents -- research-team.spec.ts`       |
| [Save answers](save-answer.md)          | Preserve interruption state across reload and backup                         | `npm run test:e2e -- save-answer.spec.ts`              |
| [Autonomous tools](autonomous-tools.md) | Upload/select files, optional web research, audited file output and download | `npm run verify:agents -- autonomous-tools.spec.ts`    |

Notebook-wide graph: `npm run verify:agents -- notebook-graph.spec.ts` exercises a cited answer saved through the UI, its source-page link, graph/table display, search, reload, note navigation, and mobile overflow. Unit tests in `tests/notebook-graph.test.ts` cover source scoping and provenance. This view uses saved records and makes no inference requests.

Homepage, agents, and library use the isolated production-build verification harness. Save answers uses the existing development harness and is not covered by the default verification run. See each map's preconditions and limitations.

`agent.spec.ts` verifies personal memory and reusable skills, a task completing while its browser tab is closed, saved results in Studio, source revocation and mobile layout. Its fixture uses a temporary agent store, workspace and trace spool; reopened tabs proxy API calls to that isolated backend through Playwright. It exercises the real OpenAI Agents SDK runner with deterministic provider responses.

Search provider setup is covered by `npm run verify:agents -- search-connections.spec.ts`: General/Search settings navigation, Tavily/Exa/Firecrawl setup, save-and-test, invalid-key recovery, masked credentials, provider switching, disconnect and mobile layout. The browser calls an isolated real Express backend with fixture provider responses, not live services.

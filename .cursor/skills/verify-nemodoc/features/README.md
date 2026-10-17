# NemoDoc feature map

| Feature                               | Journey                                                         | Harness                                                |
| ------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| [Agent activity](agent-activity.md)   | Roster, status, search, filters, offline recovery               | `npm run verify:agents -- agent-overview.spec.ts`      |
| [Models and roles](agent-settings.md) | Create/select agents, ordered models, Markdown edits, conflicts | `npm run verify:agents -- agent-configuration.spec.ts` |
| [Notebook library](notebooks.md)      | Search, create and reopen persisted notebooks                   | `npm run test:e2e -- library.spec.ts`                  |
| [Save answers](save-answer.md)        | Preserve interruption state across reload and backup            | `npm run test:e2e -- save-answer.spec.ts`              |

The first two use the isolated production-build verification harness. The remaining journeys use the existing development harness; they are not implicitly covered by an agent-only run. See each map's preconditions and limitations.

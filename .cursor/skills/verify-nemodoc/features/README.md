# NemoDoc feature map

| Feature                               | Journey                                                         | Harness                                                |
| ------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| [Homepage](homepage.md)               | Introduction, interactive demos, FAQ, workspace entry           | `npm run verify:agents -- home.spec.ts`                |
| [Agent activity](agent-activity.md)   | Roster, status, search, filters, offline recovery               | `npm run verify:agents -- agent-overview.spec.ts`      |
| [Models and roles](agent-settings.md) | Create/select agents, ordered models, Markdown edits, conflicts | `npm run verify:agents -- agent-configuration.spec.ts` |
| [Notebook library](notebooks.md)      | Search, create and reopen persisted notebooks                   | `npm run verify:agents -- library.spec.ts`             |
| [Save answers](save-answer.md)        | Preserve interruption state across reload and backup            | `npm run test:e2e -- save-answer.spec.ts`              |

Homepage, agents, and library use the isolated production-build verification harness. Save answers uses the existing development harness and is not covered by the default verification run. See each map's preconditions and limitations.

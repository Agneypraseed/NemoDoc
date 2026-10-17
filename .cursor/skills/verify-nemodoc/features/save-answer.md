# Save answers to notes

## Sub-features

Interrupted-answer state, save eligibility, reload, backup restore.

## How to get to it (user POV)

Open a notebook, ask a question in chat, and use the answer's Save to Notes action when eligible.

## Driving it with Playwright

Run `npm run test:e2e -- save-answer.spec.ts --trace on` against a disposable development instance with exclusive ports 5173/3001. The spec interrupts an answer and checks it remains unsaveable after reload and backup restore. Fill `Ask about your sources` and press Enter. After the interrupted response, `Save to Notes` must be absent. Reload, choose `Notebook actions` → `Back up notebook`, restore via `Restore notebook backup`, and open the restored notebook through `All notebooks`; the save action must remain absent. Consult `docs/SAVE_ANSWER_TO_NOTES.md` for the full save contract; this negative journey does not prove successful streaming or every save entry point.

## Gotchas

Not included in the agent verification command. A partial answer must not become saveable merely because a page reload or archive restore occurred. Live provider tests are opt-in and require separate credentials. Do not weaken the interrupted-answer precondition to obtain a passing test.

# NemoDoc agent guidance

NemoDoc is a local notebook for PDFs and lecture slides with source-grounded Nemotron chat. The frontend uses React, TypeScript, Vite, and browser IndexedDB; the Express backend handles inference and personal-agent features.

## Setup and validation

- Use Node.js 22 or newer and install dependencies with `npm ci`.
- For browser tests on Linux, install Chromium and its system dependencies with `npx playwright install --with-deps chromium` during environment setup.
- `npm run check` checks TypeScript; `npm test` runs unit/API/data tests; `npm run test:e2e` runs browser tests; `npm run build` checks and builds the application.
- Playwright starts the development server automatically. `npm run dev` serves the frontend on 127.0.0.1:5173 and backend on 127.0.0.1:3001.
- Standard tests do not require provider credentials. Live tests are explicitly opt-in; do not enable them for routine feature work.

## Data and implementation

- Preserve notebook notes and browser persistence. Keep ZIP backup validation compatible with older backups when adding optional fields.
- Reuse `src/lib/citations.ts` for citation interpretation. Do not present uncited retrieval candidates or invalid references as supporting evidence.
- Preserve edits and message metadata when streamed answers finish, including when another completed answer is saved during streaming.
- Keep PDF page/slide previews and downloads local. Keep the current Nemotron model policy intact.
- Never commit credentials, `.env`, private documents, or the ignored `data/` and `output/` directories. Use isolated deterministic fixtures for tests.

## GitHub work

- Implement the requested task on its PR branch, commit and push there, and report checks and limitations accurately.
- Do not merge a PR or push feature changes to main unless the user explicitly requests it.
- For Save answer to Notes, follow `docs/SAVE_ANSWER_TO_NOTES.md`.

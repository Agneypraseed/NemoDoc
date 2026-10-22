# Research teams

Run `npm run verify:agents -- research-team.spec.ts` with the isolated verification harness.

The browser journey uses a fresh context and temporary Express backend. It replaces only provider and optional runtime boundaries with deterministic fixtures. It saves/tests the Tavily connection, approves an original synthetic PDF, generates and edits a team plan, adds/removes researchers, checks stale-plan blocking, and runs application-managed research. It verifies parallel researcher activity, reviewer synthesis, persisted notebook/web evidence, web excerpts, local citation navigation, token usage and trace inspection. A screenshot is retained in `output/research-team.png`; the verification harness retains browser traces and video.

This establishes application behavior with fixtures. It does not prove live Nemotron accuracy, Tavily availability, or NemoClaw containment. Backend tests separately cover legacy NemoClaw routing, cancellation, bounded concurrency, failure, citation isolation, JSON reload, unsafe web addresses and restart recovery. PostgreSQL integration requires isolated database credentials.

## Optional live MML acceptance

With explicit authorization to send retrieved book excerpts to the saved model provider and incur provider charges, set `NEMODOC_MML_RESEARCH_LIVE=1` and run `npm run verify:agents -- research-team-live.spec.ts`. Supply the local PDF as `data/mml-book.pdf` or `NEMODOC_MML_BOOK`; the test reads only the saved notebook model connection from `data/settings.json`.

The live journey creates a fresh browser notebook and isolated server workspace, uploads the actual book through the UI, generates and reviews a real plan, and lets the normal worker execute the research team. It records each agent's visible assignment/stage/status, checks overlapping researcher spans and subsequent reviewer execution, inspects the persisted trace, navigates a local supporting page, and reloads the UI to verify the report remains recorded. Model calls and responses are never mocked or delayed. Screenshots, video, request timings, observations, workspace and server traces stay in a unique ignored `output/mml-research-live-*` directory. The Playwright browser trace is retained by the standard verification report under `output/verification/`. The test skips unless explicitly enabled; it does not enable web research or load delivery credentials.

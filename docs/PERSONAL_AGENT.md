# Personal AI upgrade

NemoDoc is a personal research and study agent for the [Personal AI track](https://nebiusglobalaihackathon.devpost.com/rules). This upgrade adds persistent notebook memory, editable reusable skills, scoped document tools, user-controlled progress learning, and an independent local background worker. Existing reader, markup, retrieval, visual Q&A and study features remain available.

## Implementation and acceptance

- Nebius Token Factory uses its documented `/v1/chat/completions` and `/v1/models` routes with a server-side Bearer key. The model catalog prevents relying solely on a hardcoded provider ID. NVIDIA hosted and user-run local model endpoints remain options.
- Provider-specific embedding/reranking payloads are separate from portable chat requests. Keys do not follow a changed chat host or get forwarded to a different provider's capability endpoint.
- Memory is scoped to a notebook. Users can edit goals, deadlines, preferences and progress. Quiz results become memory only through an explicit action. The next run reads current progress so a weak-topics skill can adapt its questions.
- Skill instructions are editable and persistent. They guide a real function-calling loop; they cannot extend the tool authority granted to a task.
- Document permissions require explicit local text caching consent, plus a per-task source subset. Source tools validate scope at runtime. Revocation clears the snapshot, aborts current work and pauses affected tasks. Source snapshots are not silently refreshed from the browser.
- The server executes due tasks without the browser. Runs are serial and bounded to eight model calls, twenty tool actions and three minutes. Daily/weekly tasks and one-time follow-ups survive restart. Follow-ups cannot create more follow-ups. A restart does not replay partially completed tool actions.
- Inbox results include cited passages, action history and disclosure of sent context. Tasks can pause, resume, rerun or cancel. Provider/model changes cannot silently redirect scheduled work.
- Browser notebook ZIPs and server agent archives are separate. Export or preserve both for backup. The agent export is not an automatic restore importer. Erase controls cover cached text and historical context. Local files are unencrypted and the server binds loopback only.

## Verification record

- TypeScript check: passed during implementation.
- API/data checks: 27 passed, including agent execution, scoped memory, forged citations, unauthorized tool calls, bounded iteration, follow-up permissions, cancellation, serial execution, source revocation, provider changes, durable scheduling, restart behavior, nullable provider tool responses, Nebius capability defaults and constrained study output.
- Production build: passed after the final application changes. Rollup reports harmless annotation warnings from Zod; compilation and bundling succeed.
- Browser checks: the 11 existing flows and 2 new agent/provider flows pass. New coverage uses a real local worker with deterministic provider responses, closes the browser while a task becomes due, reopens the inbox and saves its cited artifact to Studio. It also covers source consent, memory editing/deletion, custom skills, quiz progress memory and provider presets. Desktop and mobile screenshots are checked; the mobile screenshot waits for the existing sidebar transition to settle.
- Live Nebius/NVIDIA inference: verified on 2026-10-08 with actual responses from `nvidia/Nemotron-3_5-Lightning` on Token Factory. PDF chat/citations, quiz generation, progress memory, personalized plans, cited agent flashcards and a scheduled quiz completed with the browser closed. Real Qwen embeddings and MiniCPM image/OCR calls also succeeded. See [live verification](LIVE_VERIFICATION.md) for setup, isolation and limits; deterministic tests remain separate from live evidence.

## Live verification

1. Run NemoDoc locally and open Settings. Choose Nebius and save a Token Factory key. Alternatively set `NEBIUS_API_KEY` in ignored `.env`, choose a model via `NEBIUS_MODEL`, and restart. Saved Settings override environment defaults.
2. Load the saved provider's model catalog. Choose an account-visible NVIDIA Nemotron model that supports tools. Save and test it. Check the returned answer and the timestamp/model/endpoint receipt in Agent → Sources.
3. Approve a small non-sensitive notebook. Add a goal/deadline and a study preference. Run **Prepare for an exam** with permission for one review.
4. Verify actual search/read tool calls, cited materials, a stored plan, and a follow-up if the model requests it. Inspect the retrieved text against the source. Save the quiz/cards to Studio, record a quiz result, then run **Quiz weak topics** to confirm it uses that memory.
5. Schedule a second small task, close the browser, leave the server running, then reopen and inspect its completed history. Revoke a source and confirm later tasks pause before accessing it.

## Submission demo (under three minutes)

- 0:00–0:25: Explain the personal study/research use case. Show Nebius connection, an NVIDIA model selected from the live catalog and a successful connection receipt. Hide keys.
- 0:25–0:55: Read/annotate a PDF, show page selection and book/vertical layouts. Add an exam deadline and study preference.
- 0:55–1:25: Approve sources, choose the exam-prep skill and run a small task. Show real tool actions, citations and a study plan.
- 1:25–2:00: Open cited practice in Studio. Answer a quiz, remember the result and show weak topics in memory.
- 2:00–2:35: Show a scheduled task's completed run after closing/reopening the browser, its action history, and pause/revoke controls.
- 2:35–2:55: Show local data controls, the public source repository, MIT license and setup instructions. Explain that Nebius receives only the approved task context and retrieved passages, while originals remain in local browser storage.

The rules require an actual Nebius runtime call or eligible Nebius AI Cloud execution, at least one NVIDIA open-source model, public licensed source with setup instructions, an accessible working demo/test build, and a public video under three minutes. A local app can meet the runtime route through Token Factory; Serverless deployment is optional for this route. A NVIDIA-hosted-only demo does not meet the Nebius runtime requirement. Confirm the selected model's open-source license from its official model card and list it in the final submission. Preparing these notes does not submit the project or create a demo video.

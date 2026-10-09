# Live Nebius verification

**Historical record (2026-10-08).** The current MVP permits Nemotron models only. The Qwen/MiniCPM checks below describe the earlier implementation; those defaults and live test calls have been removed. `tests/e2e/live.spec.ts` now exercises Nemotron chat/study/agent with local keyword retrieval. See [the MML book verification](MML_VERIFICATION.md) for the current real book answer and page-download demo.

Verified on 2026-10-08 using the user's configured Token Factory key. These checks made actual inference requests; no provider responses were mocked.

## Connection and models

- API base: `https://api.tokenfactory.nebius.com/v1`.
- Chat, study generation and personal agent: `nvidia/Nemotron-3_5-Lightning`.
- Semantic retrieval: `Qwen/Qwen3-Embedding-8B`.
- Page-image questions and OCR: `openbmb/MiniCPM-V-4_5`.
- All three IDs appeared in the real account-visible model catalog. The running app loaded the ignored `.env` key, and its connection test succeeded.

NVIDIA publishes the Lightning family with an [OpenMDW-1.1 license](https://huggingface.co/nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16/blob/main/LICENSE). The hosted served ID follows the [Nebius Nemotron cookbook](https://github.com/nebius/token-factory-cookbook/blob/main/models/nemotron/README.md); the API response does not establish the exact hosted weight precision. Qwen and MiniCPM handle optional capabilities while NVIDIA Nemotron powers the agent.

## Observed workflow

The test uploaded an original two-page PDF about learning techniques and a small vocabulary experiment into a fresh browser notebook. It selected and annotated text, asked a factual question, checked both returned counts against the fixture and clicked a citation back to page 2.

The real model generated a quiz. The test answered it, explicitly saved missed questions as progress memory, added a 25-minute session preference and approved the PDF for agent use. Real embeddings retrieved the experiment passage. The exam-prep agent searched approved sources, saved a cited flashcard deck, updated a personalized plan and scheduled one permitted review. The review was cancelled immediately after verification. The deck was saved into browser Studio.

A second task became due with the browser tab closed. The local worker read current progress memory, searched approved text and saved a cited weak-topics quiz. Reopening the browser showed the completed run in the inbox. This verifies browser-independent execution while the local server remains running.

A generated page image was sent through actual vision and OCR endpoints. Both vocabulary counts were recognized; OCR returned readable text with three normalized regions. Separate real calls generated a guide, a ten-card deck and a ten-node mind map with valid citations. The UI quiz and agent-generated quiz cover the fourth study format.

## Fixes found through real inference

- Nebius defaults now select available embedding and vision models instead of carrying over NVIDIA-hosted IDs.
- Nemotron final responses include `tool_calls: null`. The agent now accepts this valid response while retaining validation of actual calls, arguments and citations.
- Agent instructions describe the eight-call budget and tell it to combine practice topics and continue after successful actions. Save results identify the material kind, title and item count. This reduced repeated saves in the verified exam-prep workflow.
- Study requests now provide a kind-specific schema in the prompt and use Nebius's documented [JSON-schema response format](https://docs.tokenfactory.nebius.com/ai-models-inference/json). Guides do not include unrelated quizzes/maps; practice items use `citationIds` arrays and quizzes require choices and a correct index. Malformed model output is reported as a provider error rather than incorrectly blaming the user's request.

## Repeat the checks

Start the app, configure `NEBIUS_API_KEY` in ignored `.env`, then run in PowerShell:

```powershell
$env:NEMODOC_LIVE='1'
npx playwright test tests/e2e/live.spec.ts
Remove-Item Env:NEMODOC_LIVE
```

The opt-in suite uses an isolated real local API server and fresh browser context. Only its original fixture is sent; user documents, memories and tasks are untouched. Temporary agent state is removed after the test. Real hosted calls consume inference credits. Sanitized receipts, result summaries and a screenshot are stored in ignored `test-results/`; subsequent Playwright runs can replace those files. Keys are never returned to the browser or recorded in test evidence.

Both live scenarios passed. The final code also passed 27 API/data tests and the production build; all 13 existing browser flows passed. Normal browser runs skip the two opt-in live scenarios. Deterministic regression tests separately cover permissions, cancellation, restart persistence and bounds. This is functional evidence, not a guarantee of model accuracy, provider availability or hackathon judging. Reranking remains disabled and was not live-tested. Keep the local server running for scheduled work.

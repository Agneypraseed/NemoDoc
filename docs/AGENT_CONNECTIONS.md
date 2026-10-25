# Open models, notebook notes and result delivery

The Agent tab can use its own OpenAI-compatible model endpoint, independently of the notebook's Nemotron connection. It can read approved notebook note snapshots and send completed answers by email or WhatsApp Business. Incoming email and WhatsApp conversations are not imported in this version.

## Set up a model

To use the NVIDIA Nemotron model you already use in notebook chat, keep **Use notebook’s Nemotron connection** selected in **Agent → Connections**. This is the default. Its current model ID and endpoint are displayed; no separate model or key is needed when the notebook connection is configured. The agent runs a real tool loop with this same model.

1. Open **Agent → Connections** and choose **Use a separate OpenAI-compatible model**.
2. For local Gemma 4, install [Ollama](https://ollama.com), start its server and run `ollama pull gemma4:e4b`. Use `http://localhost:11434/v1` and model ID `gemma4:e4b`. Local endpoints do not need an API key. Choose a model size that fits your hardware.
3. For OpenAI, choose **Use OpenAI API**, enter an API key, and select the exact model ID. For NVIDIA or another hosted endpoint, enter its OpenAI-compatible chat API base URL, exact model ID and provider key. The model must support function calling through that endpoint.
4. **Save model connection**, then **Test saved model**. The test requires a function call and a reply that uses its result. Separate models must pass before tasks can run.

Existing notebook Chat and Studio generation keep their Nemotron policy. Switching an agent connection does not change them. Agent study materials can still be saved to Studio.

## Research models and automatic task routing

Under **Agent → Connections → Research models & task routing**, add named OpenAI-compatible model profiles with their endpoint, exact model ID and credential. Declare their capabilities (planning, research, mathematics, review), strengths and cost tier. Save each profile and **Test model**: the test makes two inference requests to verify both a tool call and consumption of its result. Only tested profiles can be assigned. These hints describe your preferences; NemoDoc does not benchmark models or retrieve current prices.

Select a **Planner model** and **Routing priority** (balanced, cost or quality), then save preferences. Generating a research plan asks that planner to match each assignment to the available tested models and explain its choices. Review or override each **Assigned model** before starting. One model can still handle the whole team using the current notebook/custom connection; additional installations are unnecessary. Custom profiles can use different providers or models on the same provider. Notebook Chat and Studio retain their existing policy.

Runs snapshot their planner, assignments, selected profiles, configured model IDs and selection reasons. Agent cards show those choices, provider-reported model IDs when returned, progress, findings and usage. Changing evidence, requests or routing configuration invalidates a draft. Editing/removing a selected connection prevents queued work or subsequent requests from using a changed route; errors never silently switch models.

Profile credentials remain in the local server settings beside the workspace file (`*.model-profiles.json`), with masked API/UI responses and trace redaction. Back up this settings file securely alongside other connection settings; it is separate from PostgreSQL workspace records and browser ZIP backups. Changing provider origin clears the old key unless explicitly replaced. Each configured provider receives the task context and retrieved evidence needed for its assignment.

## Approve notebook notes

In **Agent → Sources**, select **Notebook notes, saved answers and annotations**, check the extracted-text consent and save permissions. You can approve notes alone or combine them with documents. Each task selects a subset of approved sources.

The snapshot uses the same Markdown export as notebook notes, including saved answers, passage notes and annotations. Note citations identify a snapshot section and show the exact retrieved excerpt. They do not claim to be PDF page citations. Saved Studio materials retain their note excerpts, including after ZIP backup/restore.

Notes are not silently synchronized. After editing, save source permissions again to replace the snapshot. Revoking it removes the cached notes and pauses affected tasks. Browser notebook notes are preserved. Hosted models receive only task context and retrieved passages; local inference uses your local endpoint.

## Email through standard SMTP

Use an existing mailbox's SMTP settings in **Agent → Connections**. Enter the SMTP host, port, encryption, username, sender email address, mailbox/app password and recipient, then save. SMTP adds no email API account or subscription; your mailbox provider's limits and account eligibility still apply. The app uses the open-source [Nodemailer SMTP transport](https://nodemailer.com/smtp).

For a free personal Gmail sender, choose **Use Gmail SMTP settings** (`smtp.gmail.com`, port `587`, STARTTLS); the sender address fills the username when it is blank. Use a Google app password with two-step verification enabled. The preset can be undone before leaving Connections, and a saved Gmail configuration can be switched back to custom settings. This version implements SMTP password/app-password authentication. TLS on port `465` is also available. Certificate verification and encrypted SMTP are required; credentials are cleared when the SMTP host or username changes. [Google's mail-client guidance](https://support.google.com/mail/answer/7126229)

The password field is intentionally masked and blank after saving; the status below it confirms whether a password is stored. **Clear password** deletes a saved password from the local server, or clears a newly typed unsaved password. **Test saved SMTP connection** uses the saved host, port, encryption, username and password to connect and authenticate (`verify`); it does not send a message or check the recipient address. A successful result confirms the server accepted the connection and login at that time. For a completed result, choose **Preview email**, inspect the sender, recipient and exact answer, then **Send**. Saving or previewing sends nothing. The SMTP account must allow the configured sender address. A Proton recipient can receive mail from another provider; the recipient address does not determine which mailbox sends the message.

## WhatsApp Business

Set up [Meta's WhatsApp Business Platform](https://developers.facebook.com/docs/whatsapp/cloud-api/overview). Enter the **phone number ID** (not the phone number), access token, recipient in international format and supported Graph API version. Save the connection. This uses the Business API rather than a personal WhatsApp login or QR session.

Text messages without a template require an open 24-hour customer-service window and are limited to 4096 characters. For scheduled messages outside that window, configure an approved summary template with exactly one body variable, for example `Your study summary: {{1}}`, and its language code. This integration limits template summaries to 1000 characters; ask for a short, single-paragraph answer. Longer results fail with a clear error; they are never silently truncated. Meta's account eligibility, template approval and messaging charges apply.

Choose **Preview WhatsApp** on a completed result to inspect the answer, recipient and template, then send. Outbound delivery needs no public webhook. Two-way conversations and confirmed recipient-delivery events would require a separately secured webhook; the local administration server continues to bind loopback only.

## Automatic delivery and history

For “Every weekday at 8:00, read my selected study notes, create a short revision summary, and email it to me”:

1. Select the current notebook’s NVIDIA connection and configure your existing sender mailbox's SMTP connection and recipient.
2. Approve the selected notebook notes in **Sources**.
3. Create a task with the prompt “Read my selected study notes and write a short revision summary with three useful points and one recall question.” Choose a relevant skill and the approved notes.
4. Set **Repeat → Weekdays (Monday–Friday)**, **08:00**, **Europe/Berlin**, and select the email recipient shown in the form.
5. Choose **Schedule task**. The next weekday due time appears in the task card. **Run now** creates an immediate example using the same model, notes and approved email recipient, while preserving the weekday schedule.

The calendar schedule follows the chosen time zone, including daylight-saving changes, and skips weekends. The worker starts generation at the scheduled time; the email follows generation. Leave the local server running. If restarted late on a weekday after the chosen time, it catches up once; weekend and early-morning restarts wait for the next scheduled morning. Existing daily/weekly intervals retain their previous behavior.

When creating a task, select Email and/or WhatsApp to authorize delivery to the configured recipient after each successful run. Leave both unchecked for in-app results with manual previews. Automatic delivery sends the completed answer, not original attachments. The model cannot choose recipients or call messaging tools. Follow-up reviews do not inherit automatic delivery.

Tasks retain their selected model, delivery recipients and connection revisions. Saving any connection pauses existing active tasks. Changed delivery settings require a new task so an older schedule cannot send to a different recipient. A failed automatic delivery pauses its task while preserving the completed answer for inspection.

History distinguishes **accepted** (successful submission with a message ID), **failed** (a definite validation/provider rejection), and **unknown** (network uncertainty or interruption). Accepted means submitted, not confirmed delivered to the recipient. Concurrent or repeated sends of the same run/channel are blocked after acceptance or an uncertain attempt. Definitely rejected attempts can be previewed and retried manually. An interrupted delivery becomes unknown on restart and is not replayed automatically.

## Local storage and verification

Connection credentials are saved in `data/agent.json.connections.json`, with owner-only file permissions, separately from agent history. They are excluded from API responses and agent/ZIP exports. The files are not encrypted at rest. Protect the local data directory; remove saved keys in Connections when disconnecting. Erasing agent history does not erase connection settings.

Routine tests use deterministic inference/messaging responses and a private loopback SMTP server with test credentials. They verify real encrypted SMTP submission without contacting external inboxes. Live model availability, delivery from your mailbox and Meta account access need your configured credentials and a deliberate test from the app.

References: [Gemma capabilities](https://ai.google.dev/gemma/docs/core), [Ollama API compatibility](https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx).

## Web research

Open **Settings → Search** (or **Agent → Connections → Web search**). Choose Tavily, Exa or Firecrawl, enter the provider’s API key, and select **Save & test search**. Endpoints and authentication are configured automatically. Testing runs one search and reads one public page; both must succeed. Saved keys remain separate when switching providers and are never returned by the API. **Disconnect search** removes the selected provider’s key. Existing Tavily settings are retained.

Enable web access separately for each research run. Queries can contain information from selected sources. Notebook-only research remains available without a search provider. Search results become citable only after their page text is read; the same public-URL validation applies to every provider.

Provider API references: [Exa search](https://exa.ai/docs/reference/search), [Exa contents](https://exa.ai/docs/reference/get-contents), [Firecrawl search](https://docs.firecrawl.dev/api-reference/endpoint/search), and [Firecrawl scrape](https://docs.firecrawl.dev/api-reference/endpoint/scrape).

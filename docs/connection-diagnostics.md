# Connection Diagnostics — v0.11 developer preview

This milestone adds **manual, non-generative live diagnostics** so users can test Google authorization and BYOK model availability without submitting a paid chat prompt or exposing Google event/task contents in a diagnostic report.

## BYOK: Verify model access

In the Super Tab or Ayarime sidebar, select a provider and model, grant the optional Firefox host/data permissions and enter a session-only API key. Select **Verify model access · no generation**. The extension performs one authenticated HTTPS `GET` to the provider's model-metadata endpoint:

- OpenAI: `GET https://api.openai.com/v1/models/{model}` — [API reference](https://developers.openai.com/api/reference/resources/models/methods/retrieve)
- Anthropic: `GET https://api.anthropic.com/v1/models/{model}` — [API reference](https://platform.claude.com/docs/en/api/models/retrieve)
- Gemini: `GET https://generativelanguage.googleapis.com/v1beta/models/{model}` — [API reference](https://ai.google.dev/api/models)

The result contains only the model identifier, limited display metadata, and a safe human-readable status. It never contains the key, raw provider response, input prompt, or Google content. Request bodies are absent, and redirects and cookies are blocked. A successful model lookup **does not prove** that the model supports the requested inference endpoint, has billing credit, or generates responses successfully. It is a diagnostic only, not live BYOK inference acceptance or a license to spend money. Endpoint/API usage policies may still apply to metadata requests.

A missing model or unauthorized key yields a specific safe error category without reflecting the provider's raw response body. The configured model ID is never silently replaced with an unapproved model. This is particularly useful when a provider renames or retires models.

## Google: Verify Calendar and Tasks API scopes

After the existing consent-based Google OAuth login, open the Hub and choose **Verify Calendar / Tasks API access**. Select Calendar, Tasks, or both in the scope configuration. The diagnostic sends a bounded, read-only request to the selected authorized service:

- Calendar: the primary Calendar events endpoint with `maxResults=1` and a fields mask that includes at most an item ID.
- Tasks: the task-list endpoint with `maxResults=1` and a fields mask that includes at most a list ID.

The Google response body is **not parsed or returned**, including when the server sends metadata. The UI displays only the source type and pass/fail reason. No events, tasks, email, document contents or tokens are written to storage, logged, or sent to an AI provider.

Google diagnostics refuse to run without a valid browser-session OAuth token, matching granted scope, and Firefox host/data consent. The Google Doc and Sheet preview feature is intentionally **not** probed automatically; those remain user-selected read operations. The core ELF//SHELL bridge cannot run account diagnostics.

## Privacy and release acceptance

- Diagnostics run only from a user click, with no background polling or telemetry.
- Results remain in the current page; the extension stores neither diagnostic results nor probe responses.
- All raw secrets are excluded from returned status messages; error bodies are discarded.
- All diagnostic actions use fixed approved HTTPS provider origins, `GET`, `credentials:"omit"` and `redirect:"error"`.
- Unit and native Firefox tests for v0.11 simulated the network. **Subsequently the user reported successful real Calendar/Tasks API reads after the v0.13.4 OAuth fix**, but this does not retroactively turn v0.11 CI into live-account evidence. No paid BYOK inference acceptance is recorded. See [Google field matrix](google-live-acceptance.md).
- The live Google OAuth, real inference, Mozilla privacy review, signing and distribution gates remain unapproved in `release-gates.json`; the existence of a diagnostic button cannot automatically approve them.

When a user intentionally runs these live checks with a disposable Google test account and/or approved provider key, the results help distinguish consent, API connectivity and model naming failures before running controlled inference acceptance. The tests do not provide an audited record on their own.

# OpenAI Responses live trace — v0.12.0

The **OpenAI** option in Ayarime's BYOK Console uses the **Responses API** with `stream:true`. The Hub and Firefox sidebar render actual provider events while a request is running, with a total timer and individual activity-duration counters. Anthropic and Gemini retain their existing, non-streaming request paths in this milestone.

## Exactly what is (and isn't) displayed

The stream renders:
- `response.created`, `response.queued` and `response.in_progress` as bounded, human-readable request phases.
- `response.reasoning_summary_text.delta`, `.done` and `response.reasoning_summary_part.done` as provider-exposed reasoning-summary text in a collapsible pane.
- `response.output_text.delta` and `.done` as live assistant answer text. Final `.done` text replaces accumulated deltas, rather than duplicating them.
- `response.output_item.added`/`.done` for **real** tool items, and provider web/file/code-interpreter progress events if received. Each displayed tool is keyed to a real provider event, not a hallucinated action.
- `response.completed`, `response.incomplete`, `response.failed` and `error` as distinct terminal states. Missing terminal events **fail closed**; merely reaching EOF or `[DONE]` is not proof of success.
- Integer input/output token counts when reported by the provider. No fabricated price or speculative billing estimate.

**Provider-exposed reasoning summaries are not private raw chain-of-thought.** The event reducer deliberately ignores `response.reasoning_text.*` and does not relay private reasoning, raw JSON outputs, OAuth credentials or API keys. A model may not return a summary even when `reasoning.summary:"auto"` is requested; in that case the UI says so. The timing information measures elapsed frontend time between actual received events and is **not an internal execution profiler**.

The presentation is an original ELF//SHELL 1990s OVA-inspired activity console. Arena/LMArena public repositories contain related research, benchmarks and tools; we have not verified that its proprietary Agent Mode frontend is open source or available for code reuse. The design mimics the *interaction principles* (live steps, collapsible summaries, real timers), not its source or copyrighted artwork.

## Models and controls

The OpenAI model text field remains editable, with convenience presets for currently documented GPT-6 Luna (`gpt-6-luna`, default), GPT-6.1 Terra, GPT-6.1 Sol and GPT-6 Astra. A saved model from an older version remains selected until changed by the user. A **Verify model access** metadata check remains available and does not generate output. You must save the provider/model and enter your own session-only key before sending.

**Reasoning effort** defaults to `medium`; `none`, `low`, `high`, `xhigh`, and `max` are offered where the provider/model supports them. High efforts can use more tokens, generate a slower response or exhaust the output limit. The current per-response output cap is **768 tokens**, inclusive of reasoning work when metered by the API. Unsupported model/effort settings result in a safe error and no automatic retry.

**Hosted web search is OFF by default** and is enabled only when the user ticks the checkbox for that request. OpenAI web-search calls can incur extra charges beyond generated tokens. This option adds only `{type:"web_search"}` as an OpenAI-hosted tool; it does not run a local shell, execute code, access Google Workspace data, or install MCP tools. Actual provider search events are displayed when returned. Do not claim any tool ran if the API emits none.

Requests are explicitly initiated by clicking Ask Ayarime and require Firefox's OpenAI origin + optional data-sharing permissions and a BYOK key. No network calls or background reasoning begin when the Hub opens. The key remains in Firefox `storage.session` and is sent only as an Authorization header to OpenAI. The request uses `store:false`, `credentials:"omit"` and `redirect:"error"`. The model receives only the explicit prompt and configured persona (no Google files or browsing history).

## Transport and failure handling

The background uses an extension-private `runtime.Port`, never the external core bridge. It creates one `AbortController` per port request and cancels the upstream fetch when the user presses Stop, closes the page, or the Port disconnects. Multiple concurrent start commands on the same port are ignored. The SSE decoder uses streaming UTF-8 decoding and supports fragmented network chunks, CRLF frames, comments, event JSON and `[DONE]`. It enforces finite limits on event count, individual frames, total transport bytes and forwarded summary/answer text.

Only a reduced allowlist of safe semantic events travels from the background into the UI. All untrusted model text uses `textContent` and DOM creation, never model-generated HTML. Sanitized provider errors do not echo raw response bodies. The UI totals are transient; neither traces nor assistant outputs are automatically persisted.

## Independent verification

Automated unit tests cover fragmented UTF-8/CRLF SSE, summary deltas and done events, tool status honesty, output deduplication, permission/key boundaries, non-terminal EOF, malformed events, and provider failures. Port simulations check no cross-extension access. Native Firefox CI verifies model presets, opt-in web search, selected reasoning effort and initial hidden trace without live keys.

**No real OpenAI API key or billable inference was used for this engineering milestone.** Live provider acceptance (#19) remains pending, and all signing/release gates remain unapproved. Verify with a small, budget-limited API key in an isolated Firefox profile before public release.

## Official API references

- https://developers.openai.com/api/docs/guides/streaming-responses
- https://developers.openai.com/api/reference/resources/responses/streaming-events
- https://developers.openai.com/api/docs/guides/reasoning
- https://developers.openai.com/api/docs/models
- https://developers.openai.com/api/docs/guides/tools-web-search

## v0.13 offer groups

The OpenAI model catalog now includes all 17 IDs in the user's **250k/2.5M** daily conditional-complimentary offer, as well as the GPT-6 options under **Other**. New OpenAI configurations default to `gpt-5.4-mini`; saved models are preserved. See [OpenAI complimentary offer](openai-complimentary-offer.md) for account eligibility, private data-sharing consent, and honest locally observed token counters. No live provider credentials or billing test was run.

## Arena-inspired reasoning presentation — development PR #44

The Hub and sidebar now use a compact expandable *Thinking…* panel for **provider-exposed reasoning summaries**, with a separate genuine event log and elapsed time. The final answer streams separately. This does not expose private chain-of-thought; a provider may return no summary at all. See [reasoning display and privacy](reasoning-display.md). Maximum OpenAI output tokens remain **768 by default**; the user can explicitly choose 2,048 or 4,096 for one request at potentially greater cost.

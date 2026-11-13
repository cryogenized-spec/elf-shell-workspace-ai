# Ayarime — explicit multi-turn context

**Status:** Firefox developer-preview feature. No signed/public release or live paid-provider acceptance is implied.

## The user interaction

The Hub and sidebar show a **Context / per-request opt-in** fieldset next to the prompt. The checkbox starts OFF on every page load. When enabled, select 1, 2 or 3 previous completed exchanges. The companion calculates a local preview of eligible turn count, character count and a *rough* token approximation before submission.

Pressing **Ask Ayarime** snapshots the checkbox and count in that one request, then immediately resets the checkbox to OFF. A subsequent prompt will again send no previous messages unless deliberately enabled. There is no persisted global multi-turn setting and no invisible inclusion of context.

No context can be included by the ordinary ELF//SHELL Station/bridge message; the bridge accepts only allowlisted tab/workspace commands. There are no new Firefox network permissions.

## Selection and disclosure

The background process reads the session transcript only when `includeHistory === true`, with an integer `historyLimit` from 1 through 3. Invalid or excessive values fail closed. Entries are drawn in chronological order only from the **most recent contiguous sequence** whose provider **and** model both match the currently saved BYOK settings. Switching providers/models naturally breaks the selected context chain.

At most 3 complete exchanges and **12,000 total input characters of prior messages** are included; an oversized exchange is skipped together with all earlier exchanges rather than truncated or replaced with older, out-of-order material. These are application-side bounds, not model-context-window promises. The current prompt remains bounded at 6,000 characters, persona instructions at 6,000 and the output caps of each provider are unchanged.

Only current prompt and persona are sent if no context was requested, no matching history exists, or the toggle is off. The optional request includes previously displayed prompts *and assistant responses*. This may increase input-token usage, latency, cost and the amount of information disclosed to the chosen provider. The preview's 4-characters-per-token heuristic is NOT the provider tokenizer or a bill estimate. Usage and pricing depend on model, provider and account; consult provider billing directly.

Firefox `storage.session` holds the previous exchanges locally during the browser session. It is not encrypted. Clearing the session conversation removes history (not the API key); the transcript is not uploaded or indexed by an ELF//SHELL server.

## Provider request shapes

- **OpenAI Responses**: if off, the existing simple `input: text` request remains unchanged; if enabled and nonempty, `input` is an array alternating `{role:'user', content:...}` and `{role:'assistant', content:...}`, ending with the current user prompt. `store:false`, streaming, reasoning selection and web-search opt-in retain their old behavior. No provider-managed stored conversation object is created.
- **Anthropic Messages**: if enabled, the `messages` array alternates `user` / `assistant` and ends with the user prompt. The separate `system` persona and manual key/network consent are unchanged.
- **Gemini generateContent**: `contents` alternate `user` / `model` text parts and end with the user prompt. The separate system instruction and manual key/network consent are unchanged.

The backend, not the UI, chooses the actual prior messages. Incoming UI requests carry only `includeHistory`, `historyLimit`, and the current prompt; they cannot submit arbitrary history arrays or choose another provider's transcript. The preview request returns counts and rough size only, not transcript text.

## Testing and release gates

`npm test` validates defaults, malformed consent, provider/model boundaries, limits, preview data minimization, each provider's REST body, streamed OpenAI body, and legacy no-history paths. Native Firefox checks the default OFF state, shows a real preview after a user click, resets it after reload, and never initiates a paid request. Full two-extension acceptance guards the Station bridge.

**Not yet done:** actual use of a paid provider account with a real multi-turn prompt and provider-specific token consumption verification. Live user acceptance, Mozilla distribution and all unrelated Google scope gates remain outstanding.

# Standalone Ayarime BYOK text mode — v0.7.0 developer preview

This milestone introduces manual text inference in ELF//SHELL Workspace AI using an API key supplied by the user. It supports **OpenAI Responses**, **Anthropic Messages**, and **Google Gemini generateContent** through separate REST adapters.

## Usage

In either the pinned Workspace Hub or Firefox sidebar, choose the AI provider, enter a valid model ID from that provider, and save the choice. Then choose **Allow provider connection** to grant Firefox permission only for that provider's API origin. Paste your API key and choose **Use key this session**. Enter a text prompt and select **Ask Ayarime**.

The response appears in the extension interface as plain text, not HTML. Your configured Ayarime, Professional or Custom persona is sent as the system-level style instruction. The user can forget the session key at any time, and selecting a different provider clears the previous provider key.

Only explicit prompt clicks make an inference request. **This phase does not transmit Gmail, Calendar, Tasks, Docs or Sheets data to any model.** The user may voluntarily paste text, but no Workspace connector is automatically invoked.

## Privacy and cost

- The API key is stored only in Firefox `storage.session` and is never returned by status messages, saved to `storage.local`, included in URLs or bundled into the extension. This is an ephemeral convenience, **not an encrypted secret vault**.
- The provider and model ID (not the key) persist as preferences in `storage.local`.
- Only one selected provider host may be authorized by each permission request. If revoked, prompt submission is blocked.
- The extension sends the explicit prompt and current persona directly from Firefox to the selected provider; their own policies, processing and billing apply.
- OpenAI requests set `store:false`. That flag does not override the provider's separate API retention and abuse-monitoring policies. The other providers apply their own data practices.
- Initial prompts are single-turn, without streaming or stored conversation history, and capped at 6,000 characters. Generated output is capped at 512 tokens by the request and 12,000 characters in the interface.
- Tool calling is deliberately disabled; there are no external actions, file writes, email sends, automatic Google reads, or scheduled AI calls.
- **A ChatGPT Plus subscription or Claude app subscription is not an API key.** MCP-client integration, where the existing ChatGPT/Claude app calls Workspace tools, is a separate future feature.

## Security and accessibility acceptance

- Bad provider names, API keys with line breaks, invalid model IDs and overlong prompts are rejected.
- HTTP error bodies are not echoed (they might contain sensitive prompt data).
- The sidebar and Hub use `textContent` for provider output; malicious HTML in output is not executed.
- Inference is accessible only to the companion's same-extension message path. The ELF//SHELL core bridge cannot send prompts or acquire credentials.
- No live inference tests with actual paid keys have been performed. The GitHub Actions suite uses only fake providers, plus native Firefox acceptance for UI functionality. This remains an unsigned developer preview.

## Official API references
- https://developers.openai.com/api/reference/resources/responses/methods/create
- https://platform.claude.com/docs/en/api/messages/create
- https://ai.google.dev/api/generate-content

## Follow-on work

Provider usage budgets, token estimation, real-key consent and performance testing, streaming replies, manual choice of approved Google context, and the evidence-linked Morning Coffee workflow are independent release milestones. Future AI-powered Google operations must require specific source selection and explicit user review before transmission.

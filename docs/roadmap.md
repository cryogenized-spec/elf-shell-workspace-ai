# ELF//SHELL Workspace AI — implementation roadmap

**Current delivery focus (8 November 2026):** [Custom Google Workspace REST MCP audit, dedicated per-service tool inventories and M0–M9 execution roadmap](custom-google-rest-mcp-roadmap.md). This is the authoritative *forward-looking build sequence* for the in-house Google REST tool registry. We are **not using Google's official MCP servers** as an operation ceiling. The original phases below remain historical foundations and longer-term feature areas.

Source-of-truth staged plan (7 November 2026). Stable core must not be modified by this repository.

| Phase | Milestone | Acceptance gate |
| --- | --- | --- |
| 0 | Audit core manifest, fonts, theme, release | Compatibility recorded without core changes |
| 1 | Companion repo, packaging, tests | Independent installable extension |
| 2 | Versioned core-to-companion bridge | Sender allowlist, malformed messages rejected, graceful missing companion |
| 3 | Pinned Super Tab, restore, group, reuse | Repeated launches do not duplicate tabs; file IDs resolve |
| 4 | Ayarime native sidebar and keyboard UX | Accessible, consistent with ELF//SHELL |
| 5 | Editable personas, BYOK AI providers | Provider failover, no unsafe automatic tool writes |
| 6 | Google OAuth and REST connectors | Least scopes, account disconnect, auth/privacy compliance |
| 7 | Morning Coffee evidence-linked briefing | Sources cited; verified/probable/possible distinguished |
| 8 | Time-of-day artwork and user customization | Static/reduced motion and performance fallbacks |
| 9 | Optional MCP tool-server interoperability | Authenticated ChatGPT/Claude tool client compatibility |
| 10 | Security and accessibility hardening | Threat tests, malformed messages, no key leakage |
| 11 | Signed Firefox alpha/beta/stable | Mozilla lint, live browser acceptance, verified scopes |
| 12 | Android/CiRYVA and future services | Separate platform review |

## Product contracts

- Command: “Ayarime, please bring up my workspace.”
- No Google iframe editors. Master is a pinned extension page; Google apps are real, optionally grouped tabs.
- No duplicates; use stable document IDs over titles and recover from restarts.
- Read-only information can be summarized with user permission; sending or modifying requires separate user approval.
- Ayarime is default persona; user may customize or disable persona styling without weakening authorization policy.
- Own Google REST adapters; Google MCP catalog is not a tool ceiling.
- ChatGPT/Claude consumer subscriptions are not BYOK model endpoints; MCP client mode is a separate capability.
- Public Gmail/Drive restricted scopes require their own compliance gates; scope availability isn't guaranteed.
- Firefox desktop first; browser-only tab operations must work even when AI is offline.

## Current status

0: audited against ELF//SHELL 0.5.4 feature branch; 1/3/4: working source prototype; named Workspace profiles and core bridge PRs implemented, field verification pending.
2: companion-side bridge implemented and awaiting core integration; 5/6/7/8/9/10/11/12: not implemented.

### v0.4 progress
The editable personality layer is implemented as a local-only module with three modes and validation. Actual AI-provider adapters, credential storage and model orchestration remain pending in Phase 5. This does not constitute BYOK inference.

### v0.5 developer-preview progress

Google OAuth PKCE and opt-in Firefox host permissions have been implemented in source with read-only Calendar/Tasks REST adapters and an explicit account UI. Credentials are stored as short-lived browser-session access tokens; no refresh tokens are retained. Live Google sign-in, public OAuth verification, broader service connectors and AI integration are still pending. See [Google OAuth developer preview](google-oauth.md).

### v0.6 developer-preview progress

Read-only Docs and Sheets preview adapters are implemented behind explicit Google OAuth scopes and saved-file IDs. No Drive-wide discovery or Docs/Sheets editing. The read-only Docs/Sheets scopes are sensitive and require Google verification before broad public use. The proposed per-file `drive.file` path needs a genuine file picker, not just URL pasting. See [Google files](google-files.md).

### v0.7 developer-preview progress

The first manual BYOK text inference adapter now supports OpenAI Responses, Anthropic Messages and Gemini generateContent. Session-only API keys, host permissions and the editable Ayarime persona are wired into the sidebar/Hub. Multi-turn chat, streaming, tool use, optional Google context selection, model-cost budgeting and live provider-key testing remain pending. See [BYOK mode](byok.md).

### v0.8 developer-preview progress

Manual Morning Coffee is implemented as a local, no-AI deterministic briefing for authorized Calendar/Tasks only. Source links open/reuse actual Firefox tabs. Task dates are labelled as scheduled dates rather than asserted deadlines; cross-links require identical Google file IDs. Gmail, broader source coverage, AI synthesis and live Google authorization testing remain pending. See [Morning Coffee](morning-coffee.md).

### v0.9 update notification milestone

Optional metadata-only GitHub Release checks, stable/preview filtering, badges and release notes are implemented; 24-hour polling is opt-in. The XPI builder uses maximum ZIP compression and prints the package size. Native signed AMO distribution and actual published release acceptance remain separate. Code update patches are not supported by Firefox; optional large non-executable content assets may eventually support individually verified transfers. See [release notifications](release-notifications.md).

### v0.10 release-readiness and privacy progress

The release-candidate QA workflow produces an unsigned artifact plus source-equivalence/SHA-256 evidence; publication is explicitly disabled until live Google OAuth, live provider inference, Mozilla privacy review, signed installation and distribution-channel gates pass. Firefox's optional data collection categories are now declared and checked for Google/BYOK calls. See [release governance](release-publishing.md). No signed release has been published.

### v0.11 connection-diagnostics milestone

The Hub/sidebar can now manually verify a selected provider's model metadata without generating text, and the Hub can check Calendar/Tasks API authorization without parsing returned account contents. A failed check gives a safe error category; success is **not** equivalent to live inference, complete Google OAuth onboarding or public release sign-off. See [connection diagnostics](connection-diagnostics.md).

### v0.12 OpenAI streaming and activity trace

Implemented OpenAI Responses SSE and provider-exposed reasoning-summary deltas with a native 1990s OVA-themed live trace; per-stage timers, streaming assistant answer, real tool-event labels and cancellation. Model presets use the currently documented GPT-6 family, with Luna as cost-efficient default. Optional hosted web search is OFF by default. This is simulated/CI-tested pending real BYOK key acceptance, and no raw private CoT is exposed. See [OpenAI streaming](openai-streaming.md).

### v0.13 complimentary offer model groups

The screenshot-specific OpenAI model list is available in two clearly separated 250k/2.5M daily token groups, with deprecated and shutdown markers. Added optional self-reported enrollment and two locally observed token usage meters that reset 00:00 UTC. **Not** authoritative remaining free balance; external API dashboard is the billing source of truth. See [OpenAI complimentary offer](openai-complimentary-offer.md). No account data-sharing setting was changed, and live paid acceptance is still pending.

### v0.13.4 Desktop OAuth token-exchange compatibility

A real Google consent/callback was confirmed; Google returned HTTP 400 `invalid_request` because `client_secret` was omitted from the Desktop token request. The Hub now accepts the user's Desktop client secret in Firefox session storage only and includes it in the Google token POST alongside PKCE, without embedding credentials in public code. Mock/native tests added. Live successful access remains unverified and release gates remain unapproved. See [OAuth notes](google-oauth.md).

### v0.14.0 bounded Google Drive/Gmail metadata

Implemented optional, explicitly requested Drive `drive.metadata.readonly` recent-file metadata and Gmail `gmail.metadata` inbox-header REST previews. Both are restricted Google scopes, unselected by default and separate from the existing Calendar/Tasks/Docs/Sheets permissions. No message body, Drive file downloads, write actions or AI ingestion. OAuth + native browser CI coverage; real Drive/Gmail API acceptance is still pending. See [Drive/Gmail metadata](drive-gmail-metadata.md).

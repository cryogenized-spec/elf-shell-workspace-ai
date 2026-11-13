# ELF//SHELL — Workspace AI

An optional **Firefox Desktop** companion to [ELF//SHELL — Ayarime](https://github.com/cryogenized-spec/elf-shell-ayarime).

**Status: v0.14.0 developer preview, unsigned and not released publicly.** Automated Firefox tests and Mozilla lint pass. The user reported successful live Calendar/Tasks OAuth reads on Firefox after the v0.13.4 token-exchange fix; Drive/Gmail metadata and saved Docs/Sheets live reads are not yet accepted. Public OAuth verification, signed installation and remaining release gates are pending.

This companion is independent of the existing Firefox new-tab extension and does not replace its interface. The first alpha implements a native pinned **Super Tab**, a sidebar styled after the original ELF//SHELL palette, and user-initiated restoration of real Google Workspace tabs.

## Own Google REST MCP — development M1

The independently deployable [in-house Google Workspace MCP](mcp/README.md) is being developed in `mcp/`, separate from the Firefox extension. It speaks the standard MCP protocol and exposes **four explicit Tasks REST operations** through our own adapters: list tasklists, list tasks, get a task, and approval-gated task creation. **It does not call Google's official MCP servers.** M1 is local stdio + a developer-only short-lived token configuration; public OAuth onboarding, secure remote ChatGPT registration and additional Google applications are later milestones. See the [sequenced M0–M9 roadmap](docs/custom-google-rest-mcp-roadmap.md).

## New developer preview: explicit conversation context

The Hub and native Firefox sidebar can display recent completed exchanges and, **only when manually enabled for that individual request**, include 1–3 previous exchanges from the same model/provider in a follow-up prompt. Context is bounded, previewed locally, and disabled again after sending. More context may increase API cost. Details: [context design and privacy](docs/multi-turn-context.md). This remains unsigned and has no live paid-provider end-to-end acceptance yet.

## Currently working in the prototype

- Toolbar command **“Ayarime, please bring up my workspace.”**
- Find or create a pinned Super Tab outside the subordinate tab group.
- Maintain a transient Firefox session tab index so redirects (including Google's sign-in and Workspace landing pages) and initial `about:blank` navigation do not create duplicate tabs.
- Configure Ayarime's original persona, a neutral professional preset or a custom personality prompt in the Hub. The choice is stored locally; it is applied only when the user explicitly submits a BYOK prompt.
- Opt into developer-preview Google OAuth (Desktop client ID, session-only matching client secret and PKCE) for bounded read-only Calendar/Tasks, selected saved Docs/Sheets previews, and separately consented Drive metadata/Gmail headers. Calendar/Tasks have been user-field-tested; the other services still require live acceptance.
- Use the optional standalone BYOK text console from the Hub or sidebar with an explicit provider API key kept only in Firefox session storage. No Google data is automatically sent.
- Prepare a manual **Morning Coffee** briefing from authorized Calendar/Tasks only, with local priority heuristics and links back to the original Google items.
- Opt into GitHub Release notices (daily or manual), with a toolbar badge, release notes and no silent code downloads.
- Check Google Calendar/Tasks authorization and selected BYOK model metadata on demand, without provider generation or copying account records.
- Explicitly request up to 20 recent Drive file metadata entries or eight Gmail inbox headers through independently selected, restricted Google OAuth scopes. No Gmail bodies, attachments or sending; no Google records are forwarded to an AI model.
- Stream **OpenAI Responses** text and provider-issued reasoning summaries with an original, expandable action timeline, actual tool-event reporting, total/per-action timers and Stop cancellation. Hosted web search stays opt-in; other providers retain one-shot mode.
- Select all 17 OpenAI offer-listed model IDs across the 250k and 2.5M daily groupings, with deprecated-model warnings, opt-in self-reported enrollment status and local, provider-reported UTC usage meters. These are not verified free balances.
- Reuse open Google Workspace tabs (Gmail, Calendar, Drive, Docs, Sheets and Tasks) and create only missing tabs.
- Group Workspace tabs in Firefox and focus the master Hub.
- Create, rename and switch between up to 10 local Workspace profiles. Each has its own saved Google links and named tab group. Switching/deleting a profile never closes your tabs.
- Save a specific Google Doc/Sheet/Slides/Drive file by URL and match its stable file ID.
- Find and activate a saved resource in the same or another browser window.
- Add and remove resources without automatically closing user's tabs.
- Use the native Firefox sidebar as a companion to the real Google applications.

**Not yet delivered/verified:** public Google OAuth onboarding and restricted-scope approval, live accepted Docs/Sheets and Drive/Gmail reads, live-tested BYOK model inference, AI-generated Morning Coffee synthesis, Gmail body access/sending, ChatGPT/Claude MCP client support, tab migration between windows, or Android. The core-side command has been implemented on the ELF//SHELL development branch and real Firefox cross-extension acceptance has passed. The companion-side versioned bridge can now respond to a recognized ELF//SHELL core add-on, but core 0.5.4 has not been changed. No Google API requests occur without an explicit, authorized user action.

## Install for development

Requires **Firefox Desktop 142+**.

1. Clone or download the `main` branch of this repository.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Choose **Load Temporary Add-on**, and select the top-level `manifest.json`.
4. Click the Ayarime Workspace toolbar action. It should bring up the native sidebar and a pinned Workspace Hub; the Hub can restore your Google tabs on demand.
5. Open the Hub to add a named document URL. Use **↗ Open** to switch to that exact file. You can also create an empty profile in the pinned Hub and select it from the sidebar.

Temporary development add-ons may unload after Firefox restarts. A permanent Firefox install requires Mozilla-signed distribution.

## Test and package

Requires Node.js and Python 3; no npm installation is needed for this first alpha:

```sh
npm test
npm run package
```

The package script creates `dist/workspace-ai-alpha-unsigned.xpi` for development. **It is not signed and not a production download.**

See [roadmap](docs/roadmap.md), [architecture](docs/architecture.md), [manual acceptance tests](docs/testing.md) and the [v0.14.0 Google live-acceptance record and privacy-safe test plan](docs/google-live-acceptance.md).

## Privacy

The prototype stores profile names, Google resource names/URLs, public OAuth client ID, and model preference in Firefox `storage.local` (not encrypted). Its required `tabs` access is used to find and activate existing browser tabs. Optional OAuth and BYOK operations use short-lived tokens/API keys in Firefox `storage.session` (not encrypted). Google Calendar/Tasks and selected file previews remain local to the extension. Explicit BYOK prompts send user-entered text and persona instructions to the selected third-party provider after host and optional data-sharing consent; no Google content is forwarded to a model automatically. Optional Gmail metadata previews display at most eight message headers after separate restricted-scope consent; no bodies or attachments are read, and no sending or mailbox changes are implemented.

Read the [MPL-2.0](LICENSE) before redistribution. Icons are authored for this companion; no ELF//SHELL font files or artwork have been copied into this repository.

## Companion bridge v1 (developer preview)

The companion accepts HELLO, LIST_RESOURCES, OPEN_RESOURCE and OPEN_WORKSPACE commands from the independently installed core extension ID `elf-shell-ayarime@local.theme`. The core's existing public release does not yet send these messages; see [architecture](docs/architecture.md). Messages from other extensions and unsupported versions are rejected.

Tab IDs are also cached in Firefox `storage.session` (cleared when the browser session ends) so Ayarime can recognize tabs before Google navigation finishes. No Google account contents are collected.

The `integrated-firefox` workflow also verifies the command from ELF//SHELL's real palette into this companion, in a fresh Firefox profile with both unsigned add-ons installed. No real Google login is involved.

Personality options adjust the assistant's proposed conversational style only. They do **not** change the extension's tool permissions, network access or write-approval requirements.

## Google OAuth developer preview

Read [OAuth setup, scope and privacy constraints](docs/google-oauth.md) before connecting. A developer-provided Google **Desktop app OAuth client ID** and consent-screen setup are required. This is not a general public sign-in service yet. Restricted Drive metadata and Gmail metadata scopes are offered independently and OFF by default; Google APIs are only called by the corresponding explicit authorized action. Access tokens are kept in Firefox session storage only, with no refresh token persistence.

**Docs/Sheets preview:** See [scope limitations and saved-file preview behaviour](docs/google-files.md). These OAuth read-only scopes are sensitive and wider than our saved-file UI selection. There is no unrestricted Drive search, file editing, or broader Gmail content access; separately selected Gmail inbox-header metadata is supported.

**Standalone AI:** See [BYOK text-mode setup and privacy boundaries](docs/byok.md). ChatGPT/Claude app subscriptions are not API credits. Model inference is manual and contains no tool execution in v0.7.

**Morning Coffee (v0.8):** [Privacy, source coverage and evidence-linked briefing rules](docs/morning-coffee.md). This is deterministic and local; no email or AI provider is involved.

**Updates:** [Read the release-notification and Firefox signing policy](docs/release-notifications.md). The check fetches small metadata, but Firefox code updates still use complete Mozilla-signed packages; unsigned development XPIs are not installed by this feature.

**Release candidates:** [Review the unsigned QA workflow and publishing gates](docs/release-publishing.md). No CI job currently signs or publishes an add-on. Complete Google OAuth public acceptance (including scope denial/revocation and Docs/Sheets/Drive/Gmail), BYOK inference, Mozilla data/privacy review and signed installation remain blockers; all flags in `release-gates.json` are still false.

**Connection diagnostics (v0.11):** [Read about manual Google scope and provider model metadata checks](docs/connection-diagnostics.md). These are privacy-safe probes, not evidence of completed live OAuth or inference acceptance.

**OpenAI streaming (v0.12):** [OpenAI live trace architecture, limits and verification](docs/openai-streaming.md). Only provider summaries—not private CoT—are shown; tool rows require real provider events. No live paid API call has been completed for acceptance.

**OpenAI complimentary model catalog (v0.13):** [17 model options, conditional enrollment and two separate UTC usage counters](docs/openai-complimentary-offer.md). The extension neither controls sharing settings nor guarantees free requests.

**Google OAuth recovery (v0.13.2):** the Account Access panel preserves Google/Firefox sign-in errors instead of overwriting them; it distinguishes callback capture from token exchange and offers a safe Reset stuck sign-in button. See [OAuth troubleshooting](docs/google-oauth.md). At v0.13.2 that connection was still unverified; Calendar/Tasks were subsequently confirmed by user field testing.

**v0.13.3 Firefox OAuth regression fix:** Restores the previously functioning two-field `launchWebAuthFlow({interactive:true,url})` call; preserves safe v0.13.2 stage diagnostics and reset. See [Google OAuth troubleshooting](docs/google-oauth.md). At v0.13.3 live token exchange had not succeeded; user field testing later confirmed Calendar/Tasks.

**Google token exchange (v0.13.4):** A real Desktop OAuth code exchange returned HTTP 400 `client_secret is missing`. The Hub now accepts the user's own Desktop client secret **locally, in Firefox session storage only**; it supplies that value to Google's token POST with PKCE. No credential is bundled or committed. At the v0.13.4 fix stage connection still required retesting; the subsequent field report confirmed Calendar/Tasks. See [OAuth developer notes](docs/google-oauth.md).

**Google Drive/Gmail metadata (v0.14.0):** [Restricted-scope opt-in REST previews](docs/drive-gmail-metadata.md) now include up to 20 Drive file names and 8 Gmail inbox headers, read only on a user click. Both OAuth scopes are OFF by default, with explicit Firefox consent and no body/attachment/AI-sharing access. Calendar and Tasks are confirmed working on the user's Firefox; Drive and Gmail require their own live acceptance and Google's restricted-scope verification before public release.

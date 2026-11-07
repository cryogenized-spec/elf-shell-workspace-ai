# ELF//SHELL — Workspace AI

An optional **Firefox Desktop** companion to [ELF//SHELL — Ayarime](https://github.com/cryogenized-spec/elf-shell-ayarime).

**Status: v0.10.0 developer preview, unsigned and not released publicly.** Native Firefox CI, two-extension command integration and strict Mozilla lint have passed; signed installation and user-profile acceptance are still pending.

This companion is independent of the existing Firefox new-tab extension and does not replace its interface. The first alpha implements a native pinned **Super Tab**, a sidebar styled after the original ELF//SHELL palette, and user-initiated restoration of real Google Workspace tabs.

## Currently working in the prototype

- Toolbar command **“Ayarime, please bring up my workspace.”**
- Find or create a pinned Super Tab outside the subordinate tab group.
- Maintain a transient Firefox session tab index so redirects (including Google's sign-in and Workspace landing pages) and initial `about:blank` navigation do not create duplicate tabs.
- Configure Ayarime's original persona, a neutral professional preset or a custom personality prompt in the Hub. The choice is stored locally; it is applied only when the user explicitly submits a BYOK prompt.
- Opt into developer-preview Google OAuth (Desktop client ID and PKCE) for bounded, read-only Calendar/Tasks or specific saved Docs/Sheets previews after consent. This flow has not been live-tested.
- Use the optional standalone BYOK text console from the Hub or sidebar with an explicit provider API key kept only in Firefox session storage. No Google data is automatically sent.
- Prepare a manual **Morning Coffee** briefing from authorized Calendar/Tasks only, with local priority heuristics and links back to the original Google items.
- Opt into GitHub Release notices (daily or manual), with a toolbar badge, release notes and no silent code downloads.
- Reuse open Google Workspace tabs (Gmail, Calendar, Drive, Docs, Sheets and Tasks) and create only missing tabs.
- Group Workspace tabs in Firefox and focus the master Hub.
- Create, rename and switch between up to 10 local Workspace profiles. Each has its own saved Google links and named tab group. Switching/deleting a profile never closes your tabs.
- Save a specific Google Doc/Sheet/Slides/Drive file by URL and match its stable file ID.
- Find and activate a saved resource in the same or another browser window.
- Add and remove resources without automatically closing user's tabs.
- Use the native Firefox sidebar as a companion to the real Google applications.

**Not yet implemented:** live-tested/verified public Google OAuth onboarding, live-tested BYOK model inference, AI-generated Morning Coffee synthesis, Gmail access, ChatGPT/Claude MCP client support, tab migration between windows, or Android. The core-side command has been implemented on the ELF//SHELL development branch and real Firefox cross-extension acceptance has passed. The companion-side versioned bridge can now respond to a recognized ELF//SHELL core add-on, but core 0.5.4 has not been changed. No Google API requests occur without an explicit, authorized user action.

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

See [roadmap](docs/roadmap.md), [architecture](docs/architecture.md) and [manual acceptance tests](docs/testing.md).

## Privacy

The prototype stores profile names, Google resource names/URLs, public OAuth client ID, and model preference in Firefox `storage.local` (not encrypted). Its required `tabs` access is used to find and activate existing browser tabs. Optional OAuth and BYOK operations use short-lived tokens/API keys in Firefox `storage.session` (not encrypted). Google Calendar/Tasks and selected file previews remain local to the extension. Explicit BYOK prompts send user-entered text and persona instructions to the selected third-party provider after host and optional data-sharing consent; no Google content is forwarded to a model automatically. Gmail access is not implemented.

Read the [MPL-2.0](LICENSE) before redistribution. Icons are authored for this companion; no ELF//SHELL font files or artwork have been copied into this repository.

## Companion bridge v1 (developer preview)

The companion accepts HELLO, LIST_RESOURCES, OPEN_RESOURCE and OPEN_WORKSPACE commands from the independently installed core extension ID `elf-shell-ayarime@local.theme`. The core's existing public release does not yet send these messages; see [architecture](docs/architecture.md). Messages from other extensions and unsupported versions are rejected.

Tab IDs are also cached in Firefox `storage.session` (cleared when the browser session ends) so Ayarime can recognize tabs before Google navigation finishes. No Google account contents are collected.

The `integrated-firefox` workflow also verifies the command from ELF//SHELL's real palette into this companion, in a fresh Firefox profile with both unsigned add-ons installed. No real Google login is involved.

Personality options adjust the assistant's proposed conversational style only. They do **not** change the extension's tool permissions, network access or write-approval requirements.

## Google OAuth developer preview

Read [OAuth setup, scope and privacy constraints](docs/google-oauth.md) before connecting. A developer-provided Google **Desktop app OAuth client ID** and consent-screen setup are required. This is not a general public sign-in service yet. There are no Gmail permissions or arbitrary Google API calls. Access tokens are kept in Firefox session storage only, with no refresh token persistence.

**Docs/Sheets preview:** See [scope limitations and saved-file preview behaviour](docs/google-files.md). These OAuth read-only scopes are sensitive and wider than our saved-file UI selection. No unrestricted Drive search, file editing, or Gmail scopes are included.

**Standalone AI:** See [BYOK text-mode setup and privacy boundaries](docs/byok.md). ChatGPT/Claude app subscriptions are not API credits. Model inference is manual and contains no tool execution in v0.7.

**Morning Coffee (v0.8):** [Privacy, source coverage and evidence-linked briefing rules](docs/morning-coffee.md). This is deterministic and local; no email or AI provider is involved.

**Updates:** [Read the release-notification and Firefox signing policy](docs/release-notifications.md). The check fetches small metadata, but Firefox code updates still use complete Mozilla-signed packages; unsigned development XPIs are not installed by this feature.

**Release candidates:** [Review the unsigned QA workflow and publishing gates](docs/release-publishing.md). No CI job currently signs or publishes an add-on. Real Google OAuth and BYOK acceptance, Mozilla data/privacy review and signed installation checks remain blockers.

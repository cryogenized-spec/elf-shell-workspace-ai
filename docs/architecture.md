# Architecture — first alpha

This is an independent Firefox MV3 extension. The base ELF//SHELL 0.5.4 source remains untouched.

- Native toolbar click: synchronous sidebar.open() on the user gesture; background then executes workspace restoration.
- Firefox background event page owns serialized tab operations and locally stored resource definitions.
- Pinned `hub.html` master stays outside the Firefox tab group.
- Google applications are real Firefox tabs, never iframes.
- Resource matching prioritizes stable Google file IDs; default app landing pages are matched by application URL.
- Existing matching tabs are reused across normal windows, but tabs from another window are **not moved automatically**.
- Stored resource links are visible and editable, not secret; the browser storage API is not an encryption system.
- Google OAuth is now implemented behind explicit optional host permission grants and a developer-supplied OAuth Desktop client ID. Only Calendar/Tasks GET requests are available; no AI provider endpoint, Gmail permission or automatic Google access exists.

## Messaging contract

The internal extension accepts only: `GET_STATE`, `OPEN_WORKSPACE`, `OPEN_RESOURCE`, `SAVE_RESOURCE`, and `REMOVE_RESOURCE`. Requests are rejected unless sent from the same extension ID. The companion also listens for **external** versioned bridge requests only from \`elf-shell-ayarime@local.theme\`. Requests with missing/unsupported protocol version or unknown operations are rejected. The core side of the bridge is not yet implemented; the existing ELF//SHELL release remains unchanged.

## Planned next steps

Native UI accessibility and live Firefox acceptance, versioned bridge with ID `elf-shell-ayarime@local.theme`, editable workspace profiles, opt-in Google OAuth/PKCE, native REST connectors, BYOK providers, opt-in evidence-linked Morning Coffee, and optional remote/local MCP interoperability.

Do not enable Gmail restricted scopes before completing the relevant Google app verification process.

## External bridge protocol v1

Only the installed ELF//SHELL core extension with ID `elf-shell-ayarime@local.theme` may send these messages to `workspace-ai@elf-shell.local` using `browser.runtime.sendMessage("workspace-ai@elf-shell.local", payload)`.

Example HELLO message:
```json
{"kind":"elfshell.workspace.bridge","version":1,"command":"HELLO"}
```

The companion replies with a capability list and protocol number. The other supported commands are `LIST_RESOURCES` (names and stable keys only, not URLs), `OPEN_RESOURCE` with a saved resource key, and `OPEN_WORKSPACE`. External requests cannot invoke arbitrary Google URLs, access document contents or ask for email sending. All actual tab operations are serialized. The sender check is repeated in the background handler even though the manifest allowlists the same ID.

This does **not** yet expose a command in ELF//SHELL 0.5.4, nor does it imply that `sidebarAction.open()` is available from an asynchronous cross-extension request. The user's toolbar or sidebar gesture remains the reliable native sidebar entry point.

## Named workspace profiles (v0.3 alpha)

`elfshell.workspace.profiles.v1` stores a collection of named local profiles and the active profile ID. The older `elfshell.workspace.resources.v1` list is automatically read once when the newer structure is missing, so existing saved links are retained. Profiles can be created, renamed and selected. Deleting a profile removes only the saved profile definition; it never closes Firefox tabs or alters Google files.

Each profile has its own named Firefox tab group; the default uses `ELF//SHELL · GOOGLE WORKSPACE`. Tabs already grouped under another profile are intentionally not stolen. If the same Google application belongs to two profiles, Ayarime reuses its tab without duplicating it, but leaves it in the original group. A pinned master Hub remains outside the groups.

## Real Firefox navigation identity (QA)

Firefox may return `about:blank` from `tabs.query()` immediately after a new Google application tab is created, before the pending HTTPS navigation commits. Matching only a URL will then create duplicate tabs on repeated commands.

The background controller therefore maintains a **session-scoped** resource-key-to-tab-ID registry in `browser.storage.session`, with an in-memory fallback. The mapping is used only when the tab still exists and its URL matches the saved resource, is initially blank, or is at Google's account sign-in origin. Tabs deliberately navigated to unrelated sites are not reused. The index expires with the browser session and stores no emails, document bodies, OAuth credentials or API keys.

This behavior is covered by mocked pre-navigation/redirect tests and isolated real Firefox acceptance via `tests/native_firefox.py`.

## Signed-out Google redirects and integrated Firefox acceptance

In addition to `accounts.google.com`, unauthenticated Gmail and Calendar launches can redirect to `workspace.google.com` product pages. Ayarime recognizes this origin **only for a tab previously identified by the session registry**, preventing the browser from repeatedly opening those applications while the user is signed out. Unrelated websites are not accepted as tracked Workspace destinations.

The isolated dual-extension test in `tests/native_bridge.py` checks the real ELF//SHELL command palette invoking the Workspace AI external message protocol. It verifies the pinned Hub, Firefox native tab group and repeat-launch idempotence without real Workspace account credentials.

## Ayarime personality configuration (v0.4 alpha)

`shared/persona.js` defines an original Ayarime preset, a neutral professional style and a user-written custom style capped at 6000 characters. `elfshell.workspace.persona.v1` stores the selected settings in Firefox local extension storage, not encrypted. The Hub offers edit, save and reset controls; the sidebar displays the active mode. No provider endpoint is called in this phase.

Persona settings are a presentation/communication layer. Future AI orchestration must keep authorization, tool availability, user approvals and data-sharing restrictions in code rather than placing them under the user's editable prompt. The external bridge cannot modify persona settings.

## Optional Google account connector (v0.5 preview)

Read [Google OAuth developer preview](google-oauth.md). The Hub can request optional `oauth2.googleapis.com`, `www.googleapis.com` and `tasks.googleapis.com` host permissions. The user then explicitly prepares a PKCE OAuth request and activates Firefox `identity.launchWebAuthFlow()` directly from a click. A validated short-lived access token is kept only in `browser.storage.session`. Credentials and source data are not returned through the external ELF//SHELL bridge. Only allowlisted Calendar and Tasks GET endpoints are implemented, with no model calls, writes or background polling.

## Saved Docs/Sheets previews (v0.6)

`google/files.js` provides bounded read-only Docs/Sheets API adapters. `GOOGLE_READ_FILE` is accepted only via same-extension messaging, resolves the resource key against the active saved profile and validates its Google Docs/Sheets editor URL. It never receives a raw caller-controlled API URL. Output is plain text or a bounded value grid and is only rendered by the Hub using DOM `textContent`, not injected HTML. The external core extension cannot request file contents. Additional API host permission requirements are derived from the user's selected OAuth scopes. See [Docs/Sheets preview caveats](google-files.md).

## Manual BYOK inference (v0.7)

`ai/providers.js` implements provider-specific OpenAI, Anthropic and Gemini single-turn text API requests with fixed HTTPS destinations. `ai/session.js` accepts only same-extension commands and checks the selected optional host permission and session API key before a request. The provider/model preference is kept in local storage; the key is kept in session storage and dropped on provider switch or explicit clear. Only the user-supplied prompt and currently selected Ayarime persona are sent. Provider response text is rendered with DOM `textContent`. There is no automatic Workspace context retrieval, tool calling, Google data transmission or external-core BYOK command. See [BYOK privacy and setup](byok.md).

## Morning Coffee local engine (v0.8)

`briefing/engine.js` deterministically ranks and correlates authorized, bounded Calendar and Tasks records. The same-extension `MORNING_COFFEE_PREPARE` command requires explicit source selection and an active Google session; it invokes no BYOK adapter. It labels partial coverage and only correlates shared, exact Google document references. `OPEN_BRIEFING_SOURCE` validates application-specific HTTPS URLs before activating/reusing a browser tab. No local persistence, background polling, Gmail, AI provider transmission or external core access. See [Morning Coffee](morning-coffee.md).

## Release metadata notification (v0.9)

`updater/release.js` validates versioned GitHub Releases for this exact repository. `updater/checker.js` stores a small, revalidated release-status cache in local extension storage, polls the allowlisted GitHub JSON API only after opt-in host consent via Firefox's daily alarms, and sets the toolbar badge when a new release is published. The Hub/sidebar show a sanitized release title, summary and trusted release-notes URL. No XPI or executable script is downloaded or installed. We intentionally avoid registering `runtime.onUpdateAvailable`, which can defer Firefox's native update installation. See [release notifications](release-notifications.md).

## Ayarime assistant deep-link (2026-11-10)
The optional core-to-companion v1 bridge now accepts `OPEN_ASSISTANT` from the allowlisted core sender only. It activates the pinned Workspace Hub at the constant local `hub.html#assistant` fragment; the Hub scrolls its existing BYOK console into view, focuses the prompt and clears the fragment for future handoffs. It does **not** open the native sidebar, restore Google tabs, submit a model request, read account content or transfer prompt/credential data. The separate `OPEN_WORKSPACE` operation retains its previous behavior. No external messages carry arbitrary URLs or text.

### Optional native sidebar continuation
The Hub's AI Console now offers **Continue in Firefox sidebar**, an ordinary button on the companion's own extension page. Its click handler calls `browser.sidebarAction.open()` synchronously as required by Firefox's user-action restrictions. It never attempts to open a sidebar through an asynchronous cross-extension message. The Hub remains usable if the sidebar cannot open and gives actionable feedback without asking for new permissions.

## Explicit per-send multi-turn model context (developer preview)

See [the multi-turn privacy, cost and payload specification](multi-turn-context.md). The Hub/sidebar context control begins unchecked and resets after submission; only an explicitly selected, bounded set of complete matching same-provider/model turns is included. The companion background, not page scripts, selects history using a 12,000-character / three-exchange cap. The core extension bridge cannot request history. OpenAI, Anthropic and Gemini use appropriate role-shaped arrays when context is selected, and their existing single-turn body formats when off. This feature is not provider-side persistent conversation storage.

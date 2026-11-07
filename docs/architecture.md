# Architecture — first alpha

This is an independent Firefox MV3 extension. The base ELF//SHELL 0.5.4 source remains untouched.

- Native toolbar click: synchronous sidebar.open() on the user gesture; background then executes workspace restoration.
- Firefox background event page owns serialized tab operations and locally stored resource definitions.
- Pinned `hub.html` master stays outside the Firefox tab group.
- Google applications are real Firefox tabs, never iframes.
- Resource matching prioritizes stable Google file IDs; default app landing pages are matched by application URL.
- Existing matching tabs are reused across normal windows, but tabs from another window are **not moved automatically**.
- Stored resource links are visible and editable, not secret; the browser storage API is not an encryption system.
- No Google REST API, OAuth token, AI model endpoint, MCP bridge, user email, or hidden network access is present in this alpha.

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

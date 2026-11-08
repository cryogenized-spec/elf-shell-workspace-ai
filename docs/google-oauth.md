# Google OAuth — developer preview (v0.6)

**Current status:** Code-complete implementation for local test harnesses; no live Google OAuth client has been provisioned or tested. It is **not publicly authorized** or ready for general release.

## Why a Desktop OAuth client?

Mozilla `browser.identity.getRedirectURL()` returns a synthetic domain Google may not accept. Mozilla documents a supported special loopback redirect for Firefox Desktop:

`http://127.0.0.1/mozoauth2/<subdomain-from-Firefox-identity.getRedirectURL>`

Google supports PKCE with Desktop OAuth clients and desktop loopback redirects. The companion calculates its own unique redirect at runtime, never guesses it, and requests only the selected read-only API scopes. Google may still require OAuth verification, and the exact redirect compatibility needs a live disposable account test.

References:
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity
- https://developers.google.com/identity/protocols/oauth2/native-app
- https://developers.google.com/workspace/calendar/api/v3/reference/events/list
- https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/list

## Developer setup

1. Create or select a Google Cloud project with Calendar API and/or Tasks API enabled.
2. Configure its OAuth consent screen and test users as Google requires.
3. Create an OAuth **Desktop application** client. Never include a confidential client secret in the extension source.
4. In the companion Hub, enter the client ID (ending in `.apps.googleusercontent.com`) and select Calendar, Tasks, or both, then save.
5. Click **Allow Google API connections** and approve the optional Firefox host permission request.
6. Click **Prepare sign-in**. The background creates an unpredictable OAuth state and a unique SHA-256 PKCE code challenge, and stores its verifier in session memory.
7. Click **Connect Google**. This is a **separate user click** so Firefox's interactive authorization opens from a user gesture.
8. Consent to the specific scopes. If Google returns successfully through Firefox's redirect, the extension exchanges the one-time code for a short-lived token.
9. Click **Read today's Calendar / Tasks** to fetch an explicit read-only snapshot. Nothing is fetched by just opening ELF//SHELL.
10. **Disconnect** immediately drops the local session token and attempts revocation at Google's endpoint. If revocation is unconfirmed, use your Google Account's Third-party access settings to revoke the app.

## Consent & storage

The app requests optional Firefox permissions for `oauth2.googleapis.com` and only the selected Google service API origins (`www.googleapis.com`, `tasks.googleapis.com`, `docs.googleapis.com`, `sheets.googleapis.com`). The extension's `identity` permission enables the OAuth browser flow. The app does **not** request Gmail scopes, generic Drive scopes or account-wide searches. Optional Docs and Sheets read-only scopes are available, but Google classifies these as **sensitive**, granting broader access than the UI's saved-file-only selection policy. See [Docs/Sheets previews](google-files.md).

The client ID and chosen scopes are stored in Firefox `storage.local`, and they are **not confidential**. A short-lived access token and pending authorization challenge are stored in Firefox `storage.session`. **No refresh token is retained.** No access token is returned in status messages or passed to ELF//SHELL's separate extension. Session storage isn't a secure vault; future persistent access will need a proper credential design.

Users can grant a subset of scopes; the UI only calls APIs corresponding to scopes actually granted. The native connector uses `GET` exclusively for user data, and contains no Gmail send, document write, sharing, delete, or calendar modification operation.

The read-only snapshot is intentionally bounded: up to 30 calendar events, 5 task lists and 25 incomplete tasks per list. This is **not** a complete inventory of a Google Workspace account, and truncated data is labelled accordingly.

## Testing and release gates

- Tests verify nonce/state, callback destination and 5-minute expiry, SHA-256 PKCE, strict client ID/scopes, refused/partial consent, absence of refresh tokens, authentication before any network calls, and GET-only allowed API routes.
- Existing native Firefox and dual-extension acceptance should remain green.
- **Not yet proven:** live Google authorization with real registered client ID; browser-specific token exchange handling; public OAuth verification; independent security assessment (if future broader Gmail or Drive restricted scopes are introduced); user-facing privacy review and Mozilla listing metadata.

No AI inference or Morning Coffee automatic analysis is enabled in this milestone.

### Direct client-ID creation link

The **Account Access** panel now provides a direct shortcut to [Google Cloud Console → Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients). Choose your project; complete the Google Auth setup or audience/consent-screen registration if prompted; click **Create client → Desktop app**; then copy the generated **Client ID** ending in `.apps.googleusercontent.com` into the extension's **Google OAuth Desktop client ID** field. Never paste an API key, OAuth access token or client secret into this field.

The link opens in a new tab with `noopener noreferrer` and does not itself authenticate the extension, send any user data or grant Google scopes. It only helps find the public client identifier. The actual Firefox/Google OAuth flow remains **not live-verified**, as described in this document.

## v0.13.2 — Live Google consent stalls: diagnosis and recovery

A real user reached the Google OAuth consent screen after setting up a new, correctly branded Google Cloud Desktop OAuth client, but Workspace AI returned to **“Google not connected”** and/or remained waiting after consent. No user access token was supplied to the development environment, and successful API retrieval is **not yet verified**.

The old Hub catch block displayed the Google/Firefox error and immediately refreshed connection status, overwriting the real failure with a generic “Google not connected” message. The v0.13.2 repair preserves a **sanitized, actionable error**, distinguishes redirect capture from token exchange, and displays a non-destructive waiting notice after 30 seconds.

The **Reset stuck sign-in** button clears only the pending one-time PKCE state/verifier in Firefox session storage. It **does not** revoke an existing access token or uninstall anything. If an old sign-in popup eventually completes, its callback is deliberately rejected because the pending state was removed. Firefox's native identity popup may need to be closed manually before retrying.

### Safe user recovery

1. Close the lingering Google sign-in window. **Never share its URL** (it may contain a one-time authorization code or OAuth state).
2. In Account Access, uncheck the sensitive **Docs** and **Sheets** read-only scopes for the first test; keep **Calendar** and **Tasks** read-only only. Save configuration.
3. Click **Reset stuck sign-in** if enabled, otherwise **Prepare sign-in** to generate a new one-time PKCE challenge.
4. Click **Connect Google** and follow Google consent. Ayarime now reports whether it is waiting for Firefox's redirect or exchanging a captured code with Google.
5. If Google seems to load forever after Continue, consider whether Firefox Multi-Account Containers or another container manager automatically assigns the Google domain to a container. Mozilla Bugzilla [#2028967](https://bugzilla.mozilla.org/show_bug.cgi?id=2028967) describes a case where `identity.launchWebAuthFlow` fails to capture a redirect in that configuration. If applicable, temporarily disable *automatic Google-domain container assignment* for a disposable test, then retry. This is a **possible** cause, not a confirmed diagnosis of this user's setup.
6. If Ayarime specifically reports an **HTTP 400 token exchange**, the redirect did reach Firefox, but Google's token request was rejected. Check that the **Desktop** client ID belongs to the intended project and that the challenge has not expired. Do not paste client secrets into the add-on. Recent reports describe potential Desktop PKCE client-secret compatibility quirks, but they require separate investigation; the app must not collect or embed a confidential secret.
7. For a persistent error, share **only** the sanitized stage and HTTP status shown by Ayarime—not authorization URLs, access/refresh tokens, raw developer-console requests or API keys.

The 5-minute pending challenge timeout is intentionally retained, and Google token responses still require matching state and authorized read-only scopes. No changes to Google's project, consent screen or account scopes are made automatically. Passing mocked and native Firefox tests is not proof of a live completed OAuth session.

Official references: [Mozilla Identity redirect support](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity), [Mozilla launchWebAuthFlow](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity/launchWebAuthFlow), [Google installed app authorization](https://developers.google.com/identity/protocols/oauth2/native-app).

## v0.13.3 — Firefox sign-in launch compatibility regression

The previous v0.13.1 build reached Google's consent screen in a real Firefox profile. v0.13.2 then introduced strict UI redirect checks and an extra optional `redirect_uri` field in the `browser.identity.launchWebAuthFlow` details object. A subsequent user attempt immediately failed **before launching Google**, with the generic status “Firefox could not start Google sign-in. Prepare sign-in again.”

**This is strong evidence of a v0.13.2 launch regression, not proof that any specific browser API parameter was unsupported.** We restored the previously successful `browser.identity.launchWebAuthFlow({interactive:true,url})` call. The Google authorization URL already contains its loopback `redirect_uri`, and Mozilla documents that the separate details field is optional. PKCE callback/state and one-time code checks in the background are unchanged. v0.13.3 preserves the status/error and non-destructive reset improvements from v0.13.2.

A dedicated UI launch module now distinguishes three safe start errors without echoing authorization URLs, callback codes or credentials: `AUTH_START_INVALID_REQUEST` (prepared URL missing/invalid), `AUTH_START_IDENTITY_UNAVAILABLE` (Firefox identity API missing) and `AUTH_START_BROWSER_REJECTED` (synchronous browser launch failure). Unit and native Firefox tests check the exact **two-field** launch signature, promptness and secret redaction. None of these tests uses the user's real credentials or proves a successful completed Google OAuth authorization.

**Recovery:** In the isolated test profile, replace the temporary v0.13.2 XPI with the verified v0.13.3 field-test build. Close any old Google sign-in window, retain the existing new project's Desktop OAuth client ID, select Calendar/Tasks only, and save. Prepare a new sign-in, then choose Connect Google. If another error occurs, share only Ayarime's sanitized `AUTH_START_...` code or stage/HTTP status. Do not paste a callback URL, authorization code, raw browser console request or access token.

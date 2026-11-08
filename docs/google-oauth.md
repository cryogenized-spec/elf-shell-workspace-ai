# Google OAuth — developer preview (v0.14.0)

**Current status (8 November 2026):** Following the session-only Desktop-client-secret fix in v0.13.4, the user reported successful real Firefox Calendar and Tasks OAuth/API reads. Drive and Gmail metadata (v0.14.0) and saved Docs/Sheets previews have **not** been verified live. Browser-specific denial/revocation/expiry testing and public Google OAuth verification remain incomplete. The extension is **not** a publicly signed or approved release. Historical troubleshooting notes below describe earlier version states, not today's acceptance status. See [the live-acceptance matrix](google-live-acceptance.md).

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
3. Create an OAuth **Desktop application** client. Keep the generated client ID and client secret locally; **never place the secret in extension source, a public repository, an issue or a chat**. Google considers installed apps public clients that cannot keep these values confidential.
4. In the companion Hub, enter the client ID (ending in `.apps.googleusercontent.com`), select Calendar/Tasks read-only, and save. Paste the matching Desktop client's generated secret into the **session-only password field**, then click **Use secret for this session**. Do not enter it in the client ID field.
5. Click **Allow Google API connections** and approve the optional Firefox host permission request.
6. Click **Prepare sign-in**. The background creates an unpredictable OAuth state and a unique SHA-256 PKCE code challenge, and stores its verifier in session memory.
7. Click **Connect Google**. This is a **separate user click** so Firefox's interactive authorization opens from a user gesture.
8. Consent to the specific scopes. If Google returns successfully through Firefox's redirect, the extension exchanges the one-time code for a short-lived token.
9. Click **Read today's Calendar / Tasks** to fetch an explicit read-only snapshot. Nothing is fetched by just opening ELF//SHELL.
10. **Disconnect** immediately drops the local session token and attempts revocation at Google's endpoint. If revocation is unconfirmed, use your Google Account's Third-party access settings to revoke the app.

## Consent & storage

The app requests Firefox permissions only for selected Google API origins (`oauth2.googleapis.com`, `www.googleapis.com`, `tasks.googleapis.com`, `docs.googleapis.com`, `sheets.googleapis.com`, `gmail.googleapis.com`). The extension's `identity` permission enables OAuth. In v0.14.0, separate restricted `drive.metadata.readonly` and `gmail.metadata` scopes are **OFF by default** and require an explicit account reconnect and Firefox consent. Docs and Sheets read-only scopes are separately **sensitive**, granting broader access than the saved-file-only UI policy. No general Drive content read or Gmail message-body access is implemented. See [Docs/Sheets previews](google-files.md) and [Drive/Gmail metadata](drive-gmail-metadata.md).

The client ID and chosen scopes are stored in Firefox `storage.local`, and they are **not confidential**. The separately entered Desktop OAuth client secret, a short-lived access token and any pending authorization challenge are stored in Firefox `storage.session` only. **No refresh token is retained.** No access token is returned in status messages or passed to ELF//SHELL's separate extension. Session storage isn't a secure vault; future persistent access will need a proper credential design.

Users can grant a subset of scopes; the UI only calls APIs corresponding to scopes actually granted. The native connector uses `GET` exclusively for user data, and contains no Gmail send, document write, sharing, delete, or calendar modification operation.

The read-only snapshot is intentionally bounded: up to 30 calendar events, 5 task lists and 25 incomplete tasks per list. This is **not** a complete inventory of a Google Workspace account, and truncated data is labelled accordingly.

## Testing and release gates

- Tests verify nonce/state, callback destination and 5-minute expiry, SHA-256 PKCE, strict client ID/scopes, refused/partial consent, absence of refresh tokens, authentication before any network calls, and GET-only allowed API routes.
- Existing native Firefox and dual-extension acceptance should remain green.
- **Remaining live acceptance:** independently documented repeat of Calendar/Tasks OAuth; Drive/Gmail restricted-scope consent and reads; Docs/Sheets actual saved-file previews; partial consent, denial, revocation, token expiration, Firefox restart and disconnect.
- **Remaining public release gates:** Google OAuth and restricted-scope verification/security requirements, Mozilla privacy/data-collection review, and signed installation. Do not set `release-gates.json` approvals solely from user-reported API success.

No AI inference or Morning Coffee automatic analysis is enabled in this milestone.

### Direct client-ID creation link

The **Account Access** panel now provides a direct shortcut to [Google Cloud Console → Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients). Choose your project; complete the Google Auth setup or audience/consent-screen registration if prompted; click **Create client → Desktop app**; then copy the generated **Client ID** ending in `.apps.googleusercontent.com` into the extension's **Google OAuth Desktop client ID** field. Never paste an API key, OAuth access token or client secret into this field.

The link opens in a new tab with `noopener noreferrer` and does not itself authenticate the extension, send any user data or grant Google scopes. It only helps find the public client identifier. Calendar and Tasks were subsequently **user-reported successful in live Firefox**; see the acceptance matrix for the distinction between field reports and formal release-gate verification.

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
6. If Ayarime specifically reports an **HTTP 400 token exchange**, the redirect did reach Firefox, but Google's token request was rejected. Check that the **Desktop** client ID belongs to the intended project and that the challenge has not expired. Use only the local **session-only Desktop OAuth client secret** field added in v0.13.4; never paste it into GitHub, chat, developer logs or non-secret fields. Recent reports describe potential Desktop PKCE client-secret compatibility quirks, but they require separate investigation; the app must not collect or embed a confidential secret.
7. For a persistent error, share **only** the sanitized stage and HTTP status shown by Ayarime—not authorization URLs, access/refresh tokens, raw developer-console requests or API keys.

The 5-minute pending challenge timeout is intentionally retained, and Google token responses still require matching state and authorized read-only scopes. No changes to Google's project, consent screen or account scopes are made automatically. Passing mocked and native Firefox tests is not proof of a live completed OAuth session.

Official references: [Mozilla Identity redirect support](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity), [Mozilla launchWebAuthFlow](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity/launchWebAuthFlow), [Google installed app authorization](https://developers.google.com/identity/protocols/oauth2/native-app).

## v0.13.3 — Firefox sign-in launch compatibility regression

The previous v0.13.1 build reached Google's consent screen in a real Firefox profile. v0.13.2 then introduced strict UI redirect checks and an extra optional `redirect_uri` field in the `browser.identity.launchWebAuthFlow` details object. A subsequent user attempt immediately failed **before launching Google**, with the generic status “Firefox could not start Google sign-in. Prepare sign-in again.”

**This is strong evidence of a v0.13.2 launch regression, not proof that any specific browser API parameter was unsupported.** We restored the previously successful `browser.identity.launchWebAuthFlow({interactive:true,url})` call. The Google authorization URL already contains its loopback `redirect_uri`, and Mozilla documents that the separate details field is optional. PKCE callback/state and one-time code checks in the background are unchanged. v0.13.3 preserves the status/error and non-destructive reset improvements from v0.13.2.

A dedicated UI launch module now distinguishes three safe start errors without echoing authorization URLs, callback codes or credentials: `AUTH_START_INVALID_REQUEST` (prepared URL missing/invalid), `AUTH_START_IDENTITY_UNAVAILABLE` (Firefox identity API missing) and `AUTH_START_BROWSER_REJECTED` (synchronous browser launch failure). Unit and native Firefox tests check the exact **two-field** launch signature, promptness and secret redaction. None of these tests uses the user's real credentials or proves a successful completed Google OAuth authorization.

**Recovery:** In the isolated test profile, replace the temporary v0.13.2 XPI with the verified v0.13.3 field-test build. Close any old Google sign-in window, retain the existing new project's Desktop OAuth client ID, select Calendar/Tasks only, and save. Prepare a new sign-in, then choose Connect Google. If another error occurs, share only Ayarime's sanitized `AUTH_START_...` code or stage/HTTP status. Do not paste a callback URL, authorization code, raw browser console request or access token.

## v0.13.4 — Google Desktop client secret required by live token endpoint

During a real Firefox session, the Google Cloud Desktop client successfully opened Google's consent screen and returned a one-time OAuth code to the add-on, but `https://oauth2.googleapis.com/token` rejected the code exchange with **HTTP 400 `invalid_request`: `client_secret is missing`**. The extension omitted this parameter despite supplying a client ID, verifier, exact loopback redirect and `authorization_code` grant type.

Google's Desktop OAuth documentation marks `client_secret` as **optional** in its token-exchange parameter table, but Google's live endpoint required it in this case. Independent Google developer forum reports describe the same behavior for newly created Desktop clients using PKCE. Google explains that Desktop apps are public clients and **cannot protect a bundled secret**, so this client secret is not a suitable sole security boundary. PKCE, state validation, short-lived access tokens and least-privilege scopes remain essential.

**v0.13.4 correction:** The Account Access page now has a **Google Desktop OAuth client secret · this Firefox session only** password field. The value is never placed in the GitHub repository, XPI bundle, `storage.local`, update metadata, console logs, AI provider prompts or status responses. The corresponding token request includes `client_secret` only in its HTTPS POST body to Google's OAuth token endpoint. It remains in Firefox `storage.session` until the user clears it, disconnects, changes the Google Client ID or ends the browser session. Session storage is not encrypted and can be inspected by someone with privileged browser access; it is **not** a hardware-backed secret vault.

**How to enter it:** On the [Google Auth Platform Clients page](https://console.cloud.google.com/auth/clients), select the existing **Desktop app** OAuth client for the new ELF//SHELL project. Retrieve its matching client secret from Google's credentials interface or the OAuth Desktop client JSON you saved at creation. Do not share or screenshot the client secret. In Ayarime enter the public Client ID as usual, save configuration, enter the **matching** client secret in the new password field and press **Use secret for this session**. Then prepare a **fresh** sign-in and connect with Calendar/Tasks scopes only. Old authorization codes and PKCE verifiers are single-use and must never be replayed.

The token exchange now classifies `missing-client-secret`, `invalid-client`, `invalid-grant`, `unauthorized-client` and unknown failures using a fixed, redacted error description. It never returns raw Google token error bodies, code/verifier or secret values to the UI. **Historical note:** at the time v0.13.4 was merged, the new secret input had not been live retested. The later user field report confirmed Calendar/Tasks reads; no public OAuth approval is implied.

Official references:
- https://developers.google.com/identity/protocols/oauth2/native-app
- https://developers.google.com/identity/protocols/oauth2/
- https://discuss.google.dev/t/desktop-oauth-pkce-exchange-returns-invalid-request-after-successful-loopback-callback-with-no-client-secret/390526

## v0.14.0 optional restricted metadata scopes

Ayarime now supports opt-in `drive.metadata.readonly` (Drive file listing) and `gmail.metadata` (inbox headers) as separate Google REST sources. These are Google **restricted** scopes, not automatically granted by enabling APIs, and are disabled by default. Gmail requires an additional Firefox `personalCommunications` consent. Selecting either scope changes the OAuth configuration and requires a new explicit Google connection. The API's ordinary bearer access token remains short-lived. The existing Calendar/Tasks scopes and original successful live read continue independently. See [Drive/Gmail metadata](drive-gmail-metadata.md). Neither restricted scope has yet passed actual user-account acceptance or production verification.

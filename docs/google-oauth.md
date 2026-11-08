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

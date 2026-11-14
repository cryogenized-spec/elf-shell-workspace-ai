# Stage 6.1 — private Firefox OAuth for Google Master MCP (development)

**Status:** an implemented, manually initiated connection flow with synthetic acceptance tests. No real Firefox account connection, Cloudflare configuration update, browser-origin allowlist change, Google record read, or production release is claimed.

## Scope

Ayarime's Workspace Hub now offers a **separate** Google Master MCP panel. This does not use the older direct Google Desktop OAuth client credentials shown elsewhere in the Hub. It is a first-party public OAuth client of the operator's own **protected MCP authorization server**, not a Google API client or a copied ChatGPT bearer.

Connection is deliberately two separate user actions:

1. Click **Allow private Worker host**. Firefox asks for the exact HTTPS host permissions for `google-master-auth.cryogenized.workers.dev` and `google-master-mcp.cryogenized.workers.dev`, plus its listed optional data-sharing categories. Denying this stops the process before any connection.
2. Click **Connect read-only OAuth**. The background checks the permissions and Firefox `identity` API. It fetches the fixed authorization server's metadata, verifies exact pinned endpoints and PKCE support, and dynamically registers one **public** client using the current `identity.getRedirectURL()` callback. It then generates a cryptographically random state/verifier, derives the PKCE S256 challenge, opens Firefox's *interactive* login/consent window, validates the redirect/state and exchanges the single-use code for an MCP token.

The only requested client scope is `mcp:read`, and the request binds the token to `https://google-master-mcp.cryogenized.workers.dev/mcp` using the OAuth resource parameter. An unexpected `mcp:write`, `offline_access`, other scope, refresh token, public-client secret, incorrect redirect or mismatched state **fails closed**. The provider might offer other scopes on its consent page, but Ayarime will refuse a grant that is not strictly read-only.

Tokens and pending verifier/state are only kept in Firefox `storage.session`, **never** persistent settings, exports, logs, or an AI prompt. An expiry safety margin is applied. There is no automatic refresh and no background network at startup. A new connection requires a new user interaction. Explicit **Disconnect and forget session** clears local state before attempting best-effort server revocation; if remote revocation fails or host permission has been revoked, the UI says remote revocation cannot be confirmed. Removing the Firefox host/data permission also deletes the local MCP session. This session storage is not an encrypted credential vault.

**Verify available read operations** makes a separately requested call to `/v1/capabilities` via the strict read-only Master client. It returns only allowed operation names/counts; it does **not** query Gmail, Google Tasks, Drive, Calendar, Docs or Sheets contents and does not share anything with an AI provider. The master client's 24-operation read allowlist is unchanged, and no mutation/approval token workflow is reachable.

All endpoints are exact, pinned HTTPS origins. Auth responses have a 16 KiB cap and 12-second timeout, no cookies, no redirects and no referrer. Unknown response bodies and browser OAuth errors are redacted. Normal Hub startup reads only local status and makes **zero** network calls.

## Outstanding real-world acceptance

- The single-user Google Master Worker must continue to maintain its existing authenticated operator session and separately linked Google vault. **Do not** alter the Cloudflare runtime, enable M23 mutations, or copy authorization grants from ChatGPT.
- Install Ayarime in a **disposable Firefox profile** using an explicitly reviewed build that declares the required `identity` permission. The current unsigned v0.5.6 unified preview does **not** have that required permission; its Google Master UI/commands must remain disabled and cannot be represented as ready to connect until a separately approved release manifest is reviewed.
- Read the exact `moz-extension://...` instance origin from the Hub's connection details. If authorized, register **only that exact origin** in the protected Worker's `GMW_ALLOWED_BROWSER_ORIGINS`. Do not use wildcards, copy a stable origin from a different profile, or bypass CORS. A temporary installation may use a different UUID.
- Validate the live OAuth DCR endpoint, Firefox redirect compatibility, token endpoint CORS/host access, consent screen, and no secret transmission. Current coverage is synthetic, not a real operator login. DCR is the backward-compatible client registration path offered by the current protected auth server; a future CIMD or pre-registered client may be preferable for publication.
- Check token expiry, Firefox permission revocation, logout and account-vault disconnection in a disposable profile. Do not make real Workspace data reads until those pass and the user opts in per operation.

**Release separation:** The public signed v0.5.5 build and the already-verified unsigned v0.5.6 unified release candidate are unchanged. Their Google OAuth/account routes remain explicitly disabled. The modular companion's `identity` required permission cannot be silently copied into the public core's installation permissions. This is development-only code, not an AMO publishing instruction.

References: `docs/stages-5-6-integration.md`, the Google Master Worker `docs/M10-CLIENT-API.md`, Firefox identity API (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity), and Cloudflare workers-oauth-provider authorization server (https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/authorization-server.md).

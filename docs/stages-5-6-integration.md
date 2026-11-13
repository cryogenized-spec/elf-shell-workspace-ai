# Stages 5–6 — BYOK hardening and Google Master Worker read-only bridge

**Scope:** post-v0.5.6 development work in the modular Workspace AI repository. The signed public ELF//SHELL v0.5.5 add-on and the separately pinned v0.5.6 unsigned unified release candidate do not change through this branch.

## Stage 5 — model-persona boundary and request controls

The existing Ayarime / Professional / Custom persona editor remains a **presentation instruction**, not a permission system. Custom text must never grant Google scopes, model tool execution, browser tab access or automatic writes. Existing OpenAI streaming and per-request history consent remain independent.

One-shot OpenAI, Anthropic and Gemini calls now have a 30-second client timeout, a 256 KiB successful-response cap, a bounded 512-token requested output, sanitized provider errors, and a cancellation signal. The Firefox background routes only one one-shot request at a time; the Hub/sidebar **Stop request** button aborts Anthropic/Gemini, and clearing the session API key or revoking an optional provider permission aborts the active request. The existing OpenAI streaming stop button is unaffected. The provider request uses `credentials:"omit"`, `redirect:"error"` and `cache:"no-store"`.

These safeguards cap client-side usage but cannot guarantee spending or provider retention. The source is still subject to a locally controlled single-request live inference test with a deliberately budget-limited API key. Never place keys in CI, GitHub issues, crash reports or screenshots. User consent is required before transmitting each prompt; this work adds no auto-inference.

## Stage 6 — Google Master Worker architecture

The companion now contains `google/master-read-client.js`, a **transport-only**, side-effect-free-by-default client. It has no login button, runtime message command, OAuth token lifecycle, scheduled reader, write operation or automatic connection. It does not replace the companion's existing standalone OAuth preview. The client can only be invoked after a future, separately reviewed UI supplies **all three** callbacks:

1. `approveRead({operation,risk:"read",inputKeys})` — an explicit user approval **for that call**; denial happens before obtaining any token or contacting the host.
2. `hasHostPermission(origin)` — Firefox's optional permission for exactly the operator's protected MCP Worker origin.
3. `getAccessToken()` — an **MCP resource** OAuth bearer from an app-specific public-client authorization-code/PKCE flow with `mcp:read`. It is *not* a Google token from the separate D1 vault. This module neither stores nor refreshes a bearer.

The backend resource is the exact `https://google-master-mcp.cryogenized.workers.dev/mcp` endpoint. The client sends only to that origin's fixed `/v1/capabilities` and `/v1/operations/<allowlisted name>` URLs, never arbitrary Google REST, URL parameters or write endpoints. Its allowlist is limited to the **24 M21 deployed read actions**, even if a future Worker version advertises 101 reads and 90 writes. Tool descriptions and fetched Google data are untrusted content; no result is sent to a model automatically.

The client rejects credential-like fields and prototype-polluting input keys, enforces 32 KiB input / 512 KiB response limits, no redirects, no cookies, no referrers, a 12-second default timeout and safe error categories. A caller attempting an M23 mutation such as `tasks_create_task`, `gmail_send_message`, `docs_batch_update`, or even `write_prepare_action` fails locally before user approval or OAuth.

**No live Google Workspace data access is performed in the tests.** Tests use only mock bearer values, fake remote capabilities and synthetic Google items.

## Stage 6 activation blockers

The resource Worker requires a **per-client** OAuth authorisation and a separate already-linked operator Google vault. Before the client can actually read the user's Google account, implement and review the Firefox-specific OAuth authorization-code/PKCE callback, protect its session-only access tokens, and test logout, expiration, revocation and Google-vault disconnection. Enable the exact extension origin in the Worker's `GMW_ALLOWED_BROWSER_ORIGINS` allowlist **after installation**; do not guess the `moz-extension://...` origin or use wildcards. Verify CORS preflights and read calls in a disposable Firefox profile.

Google Master M21's read gate is already reported live, but this does **not** authenticate Ayarime as a client. The source of a user-approved OAuth bearer and exact browser origin are still missing. Do not use a ChatGPT MCP token as a copied browser credential or expose the personal Google Worker OAuth client secret inside the extension. Do not rotate the existing operator OAuth account or touch the protected Cloudflare deployment as part of an extension-side change.

The current Google Master's future M23 exact-action writes are a **separate milestone** and stay entirely outside this read-only client. For Gmail and Drive, Google classifies broad account scopes as restricted; public access or transmission to models needs the appropriate Google OAuth verification and potentially a security review. Prefer minimum scopes, per-file selection where technically supported, and owner confirmation for any Workspace-to-model data flow. Without these prerequisites the UI should show **not connected**, not a fabricated successful account status.

## Acceptance

Run `npm test` and the repository's native Firefox workflows. They must verify that ordinary Hub/sidebar startup has **zero** Google Master requests and that denied user approval, missing optional host permission, invalid resource host, missing MCP token, and any write operation cause **zero** Google Master network requests. A real extension's Google Master API acceptance, restricted-scope review and public signing remain separate future release gates.

References:

- Google Master Worker: `docs/M10-CLIENT-API.md` and `docs/M22-COMPREHENSIVE-READS.md` in `cryogenized-spec/Google-master-worker-MCP`
- Mozilla WebExtensions identity API: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity
- Google Gmail scopes and verification: https://developers.google.com/workspace/gmail/api/auth/scopes

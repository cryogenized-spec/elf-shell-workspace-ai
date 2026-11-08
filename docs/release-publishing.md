# Release governance — v0.10.0

**The current companion is an unsigned developer alpha. Nothing in this repository automatically signs, publishes, or uploads the add-on to Mozilla.**

## Candidate workflow

Run the `Build release candidate (QA only)` GitHub Actions workflow manually on `main`, supplying the exact version tag (for example `v0.10.0`). It runs the JavaScript suite, builds the existing self-contained unsigned XPI, performs strict Mozilla `web-ext` lint, checks exact archive/source equivalence and manifest versions, and generates a SHA-256 report. It uploads a seven-day **UNSIGNED-QA** artifact; it does not create a GitHub Release or an AMO submission.

The PR validation workflow also executes the release-preflight tests. The report includes `signed:false`, `published:false`, `publishReady:false` until all independent gates are completed. Do not distribute unsigned QA artifacts as installable Firefox updates.

## Required independent gates

The `release-gates.json` file begins with all gates unapproved. Each gate requires a human-reviewed, project-specific GitHub issue URL documenting evidence before it can be marked approved:

1. Complete separately evidenced Google OAuth PKCE/redirect, partial scope consent, denial, disconnect and expiry, plus bounded Calendar/Tasks/Docs/Sheets/Drive/Gmail live reads with a disposable account (see [v0.14.0 field matrix](google-live-acceptance.md) and [Issue #15](https://github.com/cryogenized-spec/elf-shell-workspace-ai/issues/15)). The user reported successful Calendar/Tasks reads, but this does not approve the full gate.
2. Live BYOK OpenAI/Anthropic/Gemini tests using disposable budget-restricted keys, supported model IDs, provider-specific errors and cancellation (see Issue #19).
3. Mozilla privacy and data consent acceptance, including current manifest permissions, optional `data_collection` prompt and correct provider disclosures. Requires both Firefox real-device confirmation and reviewer sign-off.
4. Signed add-on installed and upgraded in real Firefox, without ID drift or loss of stored profiles. Verify Mozilla's signed package independently.
5. Approved distribution channel (AMO listed vs unlisted) and its update behavior, plus a documented public privacy statement and release notes.

The candidate workflow **does not** grant these approvals. Merely passing unit tests or creating a GitHub tag does not prove the Google or provider APIs work.

## Firefox signing and updates

For a public AMO-listed add-on, Mozilla hosts the signed extension and Firefox handles its normal signed updates. Starting with web-ext 8, `web-ext sign --channel=listed` uses the AMO submission API; listing review may be asynchronous and requires separate metadata/compliance checks. For a self-distributed signed XPI, `--channel=unlisted` is available, but the update policy and self-hosting must be configured and reviewed independently.

**Do not blindly publish to `listed` or run `web-ext sign` on every push.** Signing involves AMO credentials and creates an external submission. The repository currently contains **no signing job and no signing credentials**. When all gates are approved, create a separate manually triggered, environment-protected publishing workflow after verifying current Mozilla CLI requirements. Require explicit release approval and log only nonsecret SHA-256/signature verification results.

Publishing a signed XPI to GitHub Releases isn't equivalent to an AMO-listed install, and a GitHub Release does not by itself update existing Firefox installations. The in-app Update Watch is for **version notification and release notes**, not code installation. Executable extensions require complete signed XPIs; see [release notifications](release-notifications.md).

## Data collection consent

Firefox 142+ supports `browser_specific_settings.gecko.data_collection_permissions`. This extension declares `required:["none"]` and optional `authenticationInfo`, `personalCommunications`, `websiteContent`, and `personallyIdentifyingInfo` for user-initiated OAuth/BYOK workflows. These are requested from a click, together with the selected provider/API host permission. API-key storage or third-party prompt submission is rejected if required optional consent is not granted.

Google authorization uses only selected read-only OAuth scopes; the data returned from Google is not sent to an AI provider unless the user manually pastes it into a prompt. BYOK explicitly transmits user-entered text and persona to the selected provider; its own data retention/billing policy applies. Nothing is sent to provider APIs just by opening the Hub. Consent rejection or revocation must leave these actions disabled.

Mozilla's requirements and API behavior are documented here:
- https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions/contains
- https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/
- https://extensionworkshop.com/documentation/develop/web-ext-command-reference/

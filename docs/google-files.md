# Google Docs and Sheets — read-only file previews (v0.6 developer preview)

This phase adds **manual, bounded previews of specific saved Google Docs and Sheets files** in Ayarime's Workspace Hub. It does not search the user's Drive, request Gmail data, send files to any AI provider or edit document contents.

## Scope and OAuth trade-off

The optional Google scopes are:
- `https://www.googleapis.com/auth/documents.readonly` — Google classifies this as **sensitive**. It grants the OAuth client read access to documents the user can access, subject to account permissions.
- `https://www.googleapis.com/auth/spreadsheets.readonly` — also **sensitive**, for spreadsheets the user can access.

**Important:** These scopes grant broader account access than Ayarime's **UI-level selection policy**. The extension currently only requests data for exact files saved in the active Workspace profile, but Google authorization itself is not limited to those saved file IDs. This developer preview is **not a publicly verified OAuth app**.

The attractive alternative `drive.file` is **non-sensitive and per-file**, but it does *not* authorize arbitrary Drive files merely because somebody pastes a file URL. To use `drive.file` correctly for pre-existing files, we need a separate Google Picker / Google-integrated file selection flow. That work belongs in a later milestone. At the time of v0.6 we deliberately did not request restricted `drive.readonly` or `drive.metadata.readonly`. The newer v0.14.0 build offers **optional, separately consented** `drive.metadata.readonly` file metadata only; it still does not grant file content downloads. See [Drive/Gmail metadata](drive-gmail-metadata.md).

Official references:
- https://developers.google.com/workspace/docs/api/auth
- https://developers.google.com/workspace/sheets/api/scopes
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/get
- https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get

## Usage

1. In the Workspace Hub, save a Google Doc or spreadsheet with its **specific editor URL**, not its app homepage.
2. In Google OAuth settings, add Docs and/or Sheets read-only scope. Save the configuration, explicitly grant the newly required Google API host permission, then connect with a test account (requires a configured Google Cloud OAuth Desktop client and enabled APIs).
3. Select **Read preview** beside the saved file. No file is read merely because a tab is open.
4. Docs previews display extracted plain text from the API's tab/body hierarchy, capped at 12,000 characters. Complex formatting, images and embedded objects are not represented.
5. Sheets previews display up to **100 rows and 26 columns**. Default is `A1:Z50`. The connector resolves `gid` from the saved URL via spreadsheet metadata, so it reads the intended tab rather than guessing.
6. The data appears locally inside the Hub. It is not persisted in local storage, transmitted through the external ELF//SHELL bridge or sent to an AI service.

## Security boundaries

- Only same-extension messages can request a file preview. The request contains a saved resource **key**, not an arbitrary destination URL or file ID.
- The background resolves the key against the current Workspace profile and validates that it is a Google Doc or Sheet on `docs.google.com`, with a matching stable file ID.
- Only HTTPS `GET` requests go to `docs.googleapis.com` or `sheets.googleapis.com`; redirects, cookies and background polling are disabled.
- Tokens remain short-lived in Firefox session storage. No refresh tokens.
- JSON API responses are limited to 2 MiB for preview parsing; text and output cell counts are further bounded. A limited preview is not a complete document export.
- API or permission errors are shown rather than bypassed.

## Release status

**Tested:** mocked API fixtures for nested Docs, Sheets tab/GID selection, quoted titles, OAuth scopes, malicious URLs, oversized ranges/responses, missing credentials and external-bridge denial. Native Firefox regression tests and Mozilla add-on lint remain required.

**Live status as of 8 November 2026:** The user has reported successful real Google Calendar/Tasks OAuth reads after v0.13.4; **real Docs/Sheets previews remain unverified**. The Docs/Sheets sensitive-scope consent and selected disposable-file tests must be recorded separately in [the live-acceptance matrix](google-live-acceptance.md). Google consent-screen verification and public signed release remain outstanding.

## Next steps

- Complete live OAuth verification on a disposable test account.
- Build Google Picker/file selection using `drive.file` where feasible without remote executable code in the extension.
- Add user-approved Docs/Sheets editing in a separate milestone with explicit preview/diff and rollback where APIs permit.
- Add provider-independent BYOK inference and evidence-linked Morning Coffee only after data-sharing controls and user consent are implemented.

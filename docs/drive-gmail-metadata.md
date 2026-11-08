# Drive + Gmail metadata developer preview — v0.14.0

## Scope and intention

This is the next REST integration after the user's **real-world verified Calendar and Tasks** access. It adds small, **manual** Google Drive and Gmail previews to the Workspace Hub, not full Workspace-wide agentic access. API enablement in Google Cloud is distinct from OAuth scope consent; adding an API does **not** grant access to that account.

The user can separately select:

- **Google Drive — file metadata only**: `https://www.googleapis.com/auth/drive.metadata.readonly`. The user must grant the scope explicitly. A click on **Read 20 recent Drive file names** calls Drive REST `files.list` once with `q=trashed = false`, `orderBy=modifiedTime desc`, `pageSize=20` and a field mask `nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)`. The response displays file name, MIME type, modification date and a link only if the destination is a validated Google Docs/Drive origin. This does **not** download file bodies or attachments, search all shared Drives, upload, edit, share or delete files.
- **Gmail — inbox headers only**: `https://www.googleapis.com/auth/gmail.metadata`. A click on **Read 8 Gmail inbox headers** calls `users.messages.list` with `labelIds=INBOX`, `maxResults=8` and a minimal fields mask. It follows up with at most eight `users.messages.get` requests with `format=metadata` and only `From`, `Subject`, `Date` headers. It displays these plus the unread flag. This scope **does not allow Gmail's `q` search parameter**. No message body, snippets, attachments, drafts, send, modify, forward or mailbox management operations are permitted.

## Permission and privacy constraints

**Both scopes are restricted under Google's OAuth classification.** Google's verification requirements apply independently of the user's existing Calendar/Tasks and Docs/Sheets access. The checkboxes are **OFF by default**, and the Hub warns about their reach. Gmail is granted `personalCommunications` optional Firefox data consent, in addition to the prior Google authorization and website data controls. No Gmail network call occurs on login, when opening the Hub, during Morning Coffee or when interacting with the OpenAI BYOK console.

On every explicit click the backend checks the **exact Google session scope**, the unexpired short-lived token, the corresponding Firefox host permission and data consent. Gmail uses only `https://gmail.googleapis.com/*`; Drive metadata uses `https://www.googleapis.com/*`. Only fixed HTTPS GET destinations are allowed. Response limits are 256 KiB per request, eight headers or twenty file rows at most. URL-derived request inputs are not accepted from the user. Google provider error bodies and access-token contents are never forwarded.

The returned names and email headers can contain private information, but are rendered only inside the open Hub using text nodes—not HTML injection. Neither results nor access tokens are stored by this module. No content is passed to any AI provider or exposed to the external theme extension.

A scope-selection change invalidates the prior access token and requires an explicitly reauthorized Google sign-in. The matching Desktop OAuth secret is still stored only in Firefox `storage.session`, never the source code. There is no automatic refresh, and users will need to reconnect after token expiration.

## Google Workspace API limits

These are **developer-preview REST functions**, not MCP tools. The current public-oriented implementation has not passed Google's restricted-scope verification, security assessment or production review. The app must not claim it is authorized to access all customer accounts simply because a local testing account can grant the requested scope. Consult the official restrictions and data policies before distribution.

Additionally, `drive.file` plus the Google Picker is the preferred **non-restricted, per-file authorization** approach for future file workflows; it does not provide a simple unrestricted listing of the user's entire Drive and pasting a link does not grant access. The existing Google Docs/Sheets read-only scopes are separately sensitive and should not be conflated with `drive.file` permissions.

## Tests and acceptance

Unit tests exercise exact scopes, fixed HTTPS endpoints, no Gmail `q` search, response sizes, missing permissions, raw-error redaction, no message body propagation, safe Drive links, and at most 8/20 items. Background tests verify no reading without direct account authorization and no ability for the original theme extension to invoke these requests. Native Firefox tests confirm the restricted checkboxes are unselected, action buttons disabled until connection and the privacy copy shown.

**Passing CI is not live Google API acceptance.** The user reported real Calendar/Tasks access, but neither Drive nor Gmail has a confirmed live read. See the [v0.14.0 live-acceptance matrix](google-live-acceptance.md) for independent G03/G04 test steps, privacy-safe recording and pending public verification. Request limited approval in the user's own test Google Cloud project and use only the two manual preview buttons to test them. Do not share OAuth codes, token values, entire mail payloads or client secrets in bug reports.

## Sources

- [Drive files.list REST reference](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list)
- [Drive scope classifications](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Gmail messages.list reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
- [Gmail messages.get reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)
- [Gmail scope classification](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Google Workspace user data developer policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)

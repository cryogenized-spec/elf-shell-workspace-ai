# Test and manual smoke checklist

## Developer checks

```sh
npm test
npm run package
# optional, requires Mozilla web-ext: web-ext lint --source-dir dist/extension --warnings-as-errors
```

Use a fresh Firefox Desktop profile (Firefox 142+):
1. Navigate to `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, then choose this repo's `manifest.json`.
2. Click the new Ayarime companion toolbar action; confirm the sidebar appears, a pinned Workspace Hub is created, and subordinate Google tabs appear in one named group.
3. Click the toolbar action again; confirm the number of Google app tabs does not increase.
4. Open a disposable Google spreadsheet; add its full URL with a unique name in the Hub.
5. Select **Open** for that resource and confirm Firefox activates the existing tab, not a duplicate.
6. Move a resource tab into another Firefox window; confirm re-launch leaves it in that window instead of forcibly moving it.
7. Close and recreate the Hub; confirm the master is pinned and saved resource entries persist.
8. Add a malformed URL, a non-Google URL and a duplicate; confirm each is rejected.
9. Verify the underlying core ELF//SHELL new-tab page continues working with the companion installed and with it disabled.

**Status update (v0.14.0):** This initial checklist predates the user's successful Calendar/Tasks OAuth field report after v0.13.4. The CI tests use fake or unauthenticated account data; real Docs/Sheets/Drive/Gmail results have not been recorded. See [the current per-service field acceptance plan](google-live-acceptance.md).

## Named-profile acceptance (v0.3)

10. Create a new empty "Workshop" profile, add a disposable Google document, then launch; confirm a second named Firefox group is created.
11. Select "Google Workspace" again; confirm its six default resources are still configured.
12. Add Gmail to another profile; launch and confirm the existing Gmail tab is reused without being moved from its original group.
13. Rename the profile, switch back and forth, delete the non-default profile; confirm no open tabs are closed.
14. Verify a previous alpha's saved `elfshell.workspace.resources.v1` resources migrate to the default profile.
15. Check long profile names, duplicate names and the ten-profile limit give readable errors.

## Real Firefox CI acceptance

Run `npm test`, `npm run package`, `npx --yes web-ext@10.8.0 lint --source-dir dist/extension --warnings-as-errors`, and `python3 tests/native_firefox.py` in an isolated Firefox Desktop 142+ profile with Selenium. The CI workflow `.github/workflows/native-firefox.yml` installs a temporary unsigned extension; no real Google account or external AI key is required.

The native suite verifies: extension page loads; default six Workspace links; pinned Super Tab; named Firefox group; repeated launch creates no duplicate tabs even during `about:blank` navigation; named profile isolation; and non-destructive profile deletion. It uploads an isolated screenshot and JSON report for inspection. It does **not** replace user acceptance of visual design, popup/sidebar gesture behavior, or signed-extension installation.

## Core + companion integration acceptance

The `integrated-firefox` GitHub Actions job installs an unsigned core build from `cryogenized-spec/elf-shell-ayarime` and this companion in the **same disposable Firefox session**. It tests the actual phrase “Ayarime, please bring up my workspace” entered in the core command palette. It then checks cross-extension HELLO/OPEN_WORKSPACE, the pinned Super Tab, the native Google group, and zero duplicates on a second invocation.

This test passed in the November 7, 2026 GitHub Actions run. It does not access or process authenticated Google data, nor does it replace manual checks of the installed sidebar and Mozilla signing.

## Personality settings

16. In the Hub, choose Professional and save; confirm the sidebar reflects that selection and it persists after reopening the Hub.
17. Choose Custom, enter multiline instructions and save; confirm the text persists locally, without network requests.
18. Reset to Ayarime; confirm default mode and empty custom instructions.
19. Enter an empty Custom prompt, an unsupported mode and an oversized prompt; confirm validation errors and no unexpected changes.
20. Confirm the companion still works with no AI provider configured and its external core bridge cannot edit persona settings.

## Google developer-preview checks

21. Without a configured Google Desktop OAuth client ID, confirm the account shows disconnected and performs no network requests.
22. Select Calendar only, save, grant optional Firefox API origins explicitly; verify declining the prompt leaves access disabled.
23. Prepare sign-in and inspect that the authorization URL uses Firefox's documented `127.0.0.1/mozoauth2/<derived identity>` redirect, state and PKCE S256.
24. With a disposable Google OAuth project and test account, validate interactive Firefox redirect, token exchange, granular scope consent and cancellation. **Calendar/Tasks were reported successful live; denial, cancellation, revocation and additional services remain separately unaccepted.**
25. Click the manual read action; confirm only Google Calendar/Tasks GETs are made, no Gmail scopes are requested, and partial/truncated results are labelled.
26. Disconnect and verify local credentials are cleared regardless of whether Google confirms revocation.
27. Verify no Google token reaches ELF//SHELL core extension, generic UI status messages, logs, or persistent `storage.local`.

## Docs and Sheets preview (v0.6)

28. Save a disposable Google Doc and Sheet URL; ensure only those saved resources show the **Read preview** action in the Hub.
29. Without an authenticated Google session and matching Docs/Sheets scope, verify zero content requests occur and useful errors appear.
30. Preview nested text in a disposable multi-tab Doc; confirm 12,000-character limit and no raw HTML rendering.
31. Preview a Sheet whose saved URL includes `gid` and whose tab title contains spaces or apostrophes. Confirm correct sheet tab and quoted API range.
32. Reject unbounded A1 ranges, invalid file IDs, unsaved file keys, disallowed hosts and missing API host permissions.
33. Verify no Google document or spreadsheet data reaches the ELF//SHELL core extension, an AI service, or persistent storage.
34. Confirm no sensitive Docs/Sheets scopes are requested unless selected in the Hub, and that Google warns appropriately about any account-wide read permission. Live Google OAuth remains an outstanding release gate.

## Manual BYOK text console (v0.7)

35. In the Firefox Hub and sidebar, verify the three provider choices and editable model ID.
36. Check that AI requests are blocked without explicit provider host permission and an API key.
37. Save a dummy key, verify only session storage contains it and that changing providers or pressing Forget key clears it.
38. Verify malformed model IDs, prompts longer than 6000 characters and keys with line breaks are rejected.
39. With fake provider responses, verify OpenAI/Anthropic/Gemini text extraction and HTML rendered as plain text, without executing markup.
40. Verify provider errors reveal only status categories, not the raw response body or secrets.
41. Confirm Google Workspace content is never attached to an AI prompt without separately designed explicit sharing controls. Real API-key inference and costs have **not** been tested.

## Local Morning Coffee (v0.8)

42. Confirm the Morning Coffee panel initially has no cached report and does not automatically read Calendar/Tasks.
43. With no Google OAuth token, pressing Prepare reports the missing authorization and renders no account items.
44. With a fake scoped Calendar token, verify selecting only Calendar triggers precisely one Calendar GET and zero Tasks/AI requests.
45. With Tasks permission missing, verify an honest partial/incomplete briefing and no Tasks fetch.
46. Verify Google Tasks earlier scheduled dates are **not** described as overdue deadlines, and cancelled/finished items do not appear in highlights.
47. Check source-link validation rejects untrusted hosts, port/userinfo tricks and script URLs.
48. Check an exact shared Google Docs/Sheets link is labelled as a matching **reference**, not conclusive business context.
49. Verify the external core bridge cannot start Morning Coffee or access its contents.
50. Do not claim coverage of Gmail message content, other calendars or all tasks. The user has since reported real Calendar/Tasks reads, but Gmail metadata, Docs and Sheets have no live acceptance record.

## Update Watch (v0.9)

51. Confirm no GitHub network calls occur merely by opening ELF//SHELL or the Workspace Hub; update alerts are off by default.
52. Test that enabling alerts requests the optional GitHub API host permission directly from a user gesture; denying the request keeps polling off.
53. Check daily alarms are scheduled when alerts are enabled and cancelled when disabled.
54. Verify version comparisons, stable versus preview filtering, untrusted release URL rejection, missing/private release handling and rate-limit errors.
55. Verify a newer *published* release shows badge “1” and an in-app changelog; dismiss hides only that release and preserves the saved preference across a browser reload.
56. Verify check/download are distinct: **no code/XPI download or self-install** occurs; a GitHub commit alone does not create an alert.
57. Test the compressed XPI size output and strict Mozilla lint; real AMO signing and an actual tagged release remain an external acceptance gate.

## v0.10 release and privacy acceptance

58. In a real Firefox 142+ browser, verify Google and BYOK authorization prompts include both optional API origins and explicit Mozilla data collection consent.
59. Deny the data collection component while granting the host; confirm OAuth token exchange, key storage, AI inference and Google reading are rejected.
60. Revoke optional data consent in about:addons and confirm requests fail closed even if session keys remain in memory.
61. Run `npm test`, `npm run package`, then `python3 scripts/release_preflight.py --tag v0.10.0`; confirm exact source/XPI matching, SHA-256 and `signed:false`.
62. Run the preflight with a mismatched tag and `--require-publish-ready`; both must fail until version and release gates are correct.
63. Run manual `Build release candidate (QA only)` in GitHub Actions; ensure it produces only an unsigned QA artifact, not a GitHub Release or AMO submission.
64. Independently verify Mozilla's optional privacy consent disclosures and real signed install/update before enabling publication. See `release-gates.json`.

## v0.11 manual connection diagnostics

65. Verify the model check is disabled without a saved session key and provider host/data consent. No GET should be sent without both permissions.
66. Use the mocked OpenAI, Anthropic and Gemini model metadata fixtures; ensure each sends exactly one GET to its fixed host and never sends an inference POST or prompt.
67. Verify 401, 403, 404, 429 and offline conditions return safe errors without logging provider response bodies or credentials.
68. Verify Calendar/Tasks diagnostic GETs request only the selected authorized service, with maxResults=1 and a fields filter. Do not parse or return event/list IDs.
69. Deny OAuth scope or revoke Firefox data permission and confirm the diagnostic fails without a network request.
70. In real Firefox with no keys/accounts, verify the Google test and model check buttons are disabled. Do not claim a real external connection has been tested based on the simulated suite.

## v0.12 OpenAI SSE acceptance

71. Confirm OpenAI defaults to GPT-6 Luna but saved user model IDs are preserved; no silent paid request on load.
72. Confirm effort medium, web-search permission unchecked and trace hidden by default. Click Ask only after explicit user key and Firefox data consent.
73. Test raw SSE fragmented UTF-8, CRLF, provider comments and [DONE], multi-event streams, full vs delta final answer replacement and provider reasoning summaries.
74. Verify `response.reasoning_text.*` is discarded; only provider `reasoning_summary_*` reaches the UI. If none, show 'not provided' rather than fabricated thinking.
75. Verify tool actions/timers reflect real provider output-item/search events, not invented tools or timings. Hosted web search must be separately opt-in and may have additional charges.
76. Test Stop, extension disconnect, 401/403/429/500, incomplete token limits, malformed streams, and closed stream before completion; no success on EOF alone.
77. Verify the original ELF//SHELL external bridge cannot start OpenAI streams; no API key or raw HTTP body is emitted in Port events or saved to local history.
78. Test both sidebar and Super Tab in native Firefox, without live provider credentials; real inference requires independent consent and cost-limited key acceptance.

## v0.13 OpenAI daily complimentary model groups

79. In native Firefox, confirm all 8 standard and 9 mini/nano models shown in the user's screenshot are present in two optgroups, including disabled historical shutdown models.
80. Confirm new installations default to GPT-5.4 Mini without overwriting a previously saved custom or GPT-6 model ID.
81. Confirm the enrollment checkbox is OFF by default and stays explicitly unverified, irrespective of the user's screenshot showing eligibility. Toggling only updates local extension state; it never requests provider settings changes.
82. Verify completed stream usage reports increment the correct local 250k/2.5M group by input+output tokens only. Unreported or invalid usage must never be invented.
83. Verify both local meters reset exactly at 00:00 UTC, even if the local desktop's date is different. Concurrent stream completions must not overwrite one another.
84. Check model statuses against OpenAI's current catalog, including o1/o3-mini/o4-mini shutdown; no unsupported reasoning options or hidden automatic web-search activation.
85. Confirm the UI never calls the meter an authoritative free balance and explicitly warns about shared organization-wide usage, cross-boundary fully billed requests, and excluded tool costs.

## v0.13.4 Google Desktop token exchange fix

86. Verify the Google Desktop client secret field uses `type=password`, is blank on startup, and never renders values in status or error messages.
87. Saving the matching credential must put it in Firefox `storage.session` only (never `storage.local`, GitHub, extension package or AI model payloads); clearing it must remove the pending PKCE state.
88. Preparing a new Desktop OAuth sign-in without an entered session client secret must fail closed before opening Google; a Client ID change clears any previous secret. Changing only scopes does not reuse an unrelated client ID.
89. Verify a successful mocked token exchange includes a `client_secret` matching the selected Desktop client and preserves all state/PKCE checks. No raw authorization code, verifier or secret may enter status responses.
90. Test Google HTTP 400 with `invalid_request` and `client_secret is missing`; show a **fixed sanitized error**, not the raw provider body. Test invalid-client/grant and unexpected provider errors without echoing credentials.
91. Confirm Disconnect clears the session client secret and access token, while Reset stuck sign-in does not erase an already connected token.
92. Perform a **separate** live OAuth acceptance test with an approved disposable Desktop OAuth client and minimal Calendar/Tasks scopes. Current CI is mock-only; do not approve release gates until actual token exchange succeeds.

## v0.14.0 restricted Gmail and Drive metadata previews

93. Confirm Drive and Gmail restricted scope checkboxes are initially OFF in both new and upgraded Firefox profiles; existing Calendar/Tasks OAuth selection is preserved.
94. Confirm Calendar/Tasks continue to work with the existing OAuth scopes without requesting additional metadata permissions. No Gmail/Drive network request on Hub open, login, Morning Coffee or AI send.
95. Check that Drive metadata sends one GET to `www.googleapis.com/drive/v3/files` with 20 items, explicit query/order/fields; no download, write or broad data request.
96. Confirm Gmail metadata sends a GET for max eight INBOX messages and up to eight `format=metadata` header-only GETs; NEVER pass `q` with `gmail.metadata` and never surface message bodies.
97. Deny Gmail's additional Firefox `personalCommunications` data consent and verify no Gmail API call is permitted; deny Drive host consent and verify no Drive metadata calls.
98. Test bad/revoked/expired tokens and Google HTTP 401, 403, 429; return sanitized error category with no raw provider body or credentials in the UI.
99. Check a Drive `webViewLink` pointing outside verified Google domains is dropped; never render Google text or headers through `innerHTML`.
100. Verify neither the core Ayarime bridge nor an AI model can invoke metadata reads or receive results; reconnect explicitly when adding restricted scopes.
101. Test an actual disposable Google account after separate OAuth consent; do not close live verification until Gmail/Drive respond successfully.

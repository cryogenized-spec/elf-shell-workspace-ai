# Google Workspace live-acceptance matrix — v0.14.0

Evidence review: 8 November 2026 (SAST). This is an unsigned Firefox developer preview, not a public Google-verified or Mozilla-signed add-on.

## Evidence levels

**CI verified**: mocked REST responses and unauthenticated disposable Firefox profiles; not a real-account API acceptance.
**User-reported field success**: an actual user reported the result; not yet supported by independently reviewed, sanitized run logs.
**Live unverified**: successful real-account read has not been recorded.

| Case | Service | Automated coverage | Real Firefox evidence |
| --- | --- | --- | --- |
| G00 | OAuth Desktop PKCE / token exchange | CI PASS | User-reported success following v0.13.4 |
| G01 | Calendar events read | CI PASS | User-reported success 7–8 Nov; formal record pending |
| G02 | Tasks lists read | CI PASS | User-reported success 7–8 Nov; formal record pending |
| G03 | Drive recent 20 file metadata entries | CI PASS | NOT RUN / no live evidence |
| G04 | Gmail eight inbox headers | CI PASS | NOT RUN / no live evidence |
| G05 | Docs saved-file text preview | CI PASS | NOT RUN / no live evidence |
| G06 | Sheets saved-file preview by gid | CI PASS | NOT RUN / no live evidence |
| G07 | Deny, revoke, expiry, and re-consent | CI coverage | No complete live acceptance |

Automated sources: [PR #34](https://github.com/cryogenized-spec/elf-shell-workspace-ai/pull/34), [main validation — PASS](https://github.com/cryogenized-spec/elf-shell-workspace-ai/actions/runs/42468593339), and [native Firefox CI — PASS](https://github.com/cryogenized-spec/elf-shell-workspace-ai/actions/runs/42468423712). Native Firefox CI has no authenticated Google session. [OAuth issue #15](https://github.com/cryogenized-spec/elf-shell-workspace-ai/issues/15) remains open. All release-gates.json approvals remain false.

## Linux Mint device preflight (no Google sign-in)

This is the next safe check after confirming the Firefox MCP tunnel works. From a checkout of this repository on the user's Linux Mint machine, run:

```bash
bash scripts/run-local-firefox-preflight.sh
```

The wrapper reuses the existing `~/.venvs/elfshell-firefox` Selenium virtualenv (**Selenium 4.52+**) and `/usr/bin/firefox`, runs unit tests, packages the unsigned extension, and invokes the existing `tests/native_firefox.py` suite in a **fresh isolated headless Firefox profile**. It closes that profile afterward and prints a concise PASS/FAIL summary. Override `SELENIUM_PYTHON` or `FIREFOX_BINARY` if the environment differs. An initial Selenium Manager driver download may be required on a machine that has never run it.

It does **not** authorize Google APIs, reuse an everyday Firefox profile, connect an account, run paid AI inference, or count as G03–G07 live acceptance. Any screenshot and JSON artifacts in `dist/native-firefox/` are generated from synthetic and disconnected fixture data and stay on the testing machine. Review before sharing them.

The connected Firefox DevTools MCP currently runs with the deliberately restricted `slim` preset (`pages snapshot input screenshot`), which cannot install temporary extensions. Firefox's internal `about:addons` and `about:debugging` URLs are not navigable through its standard BiDi page tool. For future **MCP-driven extension installation**, the operator must deliberately restart the tunnel's local command with the additional **`webextension`** module, while retaining the isolated profile:

```text
--tools pages snapshot input screenshot webextension
```

That option extends the browser MCP's capabilities; it is **not** enabled or changed by this repository update. The existing Selenium native suite already has a safe way to install the unsigned XPI without widening the ChatGPT tool surface.

## Live test procedure

Use a disposable Google test account, isolated Firefox profile (Firefox 142+), current v0.14.0 source loaded temporarily from about:debugging, a throwaway Doc and Sheet, and harmless test event/task/message. Never copy client secrets, authorization or callback URLs, OAuth codes/state/verifiers, tokens, personal email headers, file names, full API payloads or content into GitHub, screenshots or chat.

1. **G00 — baseline:** Verify v0.14.0 and both restricted Drive/Gmail scope checkboxes OFF by default. Hub and Morning Coffee opening must not trigger Google metadata reads.
2. **G01/G02 — existing Calendar/Tasks:** Select only Calendar and Tasks read-only, authorize Google in the extension's own Account Access UI, and use Read today's Calendar / Tasks. Record PASS/FAIL and a redacted error category only. Previous user-reported success should be independently repeated for formal sign-off.
3. **G03 — Drive metadata:** Add only the Drive metadata scope, Save, reconnect for new consent, and grant matching Firefox permissions. Click Read 20 recent Drive file names. Verify <=20 rows, no contents or writes. Record count and status, never names or URLs. Repeat with scope denied/revoked; request must be refused.
4. **G04 — Gmail metadata:** Add only the Gmail metadata scope, Save, reconnect, and consent separately to Firefox personalCommunications. Click Read 8 Gmail inbox headers. Verify <=8 header rows, no bodies/snippets/attachments/send/modify, and no forbidden Gmail q search. Record only status and count. Re-test with Firefox consent denied, then Google scope revoked; requests must be refused.
5. **G05 — Docs preview:** Enable documents.readonly separately, reauthorize, save an exact disposable Google Doc resource, click its Read preview, and verify the short test text appears in Hub only. No reading before click or without scope.
6. **G06 — Sheets preview:** Enable spreadsheets.readonly separately, reauthorize, save a disposable spreadsheet URL with a known gid, and click Read preview. Confirm intended tab, bounded default A1:Z50, and max 100 rows / 26 columns. No cell values in evidence report.
7. **G07 — lifecycle:** Verify scope changes invalidate prior authorization; revoked/expired tokens return redacted errors; Disconnect clears the session token; restart does not silently restore access; denied permissions cause zero network requests; neither external ELF//SHELL bridge nor BYOK AI can fetch Google account records.
8. **Release:** Save an evidence record from the template below after actual tests. An API read does NOT automatically approve public Google verification, OAuth restricted-scope compliance, Mozilla privacy, signing or distribution.

Enabling Google Workspace APIs in Cloud Console does not itself grant OAuth scopes. A temporary personal test is not public app authorization.

## Minimal sanitized field record

    Build: 0.14.0
    Firefox major version: [number only]
    Date (SAST): YYYY-MM-DD
    Environment: disposable account, isolated profile
    G00: PASS | FAIL | NOT RUN
    G01 Calendar: PASS | FAIL | NOT RUN
    G02 Tasks: PASS | FAIL | NOT RUN
    G03 Drive metadata: PASS | FAIL | NOT RUN
    G04 Gmail metadata: PASS | FAIL | NOT RUN
    G05 Docs: PASS | FAIL | NOT RUN
    G06 Sheets: PASS | FAIL | NOT RUN
    G07 Revocation/denial/expiry: PASS | FAIL | NOT RUN
    Error, if any: fixed safe label or HTTP status only
    Reviewer: optional GitHub handle or role

Never include account identifiers, exact client IDs or secrets, callback URLs, tokens, message subjects or file contents. A successful read closes only its own technical field-test item; release gates require separate review.

Related guidance: [OAuth](google-oauth.md), [Docs/Sheets](google-files.md), [Drive/Gmail](drive-gmail-metadata.md), [manual test suite](testing.md).

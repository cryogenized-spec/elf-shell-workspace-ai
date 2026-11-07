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

**Not yet tested on the user's Firefox installation.** CI validates syntax, key derivation and package integrity only. No Google account access is requested.

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
24. With a disposable Google OAuth project and test account, validate interactive Firefox redirect, token exchange, granular scope consent and cancellation; this **has not yet been run**.
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

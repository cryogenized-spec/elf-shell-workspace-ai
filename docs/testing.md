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

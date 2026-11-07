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

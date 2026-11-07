# Release notifications and small extension updates — v0.9 developer preview

## What the updater actually does

**Update Watch** notifies users when a newer, published GitHub **Release** exists in the official `cryogenized-spec/elf-shell-workspace-ai` repository. Users can enable daily checks, choose **Stable** or **Include previews**, check manually and dismiss the current notice. The companion displays a toolbar badge and a clear note in both the Super Tab and Ayarime sidebar.

**A push to `main` or a newly merged PR is not automatically a downloadable update.** A publisher must create a versioned GitHub Release, and separately provide a compatible **Mozilla-signed** XPI or AMO listing. The notifier checks only the released version's metadata and opens a trusted GitHub release-notes URL. It does **not** download or install an unsigned build. The current alpha may have no public Releases yet; in that case the interface says so.

The feed is `https://api.github.com/repos/cryogenized-spec/elf-shell-workspace-ai/releases?per_page=10`. Only a supported version tag and its exact trusted GitHub release URL are accepted; draft releases, malformed metadata, unrelated domains and untrusted download URLs are ignored. Only small JSON metadata is requested; no code is downloaded or executed by the checker.

## Consent and defaults

- Checks are **off by default**. Clicking **Enable daily release alerts** requests Firefox's optional `https://api.github.com/*` host permission directly from the user gesture.
- Once enabled, Firefox's `alarms` API checks roughly once every 24 hours. The user can switch off polling; no network request is made by simply opening the Hub, and the user can still manually check later if the permission is granted.
- A badge with “1” and an in-app notice indicates **a newer GitHub Release is published**, not that an update is downloaded or installed. The app never says an update was installed merely because it was published.
- **Dismiss** hides one release until a newer version is published. The user can choose Stable only or include GitHub prereleases.
- A network/rate-limit error remains a status error; it is not misreported as “fully up to date.”
- Only release version metadata, release title, limited changelog text, and the official GitHub release page URL are stored. No credentials or Google Workspace data are sent to GitHub.

## Why Firefox still needs a complete signed XPI

**Mozilla's normal WebExtension update mechanism installs an entire signed add-on package.** Code patches, remote JavaScript/CSS or self-modifying extension sources must not be used to bypass review/signing. Firefox's built-in AMO update system should be the installer; the app does not intercept the native update lifecycle to delay security updates. Firefox's native per-add-on automatic-update setting controls whether such signed updates install automatically. With this extension's update checks enabled, users still receive a reminder and release notes.

The **notification payload is incremental** (a small JSON response), but the signed code update is **not** a differential patch. We have optimized the development XPI build with ZIP compression level 9 and made CI print its actual size. This extension is already a compact JavaScript companion, so a complete signed release should be far smaller than a native desktop application.

For future large, **non-executable data** (e.g. optional wallpaper images or downloaded JSON catalogs), separately versioned content assets could be fetched individually with explicit integrity controls. Those may be incremental. Executable extension code must always be installed through Firefox's signed add-on update path.

## Mozilla documentation

- [How to update add-ons](https://support.mozilla.org/en-US/kb/how-update-add-ons) — built-in automatic/manual update settings
- [Updating your extension](https://extensionworkshop.com/documentation/manage/updating-your-extension/) — AMO and self-hosted signed extension updates
- [runtime.onUpdateAvailable](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onUpdateAvailable) — listening can defer Firefox's own update application, so this checker intentionally does not register it
- [Add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) — prohibition on remote executable code
- [WebExtensions alarms](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/alarms) — periodic scheduling

## Verification

Tests must cover untrusted release metadata, version comparison, stable versus preview channels, missing/hidden releases, unexpected network errors, opt-in host permissions, a dismissible badge, no automatic downloads, and daily alarm cancellation. Native Firefox tests check an initially disconnected checker and saved channel preference. **Actual AMO signing and first live GitHub Release notifications remain a separate publishing gate.**

## v0.10 publishing gates

A manually triggered unsigned candidate build and SHA-256 audit is available through `Build release candidate (QA only)`. This does not submit to Mozilla or publish a GitHub Release. See [Release publishing governance](release-publishing.md) for blocked live Google OAuth/BYOK tests and explicit privacy-review requirements. Mozilla's optional data collection categories now require additional user consent for Google/AI operations, separate from host access.

# ELF//SHELL — Workspace AI

An optional **Firefox Desktop** companion to [ELF//SHELL — Ayarime](https://github.com/cryogenized-spec/elf-shell-ayarime).

**Status: v0.3.0 prototype, unsigned and not released publicly.** Native Firefox CI and strict Mozilla lint have passed; signed installation and user-profile acceptance are still pending.

This companion is independent of the existing Firefox new-tab extension and does not replace its interface. The first alpha implements a native pinned **Super Tab**, a sidebar styled after the original ELF//SHELL palette, and user-initiated restoration of real Google Workspace tabs.

## Currently working in the prototype

- Toolbar command **“Ayarime, please bring up my workspace.”**
- Find or create a pinned Super Tab outside the subordinate tab group.
- Maintain a transient Firefox session tab index so redirects and initial `about:blank` navigation do not create duplicate tabs.
- Reuse open Google Workspace tabs (Gmail, Calendar, Drive, Docs, Sheets and Tasks) and create only missing tabs.
- Group Workspace tabs in Firefox and focus the master Hub.
- Create, rename and switch between up to 10 local Workspace profiles. Each has its own saved Google links and named tab group. Switching/deleting a profile never closes your tabs.
- Save a specific Google Doc/Sheet/Slides/Drive file by URL and match its stable file ID.
- Find and activate a saved resource in the same or another browser window.
- Add and remove resources without automatically closing user's tabs.
- Use the native Firefox sidebar as a companion to the real Google applications.

**Not yet implemented:** OAuth, Google API data access, AI/BYOK models, Morning Coffee, **the core-side bridge UI**, ChatGPT/Claude MCP client support, tab migration between windows, or Android. The companion-side versioned bridge can now respond to a recognized ELF//SHELL core add-on, but core 0.5.4 has not been changed. The initial extension makes **no Google API requests**.

## Install for development

Requires **Firefox Desktop 142+**.

1. Clone or download this repository's `feature/workspace-hub-alpha` branch.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Choose **Load Temporary Add-on**, and select the top-level `manifest.json`.
4. Click the Ayarime Workspace toolbar action. It should bring up the native sidebar and a pinned Workspace Hub; the Hub can restore your Google tabs on demand.
5. Open the Hub to add a named document URL. Use **↗ Open** to switch to that exact file. You can also create an empty profile in the pinned Hub and select it from the sidebar.

Temporary development add-ons may unload after Firefox restarts. A permanent Firefox install requires Mozilla-signed distribution.

## Test and package

Requires Node.js and Python 3; no npm installation is needed for this first alpha:

```sh
npm test
npm run package
```

The package script creates `dist/workspace-ai-alpha-unsigned.xpi` for development. **It is not signed and not a production download.**

See [roadmap](docs/roadmap.md), [architecture](docs/architecture.md) and [manual acceptance tests](docs/testing.md).

## Privacy

The prototype stores profile names and the Google resource names/URLs you explicitly register, alongside initial application shortcuts, in Firefox `storage.local` (not encrypted). Its required `tabs` access is used to find and activate existing browser tabs. No API keys, OAuth tokens, document contents or email messages are read or transmitted.

Read the [MPL-2.0](LICENSE) before redistribution. Icons are authored for this companion; no ELF//SHELL font files or artwork have been copied into this repository.

## Companion bridge v1 (developer preview)

The companion accepts HELLO, LIST_RESOURCES, OPEN_RESOURCE and OPEN_WORKSPACE commands from the independently installed core extension ID `elf-shell-ayarime@local.theme`. The core's existing public release does not yet send these messages; see [architecture](docs/architecture.md). Messages from other extensions and unsupported versions are rejected.

Tab IDs are also cached in Firefox `storage.session` (cleared when the browser session ends) so Ayarime can recognize tabs before Google navigation finishes. No Google account contents are collected.

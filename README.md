# ELF//SHELL — Workspace AI

Optional Firefox Desktop companion to [ELF//SHELL — Ayarime](https://github.com/cryogenized-spec/elf-shell-ayarime).

**Status:** early development — not yet a public release or Google-connected AI product.

## First milestone

A standalone native Firefox Workspace Hub and Ayarime sidebar that:
- creates/reuses a pinned master tab;
- opens, finds and activates real Google Workspace tabs (no iframes);
- groups subordinate tabs without duplication;
- saves user-defined Google resource URLs locally;
- continues functioning without API keys or Google OAuth.

One command: **“Ayarime, please bring up my workspace.”**

**Not yet implemented:** Google account authorization, data reads, AI providers, Morning Coffee briefing, MCP clients, browser-core bridge. All require separate permission and acceptance tests before release.

See [the implementation roadmap](docs/roadmap.md), [architecture](docs/architecture.md), and [test guide](docs/testing.md).

## Contributing

Source is Mozilla Public License 2.0, like the core project. We keep this add-on independent so it cannot destabilize the existing ELF//SHELL installation. Please never commit real API keys, Google tokens, correspondence, or personal Workspace data.

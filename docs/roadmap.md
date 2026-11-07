# ELF//SHELL Workspace AI — implementation roadmap

Source-of-truth staged plan (7 November 2026). Stable core must not be modified by this repository.

| Phase | Milestone | Acceptance gate |
| --- | --- | --- |
| 0 | Audit core manifest, fonts, theme, release | Compatibility recorded without core changes |
| 1 | Companion repo, packaging, tests | Independent installable extension |
| 2 | Versioned core-to-companion bridge | Sender allowlist, malformed messages rejected, graceful missing companion |
| 3 | Pinned Super Tab, restore, group, reuse | Repeated launches do not duplicate tabs; file IDs resolve |
| 4 | Ayarime native sidebar and keyboard UX | Accessible, consistent with ELF//SHELL |
| 5 | Editable personas, BYOK AI providers | Provider failover, no unsafe automatic tool writes |
| 6 | Google OAuth and REST connectors | Least scopes, account disconnect, auth/privacy compliance |
| 7 | Morning Coffee evidence-linked briefing | Sources cited; verified/probable/possible distinguished |
| 8 | Time-of-day artwork and user customization | Static/reduced motion and performance fallbacks |
| 9 | Optional MCP tool-server interoperability | Authenticated ChatGPT/Claude tool client compatibility |
| 10 | Security and accessibility hardening | Threat tests, malformed messages, no key leakage |
| 11 | Signed Firefox alpha/beta/stable | Mozilla lint, live browser acceptance, verified scopes |
| 12 | Android/CiRYVA and future services | Separate platform review |

## Product contracts

- Command: “Ayarime, please bring up my workspace.”
- No Google iframe editors. Master is a pinned extension page; Google apps are real, optionally grouped tabs.
- No duplicates; use stable document IDs over titles and recover from restarts.
- Read-only information can be summarized with user permission; sending or modifying requires separate user approval.
- Ayarime is default persona; user may customize or disable persona styling without weakening authorization policy.
- Own Google REST adapters; Google MCP catalog is not a tool ceiling.
- ChatGPT/Claude consumer subscriptions are not BYOK model endpoints; MCP client mode is a separate capability.
- Public Gmail/Drive restricted scopes require their own compliance gates; scope availability isn't guaranteed.
- Firefox desktop first; browser-only tab operations must work even when AI is offline.

## Current status

0: audited against ELF//SHELL 0.5.4 feature branch; 1/3/4: first functional prototype under development.
2/5/6/7/8/9/10/11/12: not implemented.

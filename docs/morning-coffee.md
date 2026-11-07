# Morning Coffee — local evidence-linked briefing (v0.8 alpha)

Morning Coffee is a **user-initiated, deterministic, local-only** daily briefing compiled from authorized Google Calendar and/or Google Tasks results. It does not make an AI inference call, send a message, modify a file, or request Gmail permissions.

## Experience

1. Connect a Google OAuth account with Calendar events read-only and/or Google Tasks read-only scopes (the existing live OAuth test gate still applies).
2. Open the pinned Workspace Hub or Ayarime sidebar.
3. Select Calendar, Tasks, or both. The choice applies **to this specific run only**; there is no background polling, scheduled read or automatic account access on Workspace startup.
4. Select **Ayarime, prepare my Morning Coffee**.
5. The background requests only the selected, authorized sources and builds a ranked local summary. If permission is missing, the briefing explains which source could not be read. It doesn't claim those items are absent.
6. Click **Open source** next to an item with a Google Calendar or Tasks link. Ayarime activates the existing Firefox tab for that exact safe link, or opens it in the current window.

All processing occurs inside the companion extension. The current model API key, if any, is **not consulted** and no Google content is automatically sent to a provider.

## Coverage limitations

- Calendar: the **primary** calendar, events overlapping the current **local day**, up to 30 records. The query expands recurring events via `singleEvents=true`; truncated results are noted.
- Tasks: up to five lists and 25 incomplete tasks per list. These are not all tasks across the account.
- Up to 15 highest-ranked items appear in the priority panel. The numeric totals reflect the fetched sample, not the entire account.
- Google Tasks `due` is the **scheduled date**, not necessarily a deadline. An earlier date is labelled *scheduled before today — review*, never an asserted late/overdue obligation.
- The ranking is a deterministic heuristic: near-term meetings and tasks scheduled today/earlier receive attention first. It does not estimate real business importance.
- No Gmail, Drive-wide search, Docs/Sheets file content, third-party MCP data, or paid AI reasoning is included.

## Evidence and cross-references

The Calendar API exposes an event's `htmlLink` and the Tasks API may expose `webViewLink`. Only a tightly checked HTTPS URL for the corresponding Google application is allowed as a navigation target, with exact hostname checks. Source descriptions and task notes may contain Google Docs or Sheets links, but we extract **only file IDs** locally for matching; those notes are not returned in the briefing.

When two visible items explicitly reference the **same Google file ID**, the UI says *Shared Google file reference* and states that this **does not prove they belong to the same project**. No keyword similarity or AI-inferred association is presented as fact.

References: [Calendar events](https://developers.google.com/workspace/calendar/api/v3/reference/events), [Google Tasks resource](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks).

## Privacy and failure handling

- Only an explicit same-extension `MORNING_COFFEE_PREPARE` request initiates Google reads.
- The versioned external ELF//SHELL core messaging bridge does **not** expose a briefing or account-data command.
- The source snapshot, derived ranking and relation list are returned to the calling UI; **nothing is persisted** to local storage or Google.
- UI content is created via `textContent`, never injected as untrusted HTML.
- Calendar and Tasks are read separately; one failed service can produce an honest partial briefing if the other succeeds.
- All Google API reads remain GET-only. There are no account writes, automated browser interactions beyond an explicit safe source-link click, or paid AI calls.

## Acceptance gates

Mocked tests cover missing scopes, expired tokens, selected-source-only network calls, no AI integration, safe source navigation, cancelled events, completed tasks, shared file-reference correlation, and date semantics. Real Firefox acceptance checks that the panel starts empty and stays empty when authorization is missing.

Live Google OAuth authorization and real data retrieval are **still not verified**. Production release and broader Morning Coffee functionality (Gmail, per-user priorities, deeper evidence-linking, optional AI synthesis with per-run explicit sharing) remain future work.

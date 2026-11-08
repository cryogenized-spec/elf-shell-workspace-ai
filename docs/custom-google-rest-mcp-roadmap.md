# ELF//SHELL Workspace AI — Own Google Workspace REST MCP delivery plan

**Reconciled:** 8 November 2026, from the original 7 November 2026 roadmap, current `main` v0.14.0 and confirmed HP OMEN Firefox 159.0 device acceptance.

**Architectural decision:** **Build and maintain our own per-application Google Workspace tools on the Google REST APIs. Do not depend on, proxy, or restrict our operation set to Google's official MCP servers.** Use the Model Context Protocol as one optional access layer to those tools. Preserve the standalone Firefox/BYOK companion and the stable ELF//SHELL core.

## A. What is actually complete, partial, absent

| Component | Code state | What is established | Remaining engineering |
| --- | --- | --- | --- |
| Firefox Hub / tab orchestration | Implemented; native checked | Pinned master, profiles, six Workspace shortcuts, group/activate/reuse | UX/accessibility/final signed install |
| Core extension bridge | Implemented in two-extension development integration | Validated versioned sender and open/list commands | Release-compatible signed core rollout |
| Personas | Implemented | Ayarime/professional/custom and reset | Better settings/polish |
| BYOK provider interface | Partial | OpenAI/Anthropic/Gemini text; OpenAI streaming; optional model checks | Live provider authorization, agent tool-calling executor, approval UI, budgets |
| Google OAuth | Partial | Desktop PKCE, session-only secret/token, disconnect and per-scope consent | Public onboarding, scopes for writes, durable MCP-specific OAuth boundary, live expiry/revocation checks |
| Calendar | Read-only slice | Today's primary-calendar events and status | Full dedicated read/write tool set |
| Tasks | Read-only slice | Task lists/incomplete tasks and Morning Coffee | Full dedicated read/write tool set |
| Docs | Read-only preview | Saved document, bounded text | Search/select, create and batchUpdate-derived typed tools |
| Sheets | Read-only preview | Selected gid + bounded range | Full read/write/format/chart tools |
| Drive | Restricted metadata slice | First 20 file metadata, separately consented | Per-file picker, metadata/search, content/export, write/share tools |
| Gmail | Restricted metadata slice | Up to eight headers, separately consented | Thread/message/draft/label tools; sending and body scopes separately gated |
| Slides | Saved links only | Browser tab navigation | Full presentation REST adapter |
| Own Google MCP server | **Not built** | Planned interoperability only | MCP protocol server, per-service registries, authenticated transport, Google OAuth, policy executor |
| Morning Coffee | Partial | Local explicit Calendar/Tasks deterministic brief | Cross-service evidence connectors and opt-in AI synthesis |
| Release | Not approved | CI + on-device 122 Node / 42 Firefox checks passed | Google verification, privacy review, Mozilla signing and upgrade |

**Correctness:** Native tests are disconnected/simulated Google tests. Previous Calendar/Tasks live success was reported by the operator; do not convert that report into full OAuth/signing/restricted-scope approval. `release-gates.json` remains all false.

**Implementation divergence from original proposal:** current UI/backend are plain JavaScript/HTML rather than TypeScript/Preact; this is not a blocker to introducing strongly validated MCP tool schemas. Do not initiate a framework rewrite before functional connectors exist.

## B. Correct architecture and ownership boundaries

```text
ChatGPT / Claude ──> Our authenticated Google Workspace MCP
                         │ tools/list + tools/call
                         ▼
                    Tool registry
      [Tasks] [Calendar] [Drive] [Docs] [Sheets] [Gmail] [Slides]
                         │
                  Policy / approval layer
              account + per-tool scope checks
              bounded queries and safe writes
                         │
                 OUR Google REST adapters
                         │
                    Google APIs

Firefox ELF//SHELL Workspace AI ─> its own UI and secure Google connector
                                └> may reuse validated tool contracts/adapters
                                    (not dependent on official Google MCP)
```

- Build an independently deployable `mcp/` service in this repository, isolated from the existing Firefox add-on and core theme. Initially support a secure local stdio/tunnel development transport; provide authenticated remote Streamable HTTP for hosted ChatGPT/Claude registration when deployment requirements are satisfied. A local source checkout is *not* required for ordinary Firefox use.
- Each application has its **own module and explicit named tool per function**. Never replace the catalogue with a giant generic `google_request` or `execute_operation` tool, and never hide functions behind compact/dynamic catalog tricks.
- Shared API contracts, identity/account selection, input validation, pagination, quotas, structured errors, retry policy, telemetry minimization and approved operation descriptions; dedicated adapter code owns all real Google REST URLs.
- Keep MCP Google OAuth independent of browser identity OAuth unless a secure, deliberately designed consent broker is introduced. The MCP client's authentication to *our service* is separate from the user's consent to Google API scopes. No API tokens or client secrets in tool arguments, model outputs, repositories or logging.
- Read operations are selectable after Google authorization. Mutating tools require separate write scopes and explicit user-origin approval outside model-provided arguments; preview target and consequence, enforce allowlists, idempotency/concurrency guards, and deny-by-default destructive actions.
- Retrieved emails, files and calendar descriptions are data, never instructions. No automatic forwarding of Workspace content to a BYOK AI model. Scope expansion must be initiated in context by the user.
- MCP is **not** the inference model. Firefox BYOK stays usable without any remote MCP connection. The stable ELF//SHELL theme must remain compatible without the companion.

## C. Dedicated per-application MCP tool inventory

Tools below are *planned*, not implemented. `R` means a read operation, `W` changes account data after authorization, `D` is destructive or sharing-sensitive and requires stronger confirmation.

### C1 — Google Tasks (first full vertical slice)

| R | W / D |
| --- | --- |
| `tasks_list_tasklists`; `tasks_get_tasklist`; `tasks_list_tasks`; `tasks_get_task` | `tasks_create_tasklist` (W); `tasks_update_tasklist` (W); `tasks_delete_tasklist` (D); `tasks_create_task` (W); `tasks_update_task` (W); `tasks_complete_task` (W, typed patch); `tasks_move_task` (W); `tasks_delete_task` (D); `tasks_clear_completed` (D) |

Google's Tasks API has tasklists and tasks REST resources with list/get/insert/patch/update/delete, plus move/clear for tasks. Respect pagination, `showAssigned` semantics and Tasks' date-only due-date limitations. Sources: https://developers.google.com/workspace/tasks/reference/rest and https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/list .

### C2 — Google Calendar

| R | W / D |
| --- | --- |
| `calendar_list_calendars`; `calendar_get_calendar`; `calendar_list_events`; `calendar_get_event`; `calendar_list_event_instances`; `calendar_check_freebusy` | `calendar_create_event` (W); `calendar_update_event` (W); `calendar_delete_event` (D); `calendar_create_calendar` (W); `calendar_update_calendar` (W) |

Separate event/time-zone handling, recurring instances, calendar ownership, invitation/attendee changes and external notification effects.

### C3 — Google Drive

| R | W / D |
| --- | --- |
| `drive_list_files`; `drive_get_file_metadata`; `drive_download_file`; `drive_export_file`; `drive_list_permissions`; `drive_list_revisions`; `drive_list_changes` | `drive_create_file` (W); `drive_copy_file` (W); `drive_update_file` (W); `drive_move_file` (W); `drive_trash_file` (D); `drive_delete_file` (D); `drive_create_permission` (D); `drive_update_permission` (D); `drive_delete_permission` (D) |

Use `drive.file` and a user-selected file via the official Picker where practical. **Pasting a Drive URL does not grant the app access.** Broad metadata/read/write scopes are restricted and gated on appropriate review. Source: https://developers.google.com/workspace/drive/api/guides/api-specific-auth .

### C4 — Google Docs

| R | W / D |
| --- | --- |
| `docs_get_document`; `docs_get_document_structure` | `docs_create_document` (W); `docs_insert_text` (W); `docs_replace_text` (W); `docs_delete_range` (D); `docs_apply_text_style` (W); `docs_apply_paragraph_style` (W); `docs_insert_table` (W); `docs_edit_table` (W) |

Implement typed transformations mapped to Docs `documents.batchUpdate`, with revision/write controls and preflight previews. No arbitrary unrestricted raw `batchUpdate` tool exposed to agents in the initial release. Source: https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate .

### C5 — Google Sheets

| R | W / D |
| --- | --- |
| `sheets_get_spreadsheet`; `sheets_get_values`; `sheets_batch_get_values`; `sheets_get_formulas` | `sheets_update_values` (W); `sheets_append_values` (W); `sheets_batch_update_values` (W); `sheets_clear_values` (D); `sheets_add_tab` (W); `sheets_rename_tab` (W); `sheets_delete_tab` (D); `sheets_format_cells` (W); `sheets_sort_range` (W); `sheets_find_replace` (W); `sheets_create_chart` (W); `sheets_update_chart` (W) |

Preserve gid to tab resolution, explicit A1 ranges, value modes (RAW vs USER_ENTERED), formulas, quoting, shape limits, protected ranges, concurrent edits and batch size caps. Source: https://developers.google.com/workspace/sheets/api/reference/rest .

### C6 — Gmail (restricted-scope gated)

| R | W / D |
| --- | --- |
| `gmail_list_messages`; `gmail_get_message`; `gmail_list_threads`; `gmail_get_thread`; `gmail_list_labels`; `gmail_list_drafts`; `gmail_get_attachment` | `gmail_create_draft` (W); `gmail_update_draft` (W); `gmail_send_draft` (D); `gmail_send_message` (D); `gmail_create_label` (W); `gmail_modify_labels` (W); `gmail_trash_message` (D); `gmail_untrash_message` (W); `gmail_delete_message` (D) |

Separate metadata-only from body/attachments scopes; `gmail.metadata` cannot use certain search query parameters. Mail send/share/delete always needs an explicit approval with recipient preview and identity. Do not enable broad Gmail scopes for public use until allowed use-case and verification requirements are met. Sources: https://developers.google.com/workspace/gmail/api/auth/scopes and https://developers.google.com/workspace/workspace-api-user-data-developer-policy .

### C7 — Google Slides

| R | W / D |
| --- | --- |
| `slides_get_presentation`; `slides_get_slide`; `slides_get_thumbnail` | `slides_create_presentation` (W); `slides_create_slide` (W); `slides_delete_slide` (D); `slides_insert_text` (W); `slides_replace_text` (W); `slides_insert_shape` (W); `slides_insert_image` (W); `slides_update_text_style` (W) |

Typed operations are translated into Slides `presentations.batchUpdate`, with object IDs and write controls. Source: https://developers.google.com/workspace/slides/api/reference/rest .

### C8 — Later Workspace applications (scoped backlog)

- **People / Contacts:** `contacts_list_contacts`, `contacts_search_contacts`, `contacts_get_contact`, `contacts_create_contact`, `contacts_update_contact`, `contacts_delete_contact`.
- **Forms:** `forms_get_form`, `forms_get_response`, `forms_list_responses`, `forms_create_form`, `forms_update_form`.
- **Google Chat:** `chat_list_spaces`, `chat_list_messages`, `chat_get_message`, `chat_create_message`, `chat_update_message`, `chat_delete_message` (eligible accounts/roles only).
- **Meet:** `meet_create_space`, `meet_get_space`, `meet_get_conference_record`, `meet_list_recordings` where available.
- **Classroom / admin / Keep:** only after API eligibility, user demand, scopes and applicable domain administration are established. Do not promise unrestricted personal-account support.

## D. Actual execution order — deliver features before repeating general audits

| Milestone | Implement and ship | Demonstrable completion |
| --- | --- | --- |
| **M0 — baseline (DONE)** | Firefox Hub/bridge/BYOK foundations, OAuth preview, on-device native check | Current 0.14.0 code + 122 Node/42 native Firefox PASS |
| **M1 — own MCP core (NEXT)** | `mcp/` package, `tools/list` + `tools/call`, strict per-tool schema registry, authenticated transport boundary, Google session adapter, access policy, structured errors | Client discovers explicit named tools and can invoke a harmless mocked Tasks read; no secret/tool argument leakage |
| **M2 — Tasks full service** | Tasks 13-tool inventory (read, create, update, move, complete, delete, tasklists); per-action approval on writes | Authorized Tasks list/read and create/update/delete work against a disposable account; refusal stops writes |
| **M3 — Calendar full service** | Calendars, events, freebusy, recurring instances, create/update/delete | Agent can list a date range, create one test event with approval and remove it with approval |
| **M4 — Drive and file chooser** | Per-file Picker grant, search/list/get/download/export, metadata and controlled file sharing | Selected file can be discovered/read; unknown unselected file is denied; sharing requires approval |
| **M5 — Docs and Sheets** | Explicit Docs editing operations and Sheets read/write/formula/format/chart tools | Agent edits a disposable Doc and a Sheet by ID/gid and returns before/after change summary |
| **M6 — Gmail and Slides** | Gmail conversations/drafts/labels/approved sends, Slides presentations/slide edits | Test-account draft and slide work; no send without approval and no body reads without approved scope |
| **M7 — Ayarime agent orchestration** | Tool-calling adapters to BYOK; approval queue, evidence citations, tool execution trace, retries and per-provider budgets | A natural-language request calls the correct dedicated Google tool and explains exact source/action |
| **M8 — Cross-Workspace Morning Coffee** | User-selected Calendar/Tasks + authorized Drive/Docs/Sheets + optional Gmail/Slides sources; verified/probable/possible links | Agent cites source IDs and links, distinguishes inferred relationships and never silently writes |
| **M9 — distribution & verification** | MCP connector authorization and deployment, Firefox signed builds, OAuth security/privacy/revocation, staged release | Authenticated ChatGPT/Claude MCP connection and signed Firefox installation; scope-specific release gates approved only on evidence |

**Delivery rhythm:** implement one functioning service slice at a time: contracts → adapter → MCP tool → agent invocation → targeted tests → PR merge. Do not hold all implementation behind one giant cross-project test plan. Milestone demos are required; repetitive infrastructure tests are automated and not a substitute for features.

**Immediate next PR, not another planning iteration:** create `mcp/` tool server skeleton with first explicit `tasks_list_tasklists`, `tasks_list_tasks`, `tasks_get_task`, `tasks_create_task` routes, secure account selection and write approval boundary; then extend Tasks through M2. This must be our code, not a Google official MCP proxy.

## E. Release safety and acceptance rules

1. **One tool means one function.** Strong input/output schemas, per-app prefixes and distinct write risk. No generic REST proxy and no forced compact/dynamic tool catalogue.
2. **MCP auth is not Google OAuth.** Authenticate the MCP client to the server; separately authorize each user's Google account and scope. Never ask for API tokens in ChatGPT tool arguments.
3. **Read ≠ write.** A token permitting writes is not consent to any particular mutation. Use host-controlled approval or out-of-band confirmation, not a model-generated `confirmed:true` flag.
4. **Minimize Google data.** Page caps and bounded fields; no message bodies, file content or other sensitive records in CI logs or GitHub issues. Respect Google's restricted-scope verification and security obligations.
5. **Small provider-specific API adapters.** No invented methods: map every exported tool to a documented Google REST operation and account for unsupported restrictions.
6. **Keep the desktop out of the delivery dependency.** Source remains in GitHub; browser development builds and agent MCP deployment are separate. The Selenium clone was only for validating a real Firefox installation.
7. **Never equate CI PASS with live OAuth or public approval.** The public Firefox/Google release stays gated; private per-scope user testing can proceed without pretending the product is publicly verified.

## F. References and source of truth

- Original proposal: `ELF-SHELL-Workspace-AI-Roadmap.md`, 7 November 2026, which explicitly commits to self-maintained REST connectors and optional MCP interoperability.
- Current application: `README.md`, `background.js`, `google/{oauth,session,read,files,catalog}.js`, `manifest.json`, `tests/native_firefox.py`, `release-gates.json`.
- [Google Tasks REST](https://developers.google.com/workspace/tasks/reference/rest), [Docs REST](https://developers.google.com/workspace/docs/api/reference/rest), [Sheets REST](https://developers.google.com/workspace/sheets/api/reference/rest), [Slides REST](https://developers.google.com/workspace/slides/api/reference/rest), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [Google Workspace data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy), [MCP tools protocol](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).

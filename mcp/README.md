# ELF//SHELL — Our Google Workspace REST MCP (development preview)

This package is **our own Google REST API connector**, exposed through the official MCP TypeScript **v2** server SDK. It is **not** Google's official MCP server. The Firefox Workspace AI companion remains independent.

## M1 tool registry

| Tool | REST API | Permission |
| --- | --- | --- |
| `tasks_list_tasklists` | `GET /tasks/v1/users/@me/lists` | `tasks.readonly` or `tasks` |
| `tasks_list_tasks` | `GET /tasks/v1/lists/{id}/tasks` | `tasks.readonly` or `tasks` |
| `tasks_get_task` | `GET /tasks/v1/lists/{id}/tasks/{task}` | `tasks.readonly` or `tasks` |
| `tasks_create_task` | `POST /tasks/v1/lists/{id}/tasks` | `tasks` plus exact one-use local approval |

Every call has its own validated input schema and bounded data projection. The MCP interface exposes no generic request executor, token accessor, or approval-issuance tool. Task due dates are **scheduled days, not automatically deadlines**.

## Local development (Node 20+)

```bash
cd mcp
npm install
npm test
```

For a **temporary, authorized disposable Google Tasks test account only**, the standalone stdio server accepts a short-lived OAuth access token from the local *process environment*; it **does not perform or complete OAuth** yet:

```bash
export ELFSHELL_GOOGLE_ACCOUNT=default
export ELFSHELL_GOOGLE_ACCESS_TOKEN='REPLACE_LOCALLY_WITH_SHORT_LIVED_TOKEN'
export ELFSHELL_GOOGLE_SCOPES='https://www.googleapis.com/auth/tasks.readonly'
export ELFSHELL_GOOGLE_TOKEN_EXPIRES_AT='2026-11-09T20:00:00Z'
npm start
```

The expiry must be a **future actual token expiry**. Do not paste credentials, OAuth callback URLs or personal Tasks into ChatGPT, shell history, GitHub or issue comments. Prefer using your shell's secure credential input/secrets manager rather than copying the example literally; remove tokens from the environment on completion. The single-account environment adapter is **development scaffolding**, not a production credential store.

For an authorized create operation, start the server with the real `https://www.googleapis.com/auth/tasks` scope. In a **separate interactive local terminal**, the operator must independently approve the exact account, list, title, notes and scheduled day:

```bash
node mcp/src/approve-task.js --account default --tasklist 'TEST_LIST_ID' --title 'Disposable QA task'
```

Type `APPROVE` in that terminal to issue a one-use approval lasting two minutes. **No MCP tool can generate this approval.** A matching `tasks_create_task` call must then be issued before it expires. Changes to any approved field are denied. The approval directory is restricted to the current OS user; this is a local development approval mechanism, **not an authenticated remote approval service**.

## What is deliberately NOT delivered in M1

- Public Google OAuth onboarding, account refresh-token broker, multi-account authorization and production credential rotation.
- Hosted Streamable HTTP MCP endpoint / cloud ChatGPT custom-connector registration.
- Unrestricted Google data, Gmail/Drive restricted permissions, write access without independent approval.
- Tasks updates/deletion, or the dedicated Calendar/Drive/Docs/Sheets/Gmail/Slides tool catalogues (M2–M6).
- Any change to the browser extension's Google permissions, standalone BYOK mode, or release approval gates.

**M1 is a real, usable _local_ protocol and REST vertical slice for developers, not a publicly deployed connector.** Before remote ChatGPT registration, add an independently secured remote transport, authenticate the MCP client, implement Google OAuth with per-user scoped token storage, and replace the local approval file with a trusted out-of-band confirmation flow. Do not expose this local development server to the internet.

## Evidence

`npm test` validates Google's specific endpoints, exact tool discovery over a real stdio MCP handshake, read/write scope enforcement, bounded outputs, denied unapproved writes, approved test-task creation (mock Google REST), expired approvals and replay refusal. No actual Google account data or live billable requests occur in CI.

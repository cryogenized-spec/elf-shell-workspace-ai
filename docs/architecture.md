# Architecture — first alpha

This is an independent Firefox MV3 extension. The base ELF//SHELL 0.5.4 source remains untouched.

- Native toolbar click: synchronous sidebar.open() on the user gesture; background then executes workspace restoration.
- Firefox background event page owns serialized tab operations and locally stored resource definitions.
- Pinned `hub.html` master stays outside the Firefox tab group.
- Google applications are real Firefox tabs, never iframes.
- Resource matching prioritizes stable Google file IDs; default app landing pages are matched by application URL.
- Existing matching tabs are reused across normal windows, but tabs from another window are **not moved automatically**.
- Stored resource links are visible and editable, not secret; the browser storage API is not an encryption system.
- No Google REST API, OAuth token, AI model endpoint, MCP bridge, user email, or hidden network access is present in this alpha.

## Messaging contract

The internal extension accepts only: `GET_STATE`, `OPEN_WORKSPACE`, `OPEN_RESOURCE`, `SAVE_RESOURCE`, and `REMOVE_RESOURCE`. Requests are rejected unless sent from the same extension ID. The core ELF//SHELL companion bridge is intentionally **not enabled** yet; use Firefox toolbar/sidebar until a versioned external sender allowlist has been reviewed.

## Planned next steps

Native UI accessibility and live Firefox acceptance, versioned bridge with ID `elf-shell-ayarime@local.theme`, editable workspace profiles, opt-in Google OAuth/PKCE, native REST connectors, BYOK providers, opt-in evidence-linked Morning Coffee, and optional remote/local MCP interoperability.

Do not enable Gmail restricted scopes before completing the relevant Google app verification process.

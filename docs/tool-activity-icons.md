# Tool activity icons — source-backed and safe

Status: unsigned developer preview, PR staged on the reasoning display branch.

## The UI

When OpenAI Responses emits a genuine tool lifecycle event, the accompanying activity entry now displays a **29px circular tool badge**. Web search, file search, code interpreter, computer, image generation, shell, function and MCP categories use distinct abstract glyphs. Unknown categories receive a neutral fallback.

The timer remains a measured duration, stopping on completion. No badge appears merely because the model mentions an app in its response text. Only actual tool events produce tool rows. A short allowlisted tool type travels from the background to the UI, which chooses the local symbol; remote image URLs, executable SVG, or dynamic HTML are not accepted. Firefox's current self-only image policy is unchanged.

## Real vendor logo sources

**MCP icons metadata:** A modern MCP server may expose optional tool or server icons with a source URI, MIME type and size. OpenAI SSE tool events do not guarantee that this metadata is forwarded. Before displaying logos, the companion needs a trusted registry linking an authorized MCP server and exact tool name to its vetted icon. Do not fetch arbitrary untrusted remote images.

**Google Drive files.iconLink:** Drive v3 may return a static unauthenticated icon URL for an individual Google Drive file. That identifies file type; it is not a general-purpose tool-call logo. Use it in an authorized Drive file UI, with appropriate image URL validation.

**Approved application artwork:** A vendor logo can be bundled locally after verifying the official, current asset and applicable branding permissions. Google updated Google Workspace product icons in May 2026. The current abstract glyphs do not claim to be official Google Docs, Gmail or Sheets artwork.

Until authenticated tool identity and approved assets are available, an MCP call displays the generic MCP badge rather than an invented Google logo. Future mappings should be keyed on a verified server identity and exact tool ID, never arbitrary generated prose.

## Verification

Unit tests cover real-event tool type propagation, circular badge construction, category fallback, accessibility and the absence of third-party image URLs. The existing timer and no-fabricated-activity rules remain. Native Firefox and dual-extension acceptance remain release gates.

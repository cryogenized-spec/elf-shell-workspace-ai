# ELF//SHELL — provider-exposed reasoning display

**Developer preview, not signed or merged.**

Ayarime's streaming panel uses an LM Arena-inspired experience: a quiet *Thinking…* header with an elapsed timer, streaming provider-reported reasoning summaries in an expandable text area, a separate collapsible model-activity timeline, and final answer text outside the reasoning panel. The reasoning pane collapses automatically once the answer starts unless the user expanded it manually. The completed header reflects elapsed time, while reasoning tokens appear only if the provider reports a count.

## Transparency and provider contracts

OpenAI Responses may supply `response.reasoning_summary_text.delta`, `response.reasoning_summary_text.done` and `response.reasoning_summary_part.done`. These are **provider-generated summaries**, not the model's private, unfiltered chain of thought. Some model/provider combinations return no summary. The UI then says so, showing only measured activity and time; it must not invent steps or convert raw hidden `response.reasoning_text.*` events into visible text. The current OpenAI event adapter deliberately discards private raw reasoning events.

Reported `output_tokens_details.reasoning_tokens` are displayed as **usage counts**, not inferred readable words. Activity rows only represent genuine API lifecycle/tool events. Tool calls cannot be executed or simulated by the visual renderer.

The frontend asks for `reasoning:{effort,summary:"auto"}` unless effort is None. It may be ignored or unsupported by some models. No UI wording guarantees that summaries will be returned.

## Output cap and potential cost

Previously the OpenAI stream had a fixed `max_output_tokens:768`. In reasoning-heavy tasks this may leave little space for both reasoning tokens and final output. Ayarime now exposes a **per-request maximum**: 768 (default), 2048 and 4096 tokens. The extension validates this allowlist in its background/API adapter; larger budgets are never silently selected. These values are maximums, **not requested spend**, and real usage/billing depend on model and account. Use 768 for economy; choose a higher value consciously for longer tasks. Existing OpenAI web-search consent remains separate and off by default.

## UX boundaries

The display is stream-backed, not a fake typewriter animation. Summary text is sanitized through text nodes with a small, safe Markdown-style renderer; script or HTML emitted by a provider cannot execute. Live rendering is coalesced to one animation frame where supported, avoiding a complete parse on every tiny SSE token. The progress indicator respects `prefers-reduced-motion`.

The text UI is currently implemented for OpenAI Responses streaming; Anthropic and Gemini still use their existing one-shot reply adapters. A future dedicated provider-specific streaming adapter can expose *provider-authorized* Anthropic `thinking_delta` or Gemini thinking summaries when available; raw CoT availability must not be assumed.

## Verification

Unit tests check budget enforcement, honest no-summary states, provider summary delta streaming, no forwarding of OpenAI raw reasoning text, real token usage, first-answer collapse with explicit user override, and no fake tool activity. Native Firefox tests inspect the actual Hub rendering and its safe defaults; paired Firefox acceptance checks that the new UI does not disrupt the independent ELF//SHELL command bridge. Real paid-provider API acceptance is still required before publication.

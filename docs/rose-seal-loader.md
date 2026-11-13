# Ayarime Rose Seal — original animated loader

**Status:** development preview, no signed release or live API call required for its animation.

## Identity and source

The original, locally bundled SVG rose outline lives at `icons/ayarime-rose-outline.svg`. Four 2×2 tiles display its separate quadrants as pieces of one complete emblem. A faint full-rose spirit image becomes visible only while the tiles open, so the seal can complete a 360-degree flip without magically rebuilding a missing quadrant.

The vector and four colour accents use Ayarime's late-1990s OVA-inspired indigo, violet, pink and cyan visual language. The sparkles introduce a rare pale-gold highlight. No remote assets, imported icon fonts or Canvas rendering are involved.

## Animation

A tile cycle lasts **3.8 seconds**. The four tiles open on staggered hinges in the fixed sequence **right → down → left → up**, then return **up → left → down → right**. During the open moment, the luminous rose outline performs a full revolution.

Two successive cycles form the complete **7.6-second** loop. On the first cycle the rose rotates **-360° around the X axis**; on the second it rotates **+360° around the Y axis**. The assembled seal flickers softly as the tiles return. Cyan, violet, rose-pink and pale-gold crosses sparkle intermittently with offset phases.

The animation plays only in the AI streaming panel's `connecting`, `thinking` and `answering` stages; terminal states show the assembled, still seal. A Firefox reduced-motion preference disables all tile movement, spins, glows and sparkles, leaving a complete static 2×2 rose.

## Interaction and performance

This is a working CSS + vector animation, **not an animated GIF or frame sequence**. Transform/opacity keyframes allow smooth motion while avoiding JavaScript animation loops. The streaming timer is separate and remains accurate as before. The figure is decorative, with `aria-hidden=true` because the adjacent live text already announces `Thinking…`, `Responding…` and completion. This prevents redundant screen-reader chatter.

The asset is whitelisted in the unsigned Firefox extension package. Native Firefox acceptance checks that the rose loads locally and computed styles contain the expected four folding animations and alternating axes, without sending any model request or charging an API key.

## Future placement

This component is presently mounted in the **Workspace AI Hub and native sidebar**, where genuine AI processing happens. It can later be reused in the main ELF//SHELL new-tab Station for explicit loading workflows, but should not spin idly when the station has nothing to load. Keep the rose itself and its accent colours coordinated with the established Ayarime artwork; do not substitute unrelated generic elf branding.

# HERO.md: Home hero spec

Written by Jenny, Sun 18 Oct 2026, from the showcase plan Nathan asked for. Nathan can change any of this at the Phase 0 review. Dollar builds the hero only from this file.

## Concept: the machined die

A single 34 die, machined from dark graphite metal with brushed-silver edges, floating in a dark industrial space. It is the one object the whole Home page is built around.

## Object
- Rounded cube, slightly chamfered edges catching a cool silver rim light. Materials: PBR graphite (metalness high, roughness 0.35–0.5) with brushed-silver bevels.
- Faces carry engraved symbols, not pips: one per service (Web design, Marketing, Workflow automation) plus the "34" mark.
- The two remaining faces are stamped, never lit (D15, Nathan 24 Oct — no blank metal): the "34 / AUTOMATION" wordmark (Chakra Petch, its one permitted use) and "BUILD FIRST" (Space Grotesk; wording awaiting Nathan's confirmation on the preview).
- Engravings glow faintly in Spark (`#F2F5FA`) when their face is active, and the glow spreads across the engraving in a direction that says what the face means (D15): the web-design window paints in from the top, the marketing signal radiates outward, the automation flow travels through its nodes, the 34 warms from its centre. At full glow each face is exactly its still.
- A small machined caption under the die names the face that is showing (D18, Nathan 24 Oct) — the site's own service names, fading with the face's glow; aria-hidden, since the panels and headings carry the same names.
- **No gold on the die.** Gold is reserved for the "34" in the wordmark (brand playbook).

## Motion
- Arrival (0–1.5 s, after first paint): the die resolves out of black as the rim light sweeps across it. No bounce, no spin-up; it should feel heavy and precise.
- Scroll, Hero section: the camera dollies a slow half-orbit round the die. The die itself barely moves.
- Scroll, Services section (pinned): each scroll step rolls the die a quarter-turn to the next service face, eased like a machined part seating into place. The matching text panel slides in beside it.
- Idle: very slow drift (under 2° per second) so the light keeps moving across the metal.
- Pointer (desktop only): the die tilts up to 4° toward the cursor.

## Look
- Background: Graphite `#0C0E11` with a faint radial falloff and fine film grain.
- Light: one cool key, one silver rim, a soft environment for reflections. Subtle bloom on the Spark engravings only (High tier).
- Text sits left on desktop, below the die on mobile. Headline copy is [PLACEHOLDER] until Nathan supplies it.

## Fallbacks
- Mid tier: no bloom or grain; pixel ratio capped at 1.5.
- Low tier and `prefers-reduced-motion`: a pre-rendered still of the die (AVIF + JPG, rendered from the real scene), no orbit, face changes as a crossfade.
- No WebGL: same as Low tier.

## Never
- Cartoony, low-poly, bubbly or toy-like rendering.
- Dice pips, casino or gambling cues.
- Gold anywhere on the object.

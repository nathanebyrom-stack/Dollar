# HERO.md: Home hero spec

Written by Jenny, Sun 18 Oct 2026, from the showcase plan Nathan asked for. Amended by Jenny, 2 Nov 2026, to site plan v4 and the v4.1 brand reconciliation (§7.3); where this file and a ticket differ, the ticket wins. Nathan can change any of this at the Phase 0 review. Dollar builds the hero only from this file.

## Concept: the machined die

A single 34 die, machined from dark graphite metal with brushed-silver edges, floating in a dark industrial space. It is the one object the whole Home page is built around.

## Object
- Rounded cube, slightly chamfered edges catching a cool silver rim light. Materials: PBR graphite (metalness high, roughness 0.35–0.5) with brushed-silver bevels.
- Faces carry engraved symbols, not pips: one per v4 build (Website overhaul, Product animation, Operational automation) plus the "34" mark.
- The two remaining faces are stamped, never lit (D15, Nathan 24 Oct — no blank metal): the "34 / AUTOMATION" wordmark (Archivo Expanded 800) and "BUILD FIRST" in Archivo Expanded ([CONFIRM: Q8]; if not confirmed, the bare "34" mark).
- Engravings glow faintly in Silver (`#D4D8DD`) when their face is active ([CONFIRM: gold glow on the active face]), and the glow spreads across the engraving in a direction that says what the face means (D15): the website window paints in from the top, the product-animation orbit sweeps round its cube, the automation flow travels through its nodes, the 34 warms from its centre. At full glow each face is exactly its still.
- A small machined caption under the die names the face that is showing (D18, Nathan 24 Oct) — the site's own service names, fading with the face's glow; aria-hidden, since the panels and headings carry the same names.
- **No gold material and no gold gradient on the die.** Gold appears only as light: one warm kicker highlight, the neural sparks, and (if Nathan confirms) the active engraving.

## Motion
- Arrival (0–1.5 s, after first paint): the die resolves out of black as the rim light sweeps across it. No bounce, no spin-up; it should feel heavy and precise.
- Scroll, Hero section: the camera dollies a slow half-orbit round the die. The die itself barely moves.
- Scroll, Services section (pinned): each scroll step rolls the die a quarter-turn to the next service face, eased like a machined part seating into place. The matching text panel slides in beside it.
- The swarm (D19 stage two, Nathan 24 Oct): during each roll, Silver particles, led by a few gold sparks, burst off the shell, form the arriving face's symbol as a hologram in front of the die (the metal dims beneath it), then dive onto the face as it seats, where the engraving's etch light-up takes over. Scroll-driven; absent on Low and reduced-motion paths.
- Idle: very slow drift (under 2° per second) so the light keeps moving across the metal.
- Pointer (desktop only): the die tilts up to 4° toward the cursor.

## Look
- Background: Graphite `#0E0F11` with a faint radial falloff (Plate → Graphite) and fine film grain.
- The atmosphere (D19, Nathan 24 Oct): a field of Silver light motes with occasional gold neurons at every depth around the die, with a camera-focus bokeh — the die floats in a world, not on a backdrop. Resolves with the Arrival; stills under "Pause motion"; absent on the Low and reduced-motion paths.
- Light: a raking neutral key, one Silver rim, one small warm Gold kicker, a soft environment for reflections. Subtle bloom on the engravings only (High tier).
- Text sits left on desktop, below the die on mobile. Headline copy is [PLACEHOLDER] until Nathan supplies it.

## Fallbacks
- Mid tier: no bloom or grain; pixel ratio capped at 1.5.
- Low tier and `prefers-reduced-motion`: a pre-rendered still of the die (AVIF + JPG, rendered from the real scene), no orbit, face changes as a crossfade.
- No WebGL: same as Low tier.

## Never
- Cartoony, low-poly, bubbly or toy-like rendering.
- Dice pips, casino or gambling cues.
- Gold as a material or gradient on the object (gold appears only as light, as above).

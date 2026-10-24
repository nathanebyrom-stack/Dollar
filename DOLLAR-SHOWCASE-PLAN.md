# 34 Automation: Showcase Build Plan (v3)

**For:** Dollar · repo `nathanebyrom-stack/dollar`
**From:** Jenny, Sun 18 Oct 2026, with Nathan's answers of the same day
**Status:** internal build brief, not for publication (not humanized)

This plan **adds to** `BRIEF.md`. Where they clash on hero, visuals, brand values or pages, this plan wins. Everything else in `BRIEF.md` stands: Nathan's voice, never "Frank", never Reabrook, no invented figures or quotes, never offer free builds on the site, and the hard stop on the live domain. Only Nathan or Jenny edit this file.

---

## 1. The idea

**The site is the portfolio.** The visitor scrolls through one continuous 3D space and 34's own work is the exhibit. Nobody should need to be told 34 can build; the page they are scrolling proves it.

Bar: a prospect lands here and thinks "wow" within five seconds, on a phone as well as a desktop.

---

## 2. Brand values (confirmed 18 Oct, replace the PROVISIONAL tokens)

Source: the 34automation Brand & Marketing Playbook in Canva ("How 34 looks").

| Role | Name | Hex |
|---|---|---|
| Page ground | Graphite | `#0C0E11` |
| Raised surface | Panel | `#14171C` |
| Muted text | Muted | `#8B939F` |
| Accent / body light | Silver | `#CBD3DE` |
| Glow / brightest | Spark | `#F2F5FA` |
| Rationed accent | Gold | `#C9A24C` |

- Keep the existing token **names**; swap the values and remove the PROVISIONAL marks. Derive any in-between surfaces from these. Re-check WCAG AA on every text/surface pair after the swap (Muted on Panel especially).
- **Gold is rationed.** The playbook says gold is for the "earn / win" story, never the core agency. On this site gold appears only in the "34" of the wordmark, nowhere else. Not on the hero object, not on buttons.
- **Type:** Chakra Petch stays for the "34 / AUTOMATION" wordmark only. Display headings move to **Space Grotesk Bold** (tracking −2%). Body stays **Inter**. Labels, eyebrows, stats and tags use **IBM Plex Mono, uppercase, +12% tracking**. Self-host all fonts (OFL) like the existing ones.
- **Layout rules from the playbook:** dark first; small radii (4–8 px), hairline borders, thin dividers; one idea per frame; generous space. "Like a control panel, not a flyer."
- **Logo:** `src/assets/brand/34-automation-plate.svg` (horizontal, dark backgrounds only). It replaces the typeset wordmark in Phase 1.

---

## 3. The Home scroll story

One shared WebGL canvas sits behind real HTML text. Scroll drives the camera. Full spec of the hero is in `HERO.md`.

| Scene | What happens on scroll | Purpose |
|---|---|---|
| **0. Arrival** | A machined graphite-and-silver die resolves out of the dark, caught by a cool rim light. Wordmark settles. Text readable before any 3D loads. | First five seconds |
| **1. Hero** | Camera dollies round the die as you scroll. Headline states the build-first model (copy: [PLACEHOLDER] until Nathan's copy lands). | Who we are |
| **2. Services** | Section pins. Each scroll step rolls the die to a new face: Web design, Marketing, Workflow automation. Each face carries an engraved service symbol; a text panel slides in alongside. | What we do |
| **3. The Work** (centrepiece) | Pinned horizontal gallery. Browser and phone frames float in 3D space, each playing a silent scroll-through recording of the real site. Frames tilt toward the cursor; click opens the case study. | Proof |
| **4. Automation, live** | Animated workflow graph: nodes light up in Spark as data moves through them. Generic flow, no client data, no claimed results. | Shows the service rather than describing it |
| **5. Close** | Nathan's photo slot, one line of story ([PLACEHOLDER]), CTA **"Start a conversation"** (confirmed). | Trust, then action |

Look: graphite ground, silver light, Spark glow, film grain and subtle bloom for industrial texture. **Nothing cartoony, nothing low-poly, nothing bubbly.**

---

## 4. The Work showcase (confirmed 18 Oct)

Every card shows an honest status badge: **Live**, **In build** or **Concept**. Only Live sites get an outbound link. No card may imply a client relationship that doesn't exist. Nathan has confirmed Dave Ogden is happy for AOE and Fluid Process UK to be shown as 34 work.

| Project | Badge | What the card shows | Case-study page |
|---|---|---|---|
| Fluid Process UK | **Live** · https://www.fluidprocess.co.uk | Desktop and phone scroll recordings; the ROI calculator in use; the steel-blue design system shown as a design detail | Yes |
| AOE Engineering | **In build** | Old site vs new build as a before/after slider once the new build has a preview; until then a placeholder card | Yes, placeholder until the new site is live |
| Moss & Memory | **Concept** | **Only** the hero, the five-step "From empty glass to living world" build sequence and the "Your story, composed by hand" section. Never the Gallery. Media is already in `src/assets/work/moss-and-memory/` (see its ASSETS.md). | Yes, built around those sections only |

- **Ember is dropped.** Do not mention it anywhere.
- The "test site" Nathan mentioned is the Fluid Process UK site; there is no separate project card.
- Moss & Memory media came from Nathan's own screen recording; don't re-capture or add anything beyond those sections.

---

## 5. Showcase media pipeline

No live iframes (slow, fragile, break the 3D, and the CSP forbids them). Instead:

- `tools/capture/capture.mjs`: Playwright records each project at **1440×900** and **390×844**, 8–12 s of smooth scroll, 30 fps. Not part of the site build; dev-only.
- ffmpeg exports MP4 (H.264, faststart) and WebM (VP9), **≤ 2.5 MB each**, plus AVIF and JPG posters, into `src/assets/work/<project>/`.
- If the cloud session can't reach a site (network allowlist), log it as a blocker and ask for the recordings to be supplied (Anna can drop them in). Never fake a recording with a mock-up.
- Videos map onto the 3D frames as video textures and play only while in view. Re-run the script when a project site changes.

---

## 6. Stack (decided 18 Oct)

- **No Vite.** Keep the existing dependency-free build (`node scripts/build.mjs`) and vendor libraries into `src/assets/vendor/` as ES modules, exactly as GSAP is now. It already works, keeps the CSP strict, and gives an unattended agent fewer moving parts.
- **Vendor:** Three.js (ES module build), GSAP + ScrollTrigger (GSAP is already vendored, add ScrollTrigger at the same version), Lenis. Note versions and licences in `src/assets/vendor/README.md`.
- **The die is built procedurally in Three.js** (rounded box geometry, PBR metal and graphite materials, engraved symbols as normal or emissive maps). No Blender, no glTF, no Draco or WASM decoders.
- **Environment light:** a small self-hosted HDRI or a RoomEnvironment-style generated environment; no CDN.
- **CSP:** add `media-src 'self'` for the videos and `worker-src 'self'` only if a worker is actually used. Never loosen `script-src`; no `unsafe-eval`, no third-party hosts.
- All text stays real HTML for SEO and screen readers. Netlify hosting, Netlify Forms for Contact.

---

## 7. Performance and fallbacks (non-negotiable)

- Text and layout visible in **under 2.5 s on mobile**. The 3D module loads after first paint (dynamic `import()`).
- Three quality tiers, picked at load:
  - **High** (desktop GPU): full scene, bloom and grain.
  - **Mid** (laptops, recent phones): no post-processing, pixel ratio capped at 1.5.
  - **Low or reduced-motion:** pre-rendered stills of the die with CSS transitions; Work videos play on tap.
- Render loop pauses when the canvas is off-screen or the tab is hidden.
- Targets (Lighthouse, mobile): Performance ≥ 85, Accessibility ≥ 95, SEO ≥ 95.
- Check in headless Chromium and WebKit every session; a real-iPhone check is on the launch list.

---

## 8. Pages at launch

Home · **Work** (`/work/`, new index of all projects) · three case studies (one template) · Web design · Marketing · Workflow automation · About · Contact · Privacy. Each service page reuses the scene with its die face as the hero. Blog after launch.

---

## 9. Build phases

The phases replace steps 3 onwards in the old checklist; `CHECKLIST.md` now follows them. Each session: next unticked item, commit and push to `main` (the site is not on the live domain), tick only what works, log it, three-line note.

0. **Architecture** (no site code): write `ARCHITECTURE.md` with file structure, module graph, scene graph, a scroll timeline per Home scene, the three quality tiers, the capture pipeline, CSP changes and a full asset list marking what's missing. **Then stop.** Nothing after Phase 0 starts until Nathan ticks his approval in `CHECKLIST.md`.
1. **Brand swap and shell:** confirmed colours and fonts into tokens; vendor Three.js, ScrollTrigger and Lenis; Work index route; smooth-scroll wiring.
2. **3D core:** die, lighting, scroll camera, quality tiers, reduced-motion path.
3. **Work gallery:** capture pipeline, 3D frames, plain card-list fallback.
4. **Services and automation graph.**
5. **Case-study template** and the three case studies.
6. **About, Contact (form working), Privacy.**
7. **Copy drop-in:** Nathan's voice, humanize and slop-gate, then Edie fact-checks.
8. **QA and launch:** devices, Lighthouse, accessibility, Edie sign-off, Nathan sign-off, then the domain.

---

## 10. Still open

- [x] Netlify connected (19 Oct): every push to main deploys to https://34automation-preview.netlify.app. Put this link in every LOG entry. No custom domain until Nathan signs off.
- [x] Moss & Memory sections and media (18 Oct).
- [x] Logo (19 Oct): `src/assets/brand/34-automation-plate.svg`, approved by Nathan. Swap it into the header and footer in Phase 1; see the README beside it.
- [ ] All site copy: entirely in Nathan's own voice (voice profile: claude/voice/voice-profile-nathan.md in the Agentic manager project, via Jenny), humanized and slop-gated. Dollar never writes final copy; until it arrives, [PLACEHOLDER: …].

---

## 11. Architecture decisions (20 Oct 2026)

Nathan approved ARCHITECTURE.md on 20 Oct and asked Jenny to make the calls on D2–D8. They are final unless Nathan changes them.

| # | Decision |
|---|---|
| D1 | ARCHITECTURE.md approved. |
| D2 | Dollar draws the three service symbols as clean line icons in code (browser window, broadcast signal, linked nodes). Nathan approves them on the preview before they're engraved on the die. |
| D3 | Under 900 px the Work gallery is a vertical list, not a pinned horizontal scroll. |
| D4 | The automation graph (Home scene 4) is SVG + GSAP, not WebGL. |
| D5 | Yes: the capture script may type round, obviously example inputs into the Fluid Process ROI calculator for the "in use" clip. The clip carries a visible "Example inputs" label, and no saving figure from it is quoted anywhere as a result. |
| D6 | Favicon: silver "34" on Graphite. Gold stays in the header logo only. |
| D7 | Keep Chakra Petch as a fallback only (not preloaded). |
| D8 | Anna records the Fluid Process UK clips on Nathan's Mac with the capture script and drops them in `src/assets/work/fluid-process-uk/`. Until they land, the gallery uses the Moss & Memory clip and a poster frame. |

On 23 Oct 2026 Nathan asked for a full wow-factor push on the showcase ("bells, whistles, the lot… graphics all the way, interactive") and gave his blessing on the standing cinematic-versus-conservative flags. Jenny made the calls:

| # | Decision |
|---|---|
| D9 | **Real bloom on High**, settling the "baked glow versus bloom" flag: a selective emissive-only pass (second quarter-resolution render with lights off and colours black), blurred and added after tone mapping, so the glow is limited to the engravings and Spark keeps its colour — the two problems that ruled out a threshold bloom. The Arrival ramps it in as the rim light sweeps. Mid and the stills keep the baked glow, which stays in the emissive maps. |
| D10 | **The automation graph lives**: once fully lit and watched, a quiet pulse travels the flow every few seconds and each node answers with a thin Spark echo of its outline; on a fine pointer, hovering a node fires the echo and a pulse down its outgoing edges. All on elements graph.js adds, never on what the scroll scrub owns. Off under reduced motion, off screen, in a hidden tab, and under D12's pause. |
| D11 | **A pointer sheen in the Work gallery**: a small silver light travels with the cursor just in front of the frames, so a highlight slides across the machined metal. |
| D12 | **A visible "Pause motion" control** (the idle-drift WCAG 2.2.2 flag): fixed bottom-left on pages with a scene, added by motion.js (so it only exists where scripts run), hidden under reduced motion. It stills the die's idle drift, the gallery float and the graph's ambient pulses. Session-only; nothing is stored. Its labels ("Pause motion" / "Play motion") follow the Work cards' Play/Pause pattern and are interface labels, not copy. |
| D19 | **The atmosphere — stage one of the immersive world** (Nathan, 24 Oct, from his Quantum reference: quantumstretch.com is the bar for "visually stunning"). What that site does that ours didn't: one continuous living world fills the screen; ours was an object beside a page. The brand tension is real — ours is machined and precise, theirs soft and ethereal — so the synthesis keeps the die as the anchor and gives it a world of light: a seeded field of silver-and-Spark motes at every depth around the die, swaying on private phases, with a camera-focus bokeh (sharp near the die's distance, soft dim discs nearer and farther). One Points draw call, motion in the vertex shader, near-zero frame cost. It resolves with the Arrival, stills under "Pause motion", fades at the Work hand-off, is hidden from the bloom's emissive pass, and doesn't exist on Low/reduced-motion paths. **Stage two (proposed, not built): the particle swarm** — Spark particles that stream off the die as it rolls and form each service's symbol in the air before it seats. Nathan to approve stage two after seeing stage one. |
| D17 | **Depth** (Nathan, 24 Oct: things coming out of the page). D13's reveals gain real perspective: content starts a step into the page (back on z, a touch of top-tilt) and settles out toward the reader, and case-study media rises out of the page as it arrives, then swells gently nearer at the middle of the screen and further at the edges. Same rules as D13: transform and opacity only, one-shot entrances plus scroll-tied drift, nothing under reduced motion, no inline styles left behind. |
| D18 | **The die captions itself** (Nathan, 24 Oct: nobody should have to look up what a face means). A small machined label under the die names the face that is showing — the site's own service names, not new copy — fading in with the face's glow on the live scene and crossfading with the stills on the Low path. aria-hidden: the service panels and page headings already carry the same names for assistive tech. |
| D15 | **The die: no blank faces, and the light explains the face** (Nathan, 24 Oct). The two plain side faces now carry stamped engravings — the "34 / AUTOMATION" wordmark (Chakra Petch, its one permitted use) and "BUILD FIRST" (Space Grotesk), machined like a data plate, never lit. "BUILD FIRST" is drawn from Nathan's own stated build-first model but is on the die as words, so Nathan should confirm or replace it on the preview. The four lit faces now light **in a direction that says what the face means**: the web-design window paints in from the top, the marketing signal radiates outward, the automation flow travels left to right through its nodes (echoing the page's graph), and the 34 warms from its centre. At full glow every face is exactly the image it was before, so the pre-rendered stills and reduced-motion paths are unchanged. |
| D16 | **Less gold, bigger type** (Nathan, 24 Oct). The "gold writing" on the pages was the amber [PLACEHOLDER] markers; they are now muted silver italic (still mono, bracketed and dash-bordered, so unfinished copy stays unmissable — and all of it vanishes when Nathan's copy lands). Gold now appears nowhere but the header logo's "34", which Nathan wants kept. Display type steps up: h1 a size larger and tighter, section h2s up to 3xl with a short machined silver rule beneath — Silver fading to nothing, never gold. |
| D14 | **Opt-in sound design, never music** (Nathan asked for music, 24 Oct; Jenny advised against — browsers block autoplay, it costs trust with a B2B buyer at a desk, and a real track means licensing — and Nathan approved this instead): a "Play sound" / "Mute sound" control beside D12's, OFF by default, on scene pages only. All synthesised with the Web Audio API (no files, no licences, CSP untouched): a low workshop hum with a slow swell, a soft metallic seat as the die settles onto a service face, a quiet tick as a gallery frame crosses the middle. The audio engine is only created on the first press (the user gesture browsers require), so nothing can ever sound on its own; session-only, nothing stored; the hum pauses with the tab. The labels are interface labels, not copy. |
| D13 | **Site-wide scroll-and-reveal** (Nathan, 24 Oct: "the whole site" gets the wow): on every page, a section's content rises into place as it enters the view — short travel, firm ease, machined like the hero, no bounce — and case-study media settles from a touch wider with a slow parallax drift as it crosses the screen. The Home scroll scenes, the graph sections and the Privacy prose are excluded (the first two own their own motion; legal text should simply be there). Reveals animate transform and opacity only (content never leaves the accessibility tree), are one-shot entrances (so D12's pause rightly leaves them alone), show everything with no movement under reduced motion including a mid-visit flip, and with no JavaScript the page is simply its HTML. |

## 12. Handover to Claude Code

The rest of the build runs in Claude Code with Nathan, from `HANDOVER.md`. Dollar's weekday sessions are switched off.

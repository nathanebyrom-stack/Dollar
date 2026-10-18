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
- **Logo files:** none supplied yet. Keep the typeset wordmark in the header until Nathan supplies an SVG.

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

- [ ] Netlify connected to this repo (Nathan: TBC). Until then, no preview link; build and check locally.
- [x] Moss & Memory sections and media (18 Oct).
- [ ] Logo: Nathan to pick one of the four "34 / AUTOMATION" lockups (Stacked, Emblem, Monolith, Plate) and export it from Canva as SVG or transparent PNG. Until then the header keeps the typeset wordmark.
- [ ] All site copy: entirely in Nathan's own voice (voice profile: claude/voice/voice-profile-nathan.md in the Agentic manager project, via Jenny), humanized and slop-gated. Dollar never writes final copy; until it arrives, [PLACEHOLDER: …].

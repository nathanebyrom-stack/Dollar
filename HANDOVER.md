# HANDOVER.md: 34automation.com build, for Claude Code

Written by Dollar, 20 Oct 2026. Dollar's scheduled sessions are switched off; Nathan continues the build in Claude Code from here.

## The site and the bar
www.34automation.com is the home of 34 Automation, a UK agency for small businesses (web design, marketing, workflow automation) that builds the work first. The site is the portfolio: one continuous dark, cinematic 3D scroll space (a machined graphite die, then 34's real work in floating frames) over real HTML text. Bar: a prospect thinks "wow" within five seconds, on a phone as well as a desktop. Target: end of October 2026; quality wins over the date.

**Read in this order:** `CLAUDE.md` (rules) → `DOLLAR-SHOWCASE-PLAN.md` (wins on any clash) → `HERO.md` → `ARCHITECTURE.md` (approved technical plan; decisions D1–D8 in §11) → `BRIEF.md` → `CHECKLIST.md` → newest `LOG.md` entry. Only Nathan or Jenny edit BRIEF, CLAUDE, the plan and HERO.

## Current state (commit at handover: see LOG.md)
- **Built and working:** dependency-free build (`scripts/build.mjs`) assembling `src/pages` + `src/partials` into `dist/`; all 10 routes + 404 with clean URLs; `netlify.toml` with strict CSP and security headers; `tokens.css` (one source for colour, type, spacing, radii, motion); `motion.js` (GSAP defaults, reduced motion); self-hosted Inter and Chakra Petch; GSAP 3.13.0 vendored.
- **Placeholder:** every page's copy and meta description (`[PLACEHOLDER: …]`); colour values in `tokens.css` are still marked PROVISIONAL (confirmed values are in the plan §2); header/footer still use the typeset wordmark, not the logo plate; About photo slot; Privacy text; no 3D, gallery or graph yet.
- **Preview:** https://34automation-preview.netlify.app. Every push to `main` redeploys it. The live domain is not connected and must not be.

## Build order (CHECKLIST.md steps 4–11)
Work one package at a time, in order. Tick a CHECKLIST item only when it is committed and working; add a LOG.md entry per session.

1. **Phase 1: Brand swap and shell.** Goal: confirmed brand, fonts, libraries and routes in place. Files: `tokens.css`, `base.css`, `partials/head.html|header.html|footer.html`, `assets/fonts/`, `assets/vendor/` (+ `README.md`), `pages.json`, `pages/work/index.html`, `assets/js/smooth.js`, `main.js`, `netlify.toml` (vendor/font cache rule). Done when: six plan §2 colours in under the existing token names, PROVISIONAL gone, AA re-checked (Muted on Panel ≥ 4.5:1); logo plate in header and footer; Space Grotesk 700 + IBM Plex Mono 400/500 self-hosted, Chakra Petch fallback only and not preloaded (D7); silver "34" favicon (D6); Three.js r186, ScrollTrigger 3.13.0, Lenis vendored with `'three'` imports rewritten to relative paths; `/work/` in nav and footer; Lenis on, off under reduced motion. Waiting on: nothing.
2. **Phase 2: 3D core (HERO.md).** Goal: the die, scroll camera, Services rolls, tiers, fallbacks. Files: `assets/js/scene/*`, `scenes.css`, `tools/stills/`, `assets/img/die/`. Done when: die renders on High/Mid; `?tier=high|mid|low` each run without console errors; Low, no-WebGL and reduced motion show pre-rendered stills with crossfades; faces stay square to the camera (ARCHITECTURE §5 `dieYaw`). Waiting on: Nathan approving the three line-icon symbols on the preview before they are engraved (D2).
3. **Phase 3: Work gallery.** Goal: pinned horizontal 3D gallery (vertical list under 900 px, D3) with honest status badges. Files: `tools/capture/`, `scene/frames.js`, `components.css`, `pages/work/index.html`, `assets/work/*`. Done when: frames play video textures only in view (max two decoding); plain card list works without JS/WebGL; badges read Live / In build / Concept. Waiting on: Fluid Process UK clips from Anna (D8); use the Moss & Memory clip and a poster meanwhile.
4. **Phase 4: Services and automation graph.** Files: `pages/services/*`, `scene/timeline-service.js`, `assets/js/graph.js`. Done when: each service page uses its die face as hero; Home scene 4 graph is SVG + GSAP (D4), static with all nodes lit under reduced motion; no client data or results in the graph. Waiting on: service copy (placeholders until then).
5. **Phase 5: Case studies.** One template, then Fluid Process UK (Live), AOE Engineering (In build, placeholder), Moss & Memory (Concept: hero, five-step build sequence and "Your story, composed by hand" only; never the Gallery). Waiting on: copy; AOE new-build preview; a clean "Your story" still.
6. **Phase 6: About, Contact, Privacy.** Contact via Netlify Forms with honeypot, success page `/contact/thanks/` (noindex). Done when: a test submission lands in Netlify. Waiting on: Nathan's photo, contact details, company registration details, full UK GDPR text.
7. **Phase 7: Copy.** Nathan's copy dropped in, humanized and slop-gated, then Edie fact-checks. Waiting on: Nathan.
8. **Phase 8: Quality and launch.** SEO (titles, descriptions, OG image, sitemap, robots), mobile speed, WCAG 2.1 AA, Chrome/Safari/Firefox/Edge/iOS/Android, launch checklist, Nathan's written sign-off, then and only then the domain.

## Assets
**In the repo**
- Logo plate: `src/assets/brand/34-automation-plate.svg` (dark backgrounds only; see README beside it).
- Moss & Memory: `src/assets/work/moss-and-memory/` with `build-sequence.mp4/.webm` and `poster-hero.jpg`, `poster-plants.jpg`, `poster-light.jpg` (read its `ASSETS.md`).
- Fonts: `src/assets/fonts/` with Inter (variable) and Chakra Petch 500/600/700, plus OFL licences.
- GSAP: `src/assets/vendor/gsap-3.13.0.min.js`.

**Missing, and who supplies it**
| Asset | Who |
|---|---|
| Fluid Process UK desktop/phone clips + ROI calculator clip | Anna, on Nathan's Mac with the capture script (D8) |
| All site copy and meta descriptions | Nathan, in his own voice; humanize + slop-gate, then Edie fact-checks |
| About / Home close photo | Nathan |
| Contact details, company registration details | Nathan |
| Full UK GDPR privacy text | before launch (Nathan/Jenny) |
| AOE Engineering old-site URL and new-build preview | Nathan |
| Clean "Your story, composed by hand" still (Moss & Memory) | re-capture from the concept page |
| Space Grotesk, IBM Plex Mono, Three.js, ScrollTrigger, Lenis | the build itself (Phase 1, from npm, OFL/MIT) |

## Hard rules
- No invented copy, figures, clients, quotes, endorsements or project statuses. Use a visible `[PLACEHOLDER: …]`.
- He is Nathan, never "Frank". Never mention Reabrook. Ember is dropped; don't mention it.
- Never offer free builds on the site. CTA is "Start a conversation" → `/contact/`.
- Gold `#C9A24C` only in the "34" of the header logo plate. Not on the die, buttons or favicon.
- No grid, dot-matrix, graph-paper or blueprint backgrounds anywhere (ARCHITECTURE §15 lists the only allowed backgrounds).
- Every page works with no JS and no WebGL; reduced motion gets stills, no Lenis, no scrub.
- CSP stays strict: only add `media-src 'self'`. No inline scripts, no `unsafe-eval`, no third-party hosts, no iframes.
- Never touch the live domain or domain/DNS settings without Nathan's explicit written yes.
- UK English. Don't pull material from old agents, workbooks or past drafts.

## How to check each phase
- **Build:** `node scripts/build.mjs` (writes `dist/`), then serve it: `npx serve dist` or `python3 -m http.server -d dist 8080`.
- **Smoke test (headless Chromium via Playwright):** every route returns 200; one `<h1>` per page; no broken internal links; no console errors; no `securitypolicyviolation` events (run with the netlify.toml CSP applied); `?tier=high|mid|low` and emulated reduced motion all clean; JS disabled reads top to bottom with no empty pinned gaps. Formalise this as `tools/check/smoke.mjs` (ARCHITECTURE §14); it does not exist yet.
- **Mobile overflow:** at 375 px and 1440 px, `document.documentElement.scrollWidth <= innerWidth` on every route.
- **Background rule:** built CSS has no `repeating-*-gradient` or tiled `background-size` pattern.
- **Lighthouse (mobile):** Performance ≥ 85, Accessibility ≥ 95, SEO ≥ 95; main content visible < 2.5 s.
- **Then:** push to `main`, check the preview URL, log it.

## Kickoff prompt for Claude Code (Phase 1)
```
You're continuing the build of www.34automation.com in the repo nathanebyrom-stack/dollar.
Read HANDOVER.md first, then CLAUDE.md, DOLLAR-SHOWCASE-PLAN.md, HERO.md, ARCHITECTURE.md,
CHECKLIST.md and the newest LOG.md entry. Confirm what is actually built by checking the code.

Do Phase 1 (CHECKLIST step 4) only, item by item:
1. Swap the six confirmed brand colours (plan §2) into tokens.css under the existing token names,
   remove every PROVISIONAL mark, and re-check WCAG AA on each text/surface pair.
2. Put src/assets/brand/34-automation-plate.svg in the header and footer; theme-color #0C0E11;
   silver "34" on Graphite favicon (D6).
3. Self-host Space Grotesk 700 and IBM Plex Mono 400/500 with OFL licences; preload Space
   Grotesk and Inter only; Chakra Petch stays as a fallback, not preloaded (D7).
4. Vendor Three.js r186, GSAP ScrollTrigger 3.13.0 and Lenis into src/assets/vendor/ with
   README.md (versions, licences, sources); rewrite 'three' imports to relative paths.
5. Add the /work/ index route to pages.json, header and footer.
6. Wire Lenis + ScrollTrigger in smooth.js; off under prefers-reduced-motion.

Hard rules: no invented copy or figures ([PLACEHOLDER: …]); never "Frank", never Reabrook;
gold only in the header logo; no grid/dot/blueprint backgrounds; CSP stays strict; never touch
the live domain. UK English.

After each item: node scripts/build.mjs, headless smoke check (200s, one h1, no console/CSP
errors, no overflow at 375 px and 1440 px), commit with a clear message, push to main.
Tick only what works, add a LOG.md entry with the preview link
(https://34automation-preview.netlify.app), and end with done / next / blocker.
```

# Dollar — Session Log

Keep the last 5 entries in full. Reduce older ones to one line under "Earlier".
Each entry: date, what was done, what's next, blocker, preview link.

## 20 Oct 2026 (session 5)
- **Done:** No site code. The approval gate is now ticked (commit 0b52278), so the next item would be Phase 1 (brand colours into tokens.css). But the same commit added DOLLAR-SHOWCASE-PLAN.md §12: the rest of the build runs in Claude Code with Nathan from HANDOVER.md, and Dollar's weekday sessions are switched off. The plan wins, so Dollar stood down rather than start Phase 1 on main alongside Nathan's sessions. HANDOVER.md does not exist in the repo yet. Design rule re-checked: still no grid, dot, graph-paper or blueprint background in the code, ARCHITECTURE.md, HERO.md or the plan; nothing to remove.
- **Next:** Nathan, in Claude Code: Phase 1 (CHECKLIST step 4). ARCHITECTURE.md's status line and section 11 still read "waiting for approval" and list D1–D8 as open questions; the final answers are in the plan §11, which wins. Worth updating in the first Claude Code session.
- **Blocker:** This scheduled Dollar task is still firing though the plan says it is switched off; Jenny or Nathan should disable it. HANDOVER.md not yet written.
- **Preview:** https://34automation-preview.netlify.app

## 20 Oct 2026 (session 4)
- **Done:** Approval gate still unticked, so no site code. Gap review of ARCHITECTURE.md, fixes made: (1) camera/face bug: the camera's half-orbit ended behind the die while rolls brought faces to world +Z, so active faces would have pointed away from the viewer; added a `dieYaw` group that turns the die to face the camera during Services; (2) main.js was marked as already doing nav/smooth scroll/reveal; it only sets the `js` class, now stated; (3) no-JS gate so pinned scroll lengths never leave empty gaps without JS; (4) failure paths (import failure, WebGL context loss, shader compile) all fall back to stills; (5) video limits (two decoding at once, `muted playsinline`, release off-screen); (6) `/contact/thanks/` success route and honeypot spam control; (7) named the two preloaded fonts; (8) no analytics or cookies stated as a principle. **Design rule (Nathan, 19 Oct):** audited code, ARCHITECTURE.md, HERO.md and the plan for faded grid, dot, graph-paper or blueprint backgrounds: none found, nothing to remove. Added principle 6 and section 15 listing the only permitted backgrounds (flat Graphite, one radial falloff behind the die, flat Panel, High-tier random film grain, project media), plus a smoke-check rule that fails on repeating/tiled CSS patterns.
- **Next:** waiting for Nathan to approve ARCHITECTURE.md (CHECKLIST step 3). Then Phase 1: brand swap and shell.
- **Blocker:** Nathan's approval of ARCHITECTURE.md. Still open: Fluid Process UK recordings (sandbox can't reach the site), no headless WebKit here.
- **Preview:** https://34automation-preview.netlify.app

## 19 Oct 2026 (session 3)
- **Done:** Phase 0: ARCHITECTURE.md written (no site code). Covers file structure, build changes, module graph (with the CSP-safe rewrite of Three.js `'three'` imports instead of an inline import map), scene graph and die face layout, quality tiers with runtime drop, a scroll timeline per Home scene, capture and still-render pipelines, CSP (adds `media-src 'self'` only), a full asset list marking gaps, eight decisions for Nathan (D1–D8), performance budget and risks. Confirmed brand colours pre-checked for AA: all pass on Graphite and Panel (lowest 5.79:1).
- **Next:** waiting for Nathan to approve ARCHITECTURE.md (CHECKLIST step 3). Nothing past Phase 0 starts until it is ticked. Then Phase 1: brand swap and shell.
- **Blocker:** Nathan's approval of ARCHITECTURE.md. Also logged: this sandbox can't reach www.fluidprocess.co.uk (proxy 403), so the Fluid Process UK recordings need supplying or allowlisting; only Chromium is available (no headless WebKit).
- **Preview:** https://34automation-preview.netlify.app

## 12 Oct 2026 (session 2)
- **Done:** Step 2 Design tokens (commit 59bad98). `assets/css/tokens.css` is the single source for colour (all values marked PROVISIONAL until the Canva brand codes arrive), type scale, spacing, radii, shadows/glow and motion durations/easings; reduced motion sets all durations to 0. `assets/js/motion.js` reads durations from the tokens, sets GSAP defaults, maps easings, and gives reduced-motion-safe `to`/`from` wrappers plus a change listener. Chakra Petch (500/600/700) and Inter (variable) are self-hosted with OFL licences; GSAP 3.13.0 is vendored. base.css now uses tokens only. CSP tightened to self-hosted fonts. Checked in headless Chromium with the CSP applied: fonts load, GSAP runs, reduced motion completes tweens instantly, no console errors; all routes still 200 with no mobile overflow. Token text colours pass WCAG AA on every surface (lowest 5.8:1).
- **Next:** Step 3 Hero is blocked (no HERO.md). Next unblocked item is Step 4 Home, but the checklist says build the hero first and Home includes the hero, so Home will be built around a hero slot unless Jenny says otherwise.
- **Blocker:** HERO.md missing (Nathan to pick one of three hero concepts). No Netlify site connected, so no preview link. Canva brand codes still needed to finalise colours.
- **Preview:** none yet.

## 12 Oct 2026 (session 1)
- **Done:** Step 1 Skeleton (commit 98cc63a). Dependency-free build (`node scripts/build.mjs`) assembles `src/pages` + shared header/footer partials into `dist/`. All 10 routes plus 404 build and return 200; clean folder URLs (/about/, /services/web-design/ …). netlify.toml sets build command, `dist` publish dir and security headers (HSTS, CSP, nosniff, frame-deny, referrer, permissions). About has a photo slot and story placeholders; Privacy is a placeholder pending the full UK GDPR policy. Checked in headless Chromium: one h1 per page, no broken internal links, no horizontal scroll at 375px, header sub-menus reachable by keyboard. All unconfirmed copy is a visible [PLACEHOLDER: …]; base styles are PROVISIONAL.
- **Next:** Step 2 Design tokens: tokens.css (colour PROVISIONAL), motion.js (GSAP eases, reduced motion), Chakra Petch + body font.
- **Blocker:** No preview link. The repo is not yet connected to a Netlify site (needs Nathan to connect it; preview/branch deploys only, no domain). Not blocking step 2. Still open for later: HERO.md (step 3), Canva brand codes (tokens stay PROVISIONAL), CTA wording confirmation.
- **Preview:** none yet.

## Earlier
- 12 Oct 2026: Repo created; brief, checklist and log added by Jenny.

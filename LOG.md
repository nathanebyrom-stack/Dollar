# Dollar — Session Log

Keep the last 5 entries in full. Reduce older ones to one line under "Earlier".
Each entry: date, what was done, what's next, blocker, preview link.

## 12 Oct 2026
- **Done:** Step 1 Skeleton (commit 98cc63a). Dependency-free build (`node scripts/build.mjs`) assembles `src/pages` + shared header/footer partials into `dist/`. All 10 routes plus 404 build and return 200; clean folder URLs (/about/, /services/web-design/ …). netlify.toml sets build command, `dist` publish dir and security headers (HSTS, CSP, nosniff, frame-deny, referrer, permissions). About has a photo slot and story placeholders; Privacy is a placeholder pending the full UK GDPR policy. Checked in headless Chromium: one h1 per page, no broken internal links, no horizontal scroll at 375px, header sub-menus reachable by keyboard. All unconfirmed copy is a visible [PLACEHOLDER: …]; base styles are PROVISIONAL.
- **Next:** Step 2 Design tokens: tokens.css (colour PROVISIONAL), motion.js (GSAP eases, reduced motion), Chakra Petch + body font.
- **Blocker:** No preview link. The repo is not yet connected to a Netlify site (needs Nathan to connect it; preview/branch deploys only, no domain). Not blocking step 2. Still open for later: HERO.md (step 3), Canva brand codes (tokens stay PROVISIONAL), CTA wording confirmation.
- **Preview:** none yet.

## Earlier
- 12 Oct 2026: Repo created; brief, checklist and log added by Jenny.

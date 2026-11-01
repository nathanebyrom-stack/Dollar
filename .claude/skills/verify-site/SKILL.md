---
name: verify-site
description: Use when the 34automation.com site (this repo) has changed and needs checking before a commit, a LOG.md entry or a CHECKLIST tick. Runs the build, smoke, SEO, axe accessibility, contrast, WebKit/Firefox and Lighthouse checks against dist/ with the real CSP, and says how to read each result.
---

# Verify the site

All checks serve `dist/` locally with the Content-Security-Policy from `netlify.toml`, so a check that passes here will not trip the CSP on Netlify. Run everything from the repo root. Never point any of this at the live domain.

## 1. Build first

```bash
node scripts/build.mjs
```

`dist/` is stale until you rebuild. Every check below reads `dist/` (SEO builds its own temporary copies).

## 2. Fast checks (every change)

| Command | What it proves | Pass looks like |
|---|---|---|
| `node tools/check/smoke.mjs` | Every route at 375 px and 1440 px: 200, one `<h1>`, no console/page errors, no CSP violation, no horizontal overflow; internal links resolve; reduced motion; background rule (ARCHITECTURE §15) and banned words; Services keyboard path; phone menu; no-JS menu | ends with an ok count (121 on 1 Nov) and no `FAIL` |
| `node tools/check/seo.mjs` | Pre-launch noindex state and launch-mode (`SITE_INDEXABLE=1`) sitemap, robots, canonical, OG/Twitter tags, OG image 1200x630, unique titles and descriptions | all `ok   seo:` |
| `node tools/check/contrast.mjs` | Token colour pairs: 4.5:1 text, 3:1 non-text, read live from `tokens.css` | exit 0 |
| `node tools/check/a11y.mjs` | axe-core WCAG 2.1 A/AA plus best practice on every route at desktop, phone and 320 px, reduced motion, live 3D scene and phone menu open | no violations. "Incomplete" items (mostly text over the 3D canvas) are listed for a human; they are not failures |

Run them one at a time, or write each to its own output file. Two runs sharing one output file interleave and produce a spurious `FAILED`.

## 3. Cross-browser (when layout, nav or the scene changed)

```bash
cd tools && node check/browsers.mjs webkit
cd tools && node check/browsers.mjs firefox
```

Needs `npx playwright-core install webkit firefox` once, and again after a Playwright upgrade (a cached build from an older version will not launch: WebKit reports a missing `pw_run.sh`, Firefox hangs). That is a download, so ask the user first. Automation only. It does not replace a real iPhone, Android phone or Edge.

## 4. Lighthouse (before a performance or launch claim)

```bash
node scripts/build.mjs
node .claude/skills/verify-site/lh-serve.cjs 4173 &        # CSP + Brotli, like Netlify
npx lighthouse@12 http://127.0.0.1:4173/ --output=json --output-path=lh-home.json \
  --chrome-flags="--headless=new" --quiet
```

Run Home, `/work/` and a case study; take the median of three, because the first cold run can be an outlier (Home once scored 68, then 93 to 97). Last good numbers (25 Oct): Home and workflow-automation 100/100/100, LCP 1.7 s and 1.5 s. Kill the server when done.

**NO_FCP on every page, even example.com, means the Mac's display is asleep, not a site fault.** Wake the screen (or use `mcp__ccd_host__request_keep_awake`) and retry; do not tick or untick anything on the strength of a NO_FCP run.

## 5. Reading the results honestly

- Passing automation is not the same as done. CHECKLIST.md keeps manual items unticked: screen reader and 200% zoom walk-through, real iPhone/Android/Edge, banding on Mid/Low, hero text over the die on phones.
- Tick a CHECKLIST item only when it is committed and working. Put the numbers in LOG.md (date, done, next, blocker, preview link) and keep the last five entries in full.
- If a check fails, fix the cause. Do not loosen the check. When you add a check, prove it can fail: break the thing on purpose (mutation), see it go red, restore.
- A scene file that starts using a Three.js class missing from `three.min.js` needs `tools/vendor/vendor.mjs` re-run (it downloads via `npm pack`, so ask first).

## 6. After pushing

Jenny's sessions push to `main` too. `git fetch` and rebase before pushing; for a LOG.md conflict keep both entries and renumber yours. Re-run smoke on the merged tree, then look at https://34automation-preview.netlify.app (it redeploys on every push to `main`).

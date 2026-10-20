# ARCHITECTURE.md: 34automation.com showcase build

**Author:** Dollar · **Written:** Mon 19 Oct 2026 (Phase 0) · **Revised:** Tue 20 Oct 2026 (gap review, see LOG.md) · **Status:** approved by Nathan, 20 Oct 2026; decisions D1–D8 final (section 11, from DOLLAR-SHOWCASE-PLAN.md §11). Build continues in Claude Code from HANDOVER.md
**Sources:** DOLLAR-SHOWCASE-PLAN.md (v3), HERO.md, BRIEF.md, and the repo as it stands at `c818b3d`.

This is the technical plan for Phases 1–8. It contains no site copy; every visible word that isn't a service or project name stays `[PLACEHOLDER: …]` until Nathan's copy lands. Section 11 records the decisions made at review; section 10 lists every asset and marks what is missing.

---

## 1. Principles

1. **HTML first.** Every page is complete, readable and navigable with no JavaScript and no WebGL. The 3D layer is an enhancement painted behind real HTML text.
2. **One canvas per page, loaded after first paint.** The 3D module is fetched with dynamic `import()` once the page has painted; it never blocks text or layout.
3. **No new build tooling.** Keep `node scripts/build.mjs` (no dependencies). Libraries are vendored into `src/assets/vendor/`. Dev-only tools (capture, still rendering) live in `tools/` with their own `package.json` so Netlify never installs them.
4. **Strict CSP stays strict.** No inline scripts, no `unsafe-eval`, no third-party hosts. The only addition is `media-src 'self'`.
5. **Honest content.** Status badges (Live / In build / Concept), no invented figures, no fake recordings, gold only in the "34" of the logo.
6. **Every background is a deliberate brand choice.** No grid, graph-paper, blueprint or dot-matrix pattern anywhere, as a background or a texture (Nathan's design rule, 19 Oct 2026). The permitted backgrounds are listed in section 15.
7. **No tracking, no cookies.** No analytics or third-party scripts are planned, so no cookie banner is needed. If Nathan wants analytics later, it is a separate decision (it changes the CSP and the privacy policy).

---

## 2. File structure (target at end of Phase 5)

Items marked ✓ exist today; everything else is new.

```
/
├─ ARCHITECTURE.md                     this file
├─ BRIEF.md · CLAUDE.md · DOLLAR-SHOWCASE-PLAN.md · HERO.md · CHECKLIST.md · LOG.md   ✓
├─ netlify.toml                        ✓ (CSP gets media-src; vendor cache rule)
├─ scripts/
│  └─ build.mjs                        ✓ (extended: per-page scene scripts, /work/ index, sitemap in Phase 8)
├─ tools/                              dev only, never deployed, own package.json
│  ├─ package.json                     playwright-core (browser path from env; /opt/pw-browsers in the sandbox), sharp
│  ├─ capture/
│  │  ├─ capture.mjs                   records project sites (section 8)
│  │  ├─ projects.json                 URL, viewports, scroll length, output folder per project
│  │  └─ README.md
│  ├─ stills/
│  │  ├─ render-stills.mjs             renders die stills from the real scene (section 7)
│  │  └─ README.md
│  └─ check/
│     └─ smoke.mjs                     headless route + console + overflow + CSP check (exists informally; formalised here)
└─ src/
   ├─ pages.json                       ✓ (+ /work/ route, + "scene" field per page)
   ├─ partials/ head.html · header.html · footer.html   ✓ (logo swap, Work link, theme-color)
   ├─ pages/
   │  ├─ home.html · about.html · contact.html · privacy.html · 404.html   ✓
   │  ├─ work/index.html               NEW: /work/ index (card list, status badges)
   │  ├─ contact-thanks.html           NEW: /contact/thanks/ (Netlify Forms success page, noindex)
   │  ├─ work/fluid-process-uk.html · aoe-engineering.html · moss-and-memory.html   ✓
   │  └─ services/web-design.html · marketing.html · workflow-automation.html       ✓
   └─ assets/
      ├─ brand/34-automation-plate.svg ✓ · README.md ✓
      ├─ css/
      │  ├─ tokens.css                 ✓ (brand values swapped in Phase 1)
      │  ├─ base.css                   ✓
      │  ├─ components.css             cards, badges, frames, buttons, eyebrows, panels
      │  └─ scenes.css                 scroll-section heights, pinned panels, stills, canvas layer
      ├─ fonts/                        ✓ Inter, Chakra Petch (fallback only, never preloaded: D7) · NEW Space Grotesk 700, IBM Plex Mono 400/500 (+ OFL licences)
      ├─ js/
      │  ├─ motion.js                  ✓ shared eases/durations, reduced motion
      │  ├─ main.js                    ✓ (today it only sets the `js` class on <html>; nav, reveal-on-scroll and the smooth.js hook are added in Phase 1)
      │  ├─ smooth.js                  Lenis ↔ ScrollTrigger wiring
      │  ├─ graph.js                   automation graph (SVG + GSAP), Home scene 4 + automation page
      │  └─ scene/                     ES modules, loaded only on pages with a scene
      │     ├─ boot.js                 tier detection, still swap, dynamic import of stage.js
      │     ├─ tier.js                 quality tier logic (section 6)
      │     ├─ stage.js                renderer, camera, loop, resize, visibility, dispose
      │     ├─ die.js                  procedural die geometry and face layout
      │     ├─ materials.js            graphite PBR, brushed-silver bevel, engraving maps
      │     ├─ engravings.js           canvas-drawn symbol masks → normal + emissive maps
      │     ├─ lighting.js             key, rim, RoomEnvironment
      │     ├─ post.js                 High tier only: bloom + grain composer
      │     ├─ frames.js               Work gallery: browser/phone frames + video textures
      │     ├─ timeline-home.js        ScrollTrigger timelines for Home scenes 0–3
      │     └─ timeline-service.js     single-face hero for each service page
      ├─ img/die/                      pre-rendered stills (AVIF + JPG) per face, 2 sizes
      ├─ vendor/
      │  ├─ README.md                  versions, licences, source URLs, how imports were rewritten
      │  ├─ gsap-3.13.0.min.js         ✓
      │  ├─ ScrollTrigger-3.13.0.min.js
      │  ├─ lenis-1.3.x.min.js         (exact patch pinned when vendored)
      │  └─ three-r186/                three.module.min.js, three.core.min.js, addons/ (only the files used)
      └─ work/
         ├─ fluid-process-uk/          recordings + posters (missing, section 10)
         ├─ aoe-engineering/           before/after (missing)
         └─ moss-and-memory/           ✓ build-sequence.mp4/.webm, posters (+ AVIF posters to generate)
```

`dist/` stays git-ignored and is rebuilt by Netlify on every push.

---

## 3. Build changes (`scripts/build.mjs`)

- **pages.json** gains two fields:
  - `"scene"`: `"home"`, `"service:web"`, `"service:marketing"`, `"service:automation"` or absent.
  - `"graph"`: `true` on Home and Workflow automation (loads `graph.js`).
- Pages with a scene get `<script type="module" src="/assets/js/scene/boot.js"></script>` and a `data-scene` attribute on `<body>`. Pages without one load nothing 3D.
- Classic deferred scripts on every page, in order: `gsap`, `ScrollTrigger`, `lenis`, `motion.js`, `smooth.js`, `main.js`.
- New route `/work/` → `pages/work/index.html`, added to header (Work group link) and footer.
- New route `/contact/thanks/` → `pages/contact-thanks.html` (Phase 6): the form's `action`, so a submission lands on our own page rather than Netlify's generic one. `noindex`, not in nav or sitemap.
- **No-JS layout gate.** Scroll lengths for pinned scenes come only from ScrollTrigger's `pinSpacing` at runtime. `scenes.css` never sets pin heights in `vh`, and anything that only makes sense with motion (stacked service panels, horizontal gallery track) is scoped under `html.js` (the class `main.js` already sets). Without JS, every section flows as a normal document with no empty scroll gaps.
- Phase 8 adds `sitemap.xml` and `robots.txt` generation from pages.json (404 excluded, noindex respected).
- Header/footer: the typeset wordmark is replaced by `<img src="/assets/brand/34-automation-plate.svg" alt="34 Automation" width height>` inside the home link. `theme-color` becomes `#0C0E11`.
- Favicon (D6, decided): silver "34" (Silver `#CBD3DE`) on Graphite `#0C0E11`, as `favicon.svg` plus a 32 px PNG and 180 px `apple-touch-icon`. No gold: gold stays in the header logo plate only.
- Chakra Petch (D7, decided): stays self-hosted as the `font-family` fallback for the wordmark if the logo image fails; its `<link rel="preload">` tags are removed in Phase 1.

---

## 4. Module graph

```
every page (classic, defer, in order)
  gsap-3.13.0 ─► ScrollTrigger-3.13.0 ─► lenis ─► motion.js ─► smooth.js ─► main.js
                                                       │
                                                       └─ window.Motion (eases, durations, reduced flag)

pages with data-scene (type=module)
  scene/boot.js
    ├─ tier.js                         (sync, tiny: decides High / Mid / Low)
    ├─ Low  → stills only (CSS crossfades driven by ScrollTrigger); stop here
    └─ High / Mid → after first paint + requestIdleCallback:
         import('./stage.js')
           ├─ vendor/three-r186/three.module.min.js (→ three.core.min.js)
           ├─ addons/geometries/RoundedBoxGeometry.js
           ├─ addons/environments/RoomEnvironment.js
           ├─ die.js ─► materials.js ─► engravings.js
           ├─ lighting.js
           ├─ post.js   (High only, dynamic import)
           │    └─ addons/postprocessing/ EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass
           ├─ frames.js (Home only, dynamic import when the Work section is within one viewport)
           └─ timeline-home.js | timeline-service.js  (use window.gsap + ScrollTrigger)

pages with graph:true (classic, defer)
  graph.js  (SVG + GSAP; no WebGL)
```

**Import rewriting (CSP-critical).** Three.js addons import the bare specifier `'three'`, which needs an import map. An inline import map would break `script-src 'self'`, and external import maps aren't supported across browsers. So when vendoring, every `from 'three'` in the addon files is rewritten to the relative path of `three.module.min.js`. This is done once by hand (or a tiny script recorded in `vendor/README.md`), and the vendored files are committed. No bundler.

**Globals.** GSAP, ScrollTrigger and Lenis stay UMD globals (as GSAP is today). Scene modules read `window.gsap`, `window.ScrollTrigger`, `window.Motion` and `window.__lenis` rather than importing them, so there is one copy of each.

---

## 5. Scene graph

One `WebGLRenderer` per page, canvas `position: fixed; inset: 0; z-index: 0; pointer-events: none` (pointer events re-enabled only over the Work frames). HTML content sits above at `z-index: 1`.

```
Scene (background: none; CSS supplies Graphite #0C0E11 + radial falloff)
├─ PerspectiveCamera  fov 30, near 0.1, far 100        ← driven by ScrollTrigger (dolly, half-orbit)
│   └─ cameraRig (Group)                                 ← orbit pivot at die centre
├─ environment: PMREM(RoomEnvironment), intensity ~0.4  ← reflections only, no visible background
├─ lights
│   ├─ keyLight   DirectionalLight, cool white (~#DCE6F5), from upper left
│   ├─ rimLight   SpotLight, Silver #CBD3DE, behind-right; animated on Arrival (sweep)
│   └─ fill       HemisphereLight, very low
├─ dieRoot (Group)                                       ← idle drift (<2°/s) + pointer tilt (≤4°)
│   └─ dieYaw (Group)                                    ← turns the die to face the camera in Services (see below)
│       └─ dieRoll (Group)                               ← quarter-turn rolls in Services, about dieYaw's local X
│           └─ dieMesh  RoundedBoxGeometry(1,1,1, segments 6, radius ~0.08), material groups:
│           ├─ group 0–5: flat faces   → graphite PBR (metalness 0.9, roughness 0.35–0.5)
│           │                            + per-face normalMap / emissiveMap for engraved faces
│           └─ group 6: bevels         → brushed silver (High: MeshPhysicalMaterial anisotropy)
└─ workGroup (Home only, added lazily)
    ├─ frame[n]  browser frame: rounded slab + bezel + screen plane (VideoTexture)
    └─ frame[n]  phone frame:   rounded slab + screen plane (VideoTexture)
```

**Face layout.** The Services roll is a +90° rotation about X per step, which brings the top face to the front each time. So the four faces round the X ring are:

| Face | Engraving | Arrives at front |
|---|---|---|
| Front (+Z) | "34" mark (outline from the logo plate, Spark glow, **never gold**) | at load |
| Top (+Y) | Web design symbol | Services step 1 |
| Back (−Z) | Marketing symbol | Services step 2 |
| Bottom (−Y) | Workflow automation symbol | Services step 3 |
| Left / Right | plain machined metal | never faces camera head-on |

Each engraving texture is authored rotated so it reads upright at the moment its face reaches the front.

**"Front" means facing the camera (fix, 20 Oct).** The camera orbits round Y while the die rolls about X, so a fixed world "+Z front" would end up facing away from the camera once the orbit passes 90°. To keep each rolled face square to the viewer, `dieYaw.rotation.y` follows the camera's azimuth during Services: over the first 15% of the pin it eases from 0 to the current azimuth (the die indexes round to present the "34" face, like a part seating on a fixture), then it tracks the azimuth exactly. Rolls are applied to `dieRoll` about its parent's local X, which is then always the camera's right-hand axis. Lights stay fixed in world space, so the continuing orbit still reads as light sliding across the metal. Drift and pointer tilt live on `dieRoot` and never fight the yaw or the rolls.

**Material groups.** `RoundedBoxGeometry` is one geometry; at build time each triangle is assigned to a flat-face group (normal within 0.5° of an axis) or the bevel group. Done once at load, cheap.

**Engravings.** Symbols are drawn as `Path2D` on an offscreen 2D canvas (1024 px High, 512 px Mid), blurred slightly, then converted to a normal map with a Sobel pass on the CPU, plus an emissive mask. Emissive intensity animates 0 → 1 when that face is active (Spark `#F2F5FA`). No image files needed. Symbol designs (D2, decided): clean line icons drawn in code: browser window (Web design), broadcast signal (Marketing), linked nodes (Workflow automation). Nathan approves them on the preview (shown flat on a test page) before they are engraved on the die.

---

## 6. Quality tiers

Decided once in `tier.js` before any 3D loads; can drop (never rise) at runtime.

| Check | Result |
|---|---|
| `?tier=high|mid|low` in URL | forced (testing only) |
| No WebGL2 context, or renderer string is software (SwiftShader, llvmpipe, Microsoft Basic Render) | **Low** |
| `prefers-reduced-motion: reduce` | **Low** (motion), see below |
| `navigator.connection.saveData` true | **Low** |
| `deviceMemory < 4` or `hardwareConcurrency < 4` (where reported) | **Low** |
| `pointer: coarse` or viewport < 900 px | **Mid** |
| otherwise | **High** |
| Runtime guard: mean frame time > 22 ms over 2 s after Arrival | drop one tier (High→Mid rebuilds without composer; Mid→Low disposes WebGL and shows stills) |

| | High | Mid | Low / no WebGL | Reduced motion |
|---|---|---|---|---|
| Die | live, physical material, anisotropic bevels | live, standard material | pre-rendered still | pre-rendered still |
| Pixel ratio | min(dpr, 2) | min(dpr, 1.5) | n/a | n/a |
| Bloom (engravings only) + film grain | yes | no | no | no |
| Camera orbit / rolls | scrubbed | scrubbed | none; face change = CSS crossfade between stills | none; crossfade |
| Idle drift, pointer tilt | yes | drift only | no | no |
| Lenis smooth scroll | yes | yes | yes | **off** (native scroll) |
| Work gallery | 3D frames, pinned horizontal | 3D frames ≥ 900 px; below that, card list with in-view video | card list, video plays on tap | card list, video plays on tap |
| Automation graph | animated SVG | animated SVG | animated SVG | static SVG, all nodes lit |

Render loop: `renderer.setAnimationLoop` runs only while the canvas's section is in view (IntersectionObserver on the scene sections) and `document.visibilityState === 'visible'`; otherwise `setAnimationLoop(null)`.

**Failure paths (added 20 Oct).** Every failure lands on the Low-tier stills, never on an empty hero:
- `import('./stage.js')` rejects (network, parse error) → stay on the still, log once to the console, no retry.
- `webglcontextlost` on the canvas → `preventDefault()`, stop the loop, show the stills; on `webglcontextrestored` stay on Low for the rest of the visit (no rebuild loop).
- Shader compile failure on first render (checked with `renderer.compile` before the crossfade) → drop to Mid without the composer, then Low if that fails too.

**Video limits.** At most two Work videos decode at once (the frames nearest the centre of view); the rest pause and show their poster. Every `<video>` is `muted playsinline loop preload="none"` with a poster, which iOS needs for inline autoplay and as a VideoTexture source. Videos are paused and their `src` released when the gallery leaves view by more than one viewport, to free GPU memory on phones.

**Still-first on every tier.** The hero always paints the matching die still (AVIF, sized to viewport) as an `<img>` with fixed dimensions. High/Mid crossfade from the still to the live canvas once the first frame renders, so there is never an empty hero and no layout shift. The headline text, not the image, is the LCP target.

---

## 7. Home scroll timeline (per scene)

One ScrollTrigger per scene, scrubbed (`scrub: 1` on High, `scrub: true` on Mid), Lenis feeding `ScrollTrigger.update`. Heights are section heights; pinned sections add their pin distance on top.

| Scene | Section height / pin | Trigger range | Camera | Die | HTML |
|---|---|---|---|---|---|
| **0 Arrival** | (time-based, not scroll) 0–1.5 s after the first rendered frame | n/a | static, slightly wide | fades up from black; `rimLight` sweeps left→right across the bevels; "34" engraving glows 0→1 | text already visible from first paint; wordmark/eyebrow settle with `Motion.from` (opacity + 8 px), skipped under reduced motion |
| **1 Hero** | 120 vh, no pin | `top top` → `bottom top` | dolly in ~15% and orbit 0°→+90° round Y (first half of the half-orbit) | still (drift only) | headline left (desktop) / below die (mobile) scrolls normally; `[PLACEHOLDER]` copy |
| **2 Services** | 100 vh, **pinned for 300 vh** (3 steps) | `top top` → `+=300%` | orbit +90°→+180° across the pin (completes the half-orbit), die shifts to the right third on desktop | first 15%: `dieYaw` indexes round to face the camera ("34" face forward); then three quarter-turn rolls about the camera-facing X axis (section 5), each eased `power3.inOut` with a short hold (snap to step), active face emissive 0→1, previous 1→0 | one text panel per service slides in from the left (x −24 px, opacity) beside the die; each panel links to its service page; `aria-live` not used (content is static HTML in order) |
| **3 Work** | 100 vh, **pinned for (n frames × 80 vh)** | `top top` → `+=n×80%` | camera holds; die fades out and scales down by 0.6 during the first 20% | hidden after 20% | 3D frames travel right→left (horizontal gallery); each frame tilts ≤6° toward the pointer; click / Enter on the matching HTML card opens the case study; videos play only while their frame is on screen |
| **4 Automation, live** | 150 vh, no pin (canvas idle and paused) | `top 70%` → `bottom 30%` | n/a (render loop paused) | n/a | SVG graph in HTML: nodes light in Spark in sequence as a pulse travels along edges, scrubbed to scroll; generic labels only, no client data or results |
| **5 Close** | auto height | `top 80%` | n/a | optional: die returns small, "34" face, idle | Nathan's photo slot, one line `[PLACEHOLDER]`, CTA button **"Start a conversation"** → `/contact/` |

Service pages use `timeline-service.js`: die rests showing that service's face, camera does a short dolly on scroll (60 vh), no rolls, no gallery.

Mobile (< 900 px): Services pin stays but the panel sits below the die; Work becomes a vertical list of frames/cards (no horizontal pin) to avoid scroll-jacking on touch (D3, decided).

Scene 4 is SVG + GSAP in `graph.js`, never WebGL (D4, decided).

---

## 8. Capture pipeline (`tools/capture/`)

Dev-only; run by Dollar in the session, outputs committed to `src/assets/work/<project>/`.

1. `projects.json`: one entry per project: URL, scroll distance, and which viewports to record. Only **Fluid Process UK** is a live capture target. AOE waits for a preview; Moss & Memory uses Nathan's supplied recording and is **never re-captured**.
2. `capture.mjs` (playwright-core, Chromium at `/opt/pw-browsers/chromium`):
   - viewports **1440×900** and **390×844** (DPR 2 for the phone), `recordVideo` at native size;
   - wait for `networkidle` and fonts, dismiss nothing automatically (if a cookie banner appears, the run stops and logs it rather than clicking through on the site owner's behalf);
   - scroll with an eased JS loop over 8–12 s at a steady rate (no jumps), hold 1 s at top and bottom.
3. ffmpeg (installed in the sandbox) per recording:
   - MP4: H.264 `-crf 26 -preset slow -pix_fmt yuv420p -movflags +faststart -an`, 30 fps;
   - WebM: VP9 `-crf 36 -b:v 0 -an`, 30 fps;
   - widths: desktop 1280, phone 390 (texture-friendly);
   - re-encode at a higher CRF until each file is **≤ 2.5 MB**;
   - posters: first meaningful frame → JPG (q 80) and AVIF (libaom / sharp).
4. ROI calculator clip (D5, decided yes): a separate scripted interaction recording that types round, obviously example inputs into the calculator's fields. The clip carries a visible "Example inputs" label (on the card/frame in our HTML, and burned into the poster), and no saving figure from it is quoted anywhere on the site as a result.
5. Re-run when a project site changes. Outputs listed in each folder's `ASSETS.md` with date and source.

**Who records (D8, decided):** the cloud sandbox cannot reach `https://www.fluidprocess.co.uk` (proxy 403, 19 Oct 2026), so Anna runs `capture.mjs` on Nathan's Mac and drops the outputs in `src/assets/work/fluid-process-uk/`. The script must therefore run on macOS with a normal Playwright Chromium (the `/opt/pw-browsers` path is a sandbox default, overridable by env var). Until the clips land, the gallery uses the Moss & Memory clip and a poster frame. No mock recording will be made.

**Die stills (`tools/stills/render-stills.mjs`).** Loads the built site locally with `?tier=high&still=<face>`, waits for the frame, and screenshots the canvas for faces 34 / web / marketing / automation at 1600 px and 800 px wide. Exports AVIF (q 50) and JPG (q 80) into `src/assets/img/die/`. Headless Chromium renders WebGL via SwiftShader: slow but deterministic. Re-run whenever die materials change.

---

## 9. Netlify / CSP changes

Final `Content-Security-Policy` (only change: `media-src 'self'`):

```
default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self';
img-src 'self' data:; media-src 'self'; connect-src 'self'; form-action 'self';
frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests
```

- `worker-src` not added (no worker planned). `blob:` not added (textures come from same-origin video and canvas).
- GSAP and Lenis write styles through the CSSOM (`element.style`), which `style-src 'self'` allows; no `setAttribute('style')` and no `<style>` injection in our code. Verified per page in the smoke check.
- Netlify Forms posts to the same origin, so `form-action 'self'` holds. Spam control is Netlify's honeypot field (`netlify-honeypot`), not reCAPTCHA, which would need third-party script and frame hosts in the CSP. The form is static HTML in the built page so Netlify detects it at deploy.
- New header rule: `/assets/vendor/*` and `/assets/fonts/*` → `Cache-Control: public, max-age=31536000, immutable` (file names carry versions). Other assets keep `max-age=3600`.
- No domain or DNS change in any phase until Nathan's written sign-off.

---

## 10. Asset list

| Asset | Status | Source / action |
|---|---|---|
| Logo plate `34-automation-plate.svg` | ✓ have | approved 19 Oct |
| Brand colours (6) | ✓ have | plan §2. AA pre-check done (lowest pair: Muted on Panel 5.79:1) |
| Inter, Chakra Petch (OFL) | ✓ have | self-hosted |
| Space Grotesk 700, IBM Plex Mono 400/500 (OFL) | ✗ missing | Phase 1: fetch from Fontsource npm (v5.3.0), self-host with licences |
| GSAP 3.13.0 | ✓ have | |
| ScrollTrigger 3.13.0 | ✗ missing | Phase 1: vendor from `gsap@3.13.0` |
| Three.js r186 (0.186.1) + 6 addons | ✗ missing | Phase 1: vendor, rewrite `'three'` imports |
| Lenis 1.3.x | ✗ missing | Phase 1: vendor UMD build |
| Die engraving symbols (Web design, Marketing, Workflow automation) | ✗ to make | **D2**: line icons drawn in code (browser window, broadcast signal, linked nodes); Nathan approves on the preview before engraving |
| "34" engraving | ✓ source | outlines taken from the logo plate SVG, rendered in Spark |
| Die stills (4 faces × 2 sizes × AVIF/JPG) | ✗ to make | Phase 2, `tools/stills` |
| Fluid Process UK: desktop + phone scroll recordings | ✗ missing | **D8**: Anna records on Nathan's Mac with `capture.mjs`; M&M clip + poster stand in meanwhile |
| Fluid Process UK: ROI calculator in use | ✗ missing | **D8** (Anna) + **D5**: example inputs, "Example inputs" label, no figures quoted |
| Fluid Process UK: steel-blue design system detail | ✗ missing | needs the design tokens or a screenshot of the system from Nathan/Anna |
| AOE Engineering: old site recording | ✗ missing | site URL to confirm; placeholder card until then |
| AOE Engineering: new build preview | ✗ not yet | "In build"; placeholder card |
| Moss & Memory: build-sequence MP4/WebM | ✓ have | 547 KB / 558 KB, under the 2.5 MB cap |
| Moss & Memory: posters (hero, plants, light) JPG | ✓ have | AVIF versions to generate in Phase 3 |
| Moss & Memory: "Your story, composed by hand" still | ✗ missing | ASSETS.md: needs a clean re-capture from the concept page; no blurred frame |
| Moss & Memory: phone recording | ✗ none | not in the source; M&M shows a browser frame only |
| Nathan's photo | ✗ missing | About + Home scene 5 |
| All site copy (headlines, service text, case studies, meta descriptions) | ✗ missing | Nathan's voice via Jenny; `[PLACEHOLDER]` until then |
| Contact details (email; phone if wanted) | ✗ missing | Nathan |
| Company registration details for footer | ✗ missing | Nathan (already a placeholder) |
| Full UK GDPR privacy policy text | ✗ missing | before launch |
| Favicon / app icons | ✗ to make | **D6**: silver "34" on Graphite, no gold (Phase 1) |
| Open Graph image (1200×630) | ✗ missing | Phase 8; rendered from the die still + logo plate |

---

## 11. Decisions (final, 20 Oct 2026)

Nathan approved this document on 20 Oct and asked Jenny to decide D2–D8. Source: DOLLAR-SHOWCASE-PLAN.md §11, which wins if the two ever differ.

| # | Question | Decision | Sections affected |
|---|---|---|---|
| D1 | Approve the architecture | **Approved** | all |
| D2 | Who designs the three service engravings? | Drawn as clean line icons in code (browser window, broadcast signal, linked nodes). Nathan approves them on the preview before they are engraved on the die | 5, 10 |
| D3 | Mobile Work gallery | **Vertical list under 900 px**, no pinned horizontal scroll | 6, 7 |
| D4 | Automation graph technology | **SVG + GSAP**, not WebGL | 4, 6, 7 |
| D5 | Example inputs in the Fluid Process ROI calculator clip? | **Yes**: round, obviously example inputs; visible "Example inputs" label; no saving figure quoted anywhere as a result | 8, 10 |
| D6 | Favicon colour | **Silver "34" on Graphite**; gold stays in the header logo only | 3, 10 |
| D7 | Chakra Petch | **Keep as a fallback only**, not preloaded | 2, 3 |
| D8 | Fluid Process UK recordings | **Anna records** them on Nathan's Mac with the capture script into `src/assets/work/fluid-process-uk/`; until then the gallery uses the Moss & Memory clip and a poster frame | 8, 10, 12 |

---

## 12. Performance budget and risks

| Budget | Target |
|---|---|
| First paint (HTML + CSS + 2 preloaded fonts: Space Grotesk 700 and Inter variable, both WOFF2 Latin subset; IBM Plex Mono loads with `font-display: swap`, not preloaded) | ≤ 150 KB transferred |
| Hero die still (mobile) | ≤ 60 KB AVIF |
| 3D JS (three core + addons + scene modules) | ≤ 200 KB gzip, fetched after first paint |
| Each Work video | ≤ 2.5 MB, `preload="none"`, fetched when its section is one viewport away |
| Lighthouse mobile | Performance ≥ 85, Accessibility ≥ 95, SEO ≥ 95 |
| Main content visible on mobile | < 2.5 s |

**Risks**

1. **Three.js parse cost on mid-range phones** could hurt Lighthouse TBT. Mitigation: still-first hero, import only after `load` + idle on Mid tier, runtime tier drop. If Performance still lands under 85, the fallback is Low tier (stills) on phones; Dollar would bring that to Nathan rather than ship under target.
2. **WebKit check:** the plan asks for headless WebKit each session, but only Chromium is installed in the cloud sandbox and installing browsers is not allowed here. Chromium is checked every session; Safari/iOS needs a real-device or hosted check before launch (launch list). Flagged.
3. **Fluid Process UK recordings depend on Anna** (D8, section 8). The centrepiece needs at least one Live recording; this is the main schedule risk for the end-of-October target. The gallery ships with the Moss & Memory clip until they land.
4. **SwiftShader stills** may render slightly differently from GPU output (no anisotropy). Stills are reviewed by eye before committing; if they look flat, they are rendered with anisotropy off on all tiers for consistency.

---

## 13. Accessibility

- Every scene section has a real heading and text in the DOM, in reading order; the canvas is `aria-hidden="true"`.
- Work frames mirror HTML cards; keyboard focus moves through the cards, and the focused card highlights its 3D frame. Click on a frame and Enter on a card go to the same URL.
- Status badges are text, not colour alone. Videos are muted, decorative (`aria-hidden`), with no autoplay on Low/reduced motion.
- Pinned sections never trap focus; skip link stays first. Reduced motion removes Lenis, pinning scrub and all transforms (end states only).
- Contrast: all six brand colours pass AA on Graphite and Panel (pre-checked); re-checked after the Phase 1 swap.

---

## 14. Testing each session

`tools/check/smoke.mjs` against `dist/` served locally, in headless Chromium:

- every route returns 200, one `<h1>`, no broken internal links;
- no console errors and no CSP violations (listens for `securitypolicyviolation`);
- no horizontal overflow at 375 px and 1440 px;
- each tier forced via `?tier=` renders without errors; reduced motion emulated;
- with JavaScript disabled, every page reads top to bottom with no empty pinned gaps (section 3, no-JS gate);
- background rule (section 15): the built CSS contains no `repeating-linear-gradient`, `repeating-radial-gradient` or `background-size`-tiled pattern, and no background image other than the permitted list; the check fails the run if one appears;
- screenshots of Home at 390 px and 1440 px saved to the scratchpad for a visual check (not committed).

Preview after each push: https://34automation-preview.netlify.app (no custom domain).

---

## 15. Backgrounds (design rule, Nathan, 19 Oct 2026)

Nathan finds the faint line or dot grid behind sections generic and thoughtless. None is used anywhere on the site: no grid, graph-paper, blueprint or dot-matrix pattern as a background, texture, divider fill or loading state, on any tier. Audit on 20 Oct: none exists in the code, this document, HERO.md or the showcase plan.

The only backgrounds allowed, each tied to the brand playbook ("dark first, control panel, not a flyer"):

| Surface | Background | Why it belongs to 34 |
|---|---|---|
| Page ground | Flat Graphite `#0C0E11` (`--color-bg`) | the playbook's page ground |
| Home and service hero | Graphite with one soft radial falloff (lighter centre behind the die, to Graphite at the edges), as a single CSS `radial-gradient` token `--bg-falloff` | HERO.md "faint radial falloff"; it puts light where the object is, not a pattern |
| Raised surfaces (cards, panels, header menu) | Flat Panel `#14171C` (`--color-surface`) with a hairline border | the playbook's raised surface and hairlines |
| High tier only | Fine film grain inside the post-processing pass (random per-frame noise, very low amplitude, over the whole frame) | HERO.md film grain; industrial texture. It is random noise, never a regular or tiled dot pattern, and never a CSS background image |
| Work frames | The project's own recording or poster | the work is the exhibit |

Anything not in this table needs Nathan's say-so before it is built. Sections are separated by space and thin dividers, not by patterned bands.

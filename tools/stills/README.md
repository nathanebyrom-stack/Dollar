# Die stills

`render-stills.mjs` renders the pre-rendered die images from the real 3D scene. They are what the Low tier, reduced motion, no-WebGL visitors and the first paint of every visitor see, so they must match the live die.

```bash
cd tools
npm install
node stills/render-stills.mjs
```

It builds the site, loads `/?still=<face>` at 1600 x 1600 in software WebGL (SwiftShader: slower, but the same output on every machine), reads the transparent canvas back as a PNG and writes AVIF and WebP, with alpha, at 1600 and 800 px wide into `src/assets/img/die/`:

| Face | Files |
|---|---|
| `34` (front) | `die-34-{800,1600}.{avif,webp}` |
| `web-design` (top) | `die-web-design-…` |
| `marketing` (back) | `die-marketing-…` |
| `workflow-automation` (bottom) | `die-workflow-automation-…` |

- **Re-run it and commit the images** whenever the die's geometry, materials, lighting or engravings change (anything in `src/assets/js/scene/` that affects how the die looks), and whenever the die's size rule changes.
- **Size and position come from CSS.** `scenes.css` defines `.die-frame` (the die's size, `--die`, and where it sits). The stills fill that square with the die's front face at exactly half the image width, and the live camera is derived from the frame's measured rectangle, so a still and the live die line up. Change `--die` freely; do not change the half-width rule without re-rendering and updating `stage.js`.
- **Why WebP, not JPG:** ARCHITECTURE names AVIF and JPG, but the stills sit over the page's radial falloff, so they have to be transparent, and JPG has no alpha. AVIF is the first choice and WebP the fallback.
- The mobile (800 px) AVIFs must stay under 60 KB (ARCHITECTURE section 12); the script reports any that do not.
- The page ships only the `34` still in its HTML. The other three are fetched only on the Low path (`scene/stills.js`).

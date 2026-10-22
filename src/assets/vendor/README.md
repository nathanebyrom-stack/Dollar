# Vendored libraries

Third-party code, self-hosted so the CSP stays `script-src 'self'`. Nothing here is loaded from a CDN. Files are committed as built; regenerate them with `tools/vendor/vendor.mjs` (see the end of this file), never by hand.

| Library | Version | Licence | Source | Files |
|---|---|---|---|---|
| GSAP | 3.13.0 | GreenSock Standard "no charge" licence, https://gsap.com/standard-license | npm `gsap@3.13.0`, `dist/gsap.min.js` | `gsap-3.13.0.min.js` |
| GSAP ScrollTrigger | 3.13.0 (same release as GSAP) | as GSAP | npm `gsap@3.13.0`, `dist/ScrollTrigger.min.js` | `ScrollTrigger-3.13.0.min.js` |
| Lenis | 1.3.27 | MIT, `LICENSE-lenis-MIT.txt` | npm `lenis@1.3.27`, `dist/lenis.min.js` (self-contained build, sets `window.Lenis`) | `lenis-1.3.27.min.js` |
| Three.js | r186 (npm `three@0.186.1`) | MIT, `three-r186/LICENSE.txt` | npm `three@0.186.1`: `build/three.module.js` (tree-shaken into `three.min.js`), `examples/jsm/*` | `three-r186/` |

The GSAP licence text is not bundled in the npm package; its header comment and the link above are the record. Check the terms again before launch, since the licence is GreenSock's, not ours to restate here.

## How each file differs from upstream

- **GSAP**: unmodified. The copy already in the repo was checked byte for byte against the npm package when ScrollTrigger was added, so the two are guaranteed to be the same release.
- **ScrollTrigger, Lenis**: unmodified except that the trailing `//# sourceMappingURL=` comment is removed, because we do not ship `.map` files and DevTools would otherwise request one that 404s.
- **Three.js**: r186 ships no `.min.js`, so the script builds one. esbuild bundles `build/three.module.js` into a single `three.min.js` (`minify`, `treeShaking`, ESM, `@license` comments kept) that exports only the classes the scene needs: every `THREE.Name` used in `assets/js/scene/*.js`, plus every name the vendored addons import from `three`. Export names are unchanged. The addons are minified one by one, and in each the bare specifier `'three'` becomes a relative path to `three.min.js` (for example `../../three.min.js`). Bare specifiers need an import map, and an inline import map would break `script-src 'self'`. The script fails the run if any bare specifier survives.
  - If a scene file starts using a Three class that is not in the bundle, the import fails at load and the page falls back to the stills. Rerun the script after adding one; the smoke suite's live-scene checks catch it.

## Three.js layout

```
three-r186/
  three.min.js              tree-shaken core and renderer (536 KB raw, 133.5 KB gzip)
  addons/                   from examples/jsm, same sub-folders, same file names
    geometries/RoundedBoxGeometry.js
    environments/RoomEnvironment.js
    postprocessing/  EffectComposer, RenderPass, ShaderPass, OutputPass (+ Pass, MaskPass)
    shaders/         CopyShader, OutputShader
```

Only the addons the scene needs are included (ARCHITECTURE §4), plus the files those import. To add an addon, add its path to `ADDON_ENTRIES` in the script and rerun it.

## Size against the budget

ARCHITECTURE §12 budgets the 3D JavaScript (Three core, addons and scene modules) at 200 KB gzip, fetched after first paint. Phase 8 tree-shaking (22 Oct 2026) replaced the two full Three files (`three.core.min.js`, `three.module.min.js`; 747 KB raw) with one `three.min.js` (536 KB raw), cutting the Three.js transfer by about 30%. Best-case sizes, computed locally:

| | raw KB | gzip-9 KB | Brotli-11 KB |
|---|---|---|---|
| Three.js bundle and addons (11 files) | 550.3 | 138.8 | 115.5 |
| Scene modules, `assets/js/scene/` (12 files, including the Low-path `stills.js` and the lazy `frames.js`) | 68.9 | 26.9 | 23.1 |
| **All 3D JavaScript** | 619.2 | **165.7** | **138.6** |

That is under the 200 KB budget on gzip as well as Brotli, with room to spare. Before tree-shaking, the deployed preview measured 206.6 KB Brotli (21 Oct 2026, `accept-encoding: br`), 6.6 KB over; the post-change deployed figure is recorded in LOG.md. It is fetched after first paint, so it does not touch the first-paint budget or LCP. `scene/frames.js` loads lazily (Work section within one viewport, screen at least 900 px), and `scene/stills.js` is the Low path only.

## Cache

Netlify serves `/assets/vendor/*` with `Cache-Control: public, max-age=31536000, immutable` (see `netlify.toml`). Version numbers are in the file and folder names, so an upgrade changes the URL.

## Regenerating

```bash
cd tools
npm install
node vendor/vendor.mjs
```

The script downloads each package into a fresh temporary folder with `npm pack --ignore-scripts`, extracts it, copies, minifies or bundles the files above and deletes the folder. Nothing from the downloaded packages is run. To upgrade, change the versions in `VERSIONS` (and `THREE_DIR` for a new Three.js release), rerun, update this README and test every scene.

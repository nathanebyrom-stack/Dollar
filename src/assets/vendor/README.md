# Vendored libraries

Third-party code, self-hosted so the CSP stays `script-src 'self'`. Nothing here is loaded from a CDN. Files are committed as built; regenerate them with `tools/vendor/vendor.mjs` (see the end of this file), never by hand.

| Library | Version | Licence | Source | Files |
|---|---|---|---|---|
| GSAP | 3.13.0 | GreenSock Standard "no charge" licence, https://gsap.com/standard-license | npm `gsap@3.13.0`, `dist/gsap.min.js` | `gsap-3.13.0.min.js` |
| GSAP ScrollTrigger | 3.13.0 (same release as GSAP) | as GSAP | npm `gsap@3.13.0`, `dist/ScrollTrigger.min.js` | `ScrollTrigger-3.13.0.min.js` |
| Lenis | 1.3.27 | MIT, `LICENSE-lenis-MIT.txt` | npm `lenis@1.3.27`, `dist/lenis.min.js` (self-contained build, sets `window.Lenis`) | `lenis-1.3.27.min.js` |
| Three.js | r186 (npm `three@0.186.1`) | MIT, `three-r186/LICENSE.txt` | npm `three@0.186.1`: `build/three.core.js`, `build/three.module.js`, `examples/jsm/*` | `three-r186/` |

The GSAP licence text is not bundled in the npm package; its header comment and the link above are the record. Check the terms again before launch, since the licence is GreenSock's, not ours to restate here.

## How each file differs from upstream

- **GSAP**: unmodified. The copy already in the repo was checked byte for byte against the npm package when ScrollTrigger was added, so the two are guaranteed to be the same release.
- **ScrollTrigger, Lenis**: unmodified except that the trailing `//# sourceMappingURL=` comment is removed, because we do not ship `.map` files and DevTools would otherwise request one that 404s.
- **Three.js**: r186 ships no `.min.js`, so each file is minified with esbuild (`minify`, ESM, no bundling, `@license` comments kept). Export names are unchanged. Two import rewrites are applied:
  1. In `three.module.min.js`, `./three.core.js` becomes `./three.core.min.js`.
  2. In every addon, the bare specifier `'three'` becomes a relative path to `three.module.min.js` (for example `../../three.module.min.js`). Bare specifiers need an import map, and an inline import map would break `script-src 'self'`. The script fails the run if any bare specifier survives.

## Three.js layout

```
three-r186/
  three.core.min.js         core classes (380 KB raw, 102 KB gzip)
  three.module.min.js       renderer and the rest (367 KB raw, 90 KB gzip)
  addons/                   from examples/jsm, same sub-folders, same file names
    geometries/RoundedBoxGeometry.js
    environments/RoomEnvironment.js
    postprocessing/  EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass (+ Pass, MaskPass)
    shaders/         CopyShader, LuminosityHighPassShader, OutputShader
```

Only the addons the scene needs are included (ARCHITECTURE §4), plus the files those import. To add an addon, add its path to `ADDON_ENTRIES` in the script and rerun it.

## Size against the budget

ARCHITECTURE §12 budgets the 3D JavaScript (Three core, addons and scene modules) at 200 KB gzip, fetched after first paint. Measured on 21 Oct 2026 for the 14 Three.js files together:

| | KB |
|---|---|
| Raw (minified) | 771.7 |
| gzip, level 9 | 200.3 |
| Brotli, level 11 (best case) | 166.5 |

So Three.js and its addons alone already use the whole 200 KB if the transfer is gzip, and leave about 33 KB for scene code if it is Brotli at level 11. Netlify serves Brotli, but its compression level is not documented, so the real transfer sits somewhere between the two. This is not settled. Before the scene modules go in, measure the transfer from the deployed preview (`curl -sH 'accept-encoding: br' -o /dev/null -w '%{size_download}'` on each file), and if it is tight, build a tree-shaken Three.js bundle holding only the classes the scene uses (still vendored and committed, still no runtime bundler).

## Cache

Netlify serves `/assets/vendor/*` with `Cache-Control: public, max-age=31536000, immutable` (see `netlify.toml`). Version numbers are in the file and folder names, so an upgrade changes the URL.

## Regenerating

```bash
cd tools
npm install
node vendor/vendor.mjs
```

The script downloads each package into a fresh temporary folder with `npm pack --ignore-scripts`, extracts it, copies or minifies the files above and deletes the folder. Nothing from the downloaded packages is run. To upgrade, change the versions in `VERSIONS` (and `THREE_DIR` for a new Three.js release), rerun, update this README and test every scene.

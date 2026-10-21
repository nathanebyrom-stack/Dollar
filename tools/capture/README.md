# Capture

`capture.mjs` records a project's live site as the scroll-through videos the Work gallery plays (ARCHITECTURE section 8, decision D8). It is a development tool: never deployed, never part of the site build.

```bash
cd tools
npm install                                  # once
brew install ffmpeg                          # once; the script needs ffmpeg and ffprobe on the PATH
npx playwright-core install ffmpeg           # once; Playwright's own small recorder build (about 1.4 MB)
node capture/capture.mjs fluid-process-uk
```

What it does, per viewport in `projects.json` (desktop 1440 x 900, phone 390 x 844 at 2x):

1. Opens the page in Chromium with video recording, waits for the network and fonts to settle.
2. **Stops if a cookie or consent banner is showing.** It never clicks anything on the site: dismissing a banner on the owner's behalf is not its call. Decide with Nathan what to do, then run it again.
   It also **stops if Netlify's "Powered by Netlify" badge is on the page** (it would be in the footage, and on a phone it can cover a button). Turn the badge off for that site in Netlify and run again, or pass `--allow-badge` to record anyway.
3. Holds 1 s, scrolls smoothly from the top over `scrollSeconds` (10), holds 1 s. Very tall pages are capped at `maxScreens` viewport heights so the scroll never races.
4. ffmpeg trims to that, then encodes `desktop.mp4` / `desktop.webm` (and `phone.*`): H.264 with faststart and VP9, 30 fps, no audio, scaled to `encodeWidth`. Each file must be **2.5 MB or less**: the script raises the CRF until it fits and fails loudly if it cannot.
5. Writes `poster-<viewport>.jpg` and `.avif` from the first meaningful frame.
6. Notes the capture in `src/assets/work/<project>/ASSETS.md` and updates that project's `media` entry in `src/assets/work/projects.json`. The Work cards and the 3D gallery pick the clips up on the next build: a desktop clip becomes a browser frame, a phone clip a phone frame in front of it.

Options: `--viewports desktop` (one size), `--url <url>` (try any URL), `--out <dir>` (write elsewhere), `--no-manifest` (leave projects.json alone), `--allow-badge` (record even with the Netlify badge showing). For example, to try it on a local copy of this site without touching the repo: `node capture/capture.mjs test --url http://127.0.0.1:8080/ --out /tmp/try --no-manifest`.

## What is not built yet

- **The ROI calculator clip (decision D5).** It needs a scripted interaction with the Fluid Process UK calculator, typing round, obviously example inputs, with a visible "Example inputs" label and no saving figure quoted as a result. That needs the calculator's actual fields, so it is added once they are confirmed with Nathan or Anna.
- **The steel-blue design-system detail** for Fluid Process UK needs the tokens or a screenshot from Nathan or Anna.

Moss & Memory is never re-captured: its clip comes from Nathan's own recording (see its `ASSETS.md`). AOE Engineering waits for a new-build preview.

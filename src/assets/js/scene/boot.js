/* Entry point for pages with a 3D scene (<body data-scene="...">). Tiny on purpose: it decides the quality tier
   (tier.js, synchronous) and then either
     - High or Mid: waits for the page to load and the browser to go idle, then dynamically imports the heavy stage
       module. The pre-rendered still is already on screen, so nothing waits for this.
     - Low (reduced motion, no WebGL, a software renderer, save-data, a weak device): never loads 3D. stills.js shows
       the pre-rendered stills and changes face with a crossfade.
   If the live scene cannot start, or gives up later (lost context, shader failure, slow frames), the page falls back
   to the same stills. Text and layout never wait for any of it. */
import { detectTier } from './tier.js';

const scene = document.body.dataset.scene;

function showStills() {
  import('./stills.js')
    .then((m) => m.start({ scene }))
    .catch((err) => console.error('Scene: pre-rendered stills could not start', err));
}

if (scene) {
  const params = new URLSearchParams(location.search);
  const still = params.get('still');

  if (still) {
    // Development only: render one face on a transparent canvas for tools/stills/render-stills.mjs.
    import('./stage.js').then((m) => m.start({ tier: 'high', forced: true, scene, still }))
      .catch((err) => console.error('Scene: still render failed', err));
  } else {
    const { tier, forced, reason } = detectTier();
    document.documentElement.dataset.tier = tier;

    if (tier === 'low') {
      showStills();
    } else {
      const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise((r) => addEventListener('load', r, { once: true }));
      const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 1500 }) : setTimeout(r, 200)));

      loaded.then(idle).then(async () => {
        try {
          const stage = await import('./stage.js');
          await stage.start({ tier, forced, scene, onLow: showStills });
        } catch (err) {
          // No retry: one message, and the stills carry the page.
          document.documentElement.dataset.tier = 'low';
          console.error(`Scene: could not start (${reason})`, err);
          showStills();
        }
      });
    }
  }
}

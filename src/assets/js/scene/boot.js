/* Entry point for pages with a 3D scene (<body data-scene="...">). Tiny on purpose: it decides the quality tier
   (tier.js, synchronous) and, only if the tier is High or Mid, waits for the page to load and the browser to go
   idle before dynamically importing the heavy stage module. Text and layout never wait for any of this.
   Low tier (including reduced motion and no WebGL) does nothing: the page is its HTML. */
import { detectTier } from './tier.js';

const scene = document.body.dataset.scene;

if (scene) {
  const { tier, forced, reason } = detectTier();
  document.documentElement.dataset.tier = tier;

  if (tier !== 'low') {
    const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise((r) => addEventListener('load', r, { once: true }));
    const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 1500 }) : setTimeout(r, 200)));

    loaded.then(idle).then(async () => {
      try {
        const stage = await import('./stage.js');
        await stage.start({ tier, forced, scene });
      } catch (err) {
        // Stay on the plain page: no retry, one message.
        document.documentElement.dataset.tier = 'low';
        console.error(`Scene: could not start (${reason})`, err);
      }
    });
  }
}

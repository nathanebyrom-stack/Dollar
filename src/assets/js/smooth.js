/* 34 Automation — smooth scroll: Lenis driven by GSAP's ticker, kept in step with ScrollTrigger.
   Needs gsap, ScrollTrigger, lenis, then motion.js, to be loaded first (all use defer, in that order).

   - Off under prefers-reduced-motion: Lenis is never created, so scroll stays native. If the OS setting
     changes while the page is open, Lenis is destroyed or created to match (Motion.onChange).
   - Touch devices keep native scrolling (Lenis syncTouch is off by default), so no scroll-jacking on phones.
   - In-page anchors are left to the browser (Lenis `anchors` is off) so the skip link still moves focus to <main>.
   - Scene code reads the instance from window.__lenis (null when smooth scroll is off). */
(function () {
  'use strict';

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  var Lenis = window.Lenis;
  var Motion = window.Motion;

  if (!gsap || !ScrollTrigger) return; // a library failed to load: the page still scrolls natively
  gsap.registerPlugin(ScrollTrigger);

  var lenis = null;

  function raf(time) {
    // GSAP's ticker time is in seconds; Lenis wants milliseconds.
    if (lenis) lenis.raf(time * 1000);
  }

  function start() {
    if (lenis || !Lenis || (Motion && Motion.reduced)) return;
    lenis = new Lenis({ autoRaf: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0); // let Lenis do the smoothing; GSAP must not compensate for dropped frames
    window.__lenis = lenis;
  }

  function stop() {
    if (!lenis) return;
    gsap.ticker.remove(raf);
    gsap.ticker.lagSmoothing(500, 33); // GSAP's defaults
    lenis.destroy();
    lenis = null;
    window.__lenis = null;
    ScrollTrigger.refresh();
  }

  window.__lenis = null;
  start();

  if (Motion) {
    Motion.onChange(function (reduced) {
      if (reduced) stop();
      else start();
    });
  }
})();

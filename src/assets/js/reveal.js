/* 34 Automation — site-wide scroll-and-reveal (decision D13). Every page tells its story as you move down it:
   a section's content rises into place as it enters the view, with the same machined weight as the hero (no
   bounce, short travel, a firm ease), and case-study media settles from a touch wider with a slow parallax
   drift while it crosses the screen.

   What it never touches: the Home scroll scenes and the graph sections (their own timelines own them), the
   Privacy prose (legal text should simply be there), the header and footer, and the no-JS page (this script
   not running IS the fallback — the CSS shows everything). Under reduced motion nothing is hidden and nothing
   moves, including when the OS setting flips mid-visit. Reveals animate transform and opacity only, so every
   element stays in the accessibility tree and keyboard order throughout; they are one-shot entrances, not
   continuous movement, so D12's "Pause motion" control rightly leaves them alone.
   Needs gsap, ScrollTrigger and motion.js loaded first (all deferred, in order). */
(function () {
  'use strict';

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  var Motion = window.Motion;
  if (!gsap || !ScrollTrigger) return;

  // Sections with their own scroll machinery, and the legal prose, are not ours.
  var SKIP = '.scene-hero, .scene-services, .scene-work, .scene-graph, .prose';
  var context = null;

  function build() {
    if (context) { context.revert(); context = null; }
    if (Motion && Motion.reduced) return; // everything visible, nothing moves

    context = gsap.context(function () {
      var sections = [].filter.call(document.querySelectorAll('main section'), function (s) {
        return !s.matches(SKIP) && !s.closest(SKIP);
      });

      sections.forEach(function (section) {
        var items = [].filter.call(section.children, function (el) {
          return el.tagName !== 'SCRIPT' && el.tagName !== 'TEMPLATE';
        });
        if (!items.length) return;
        gsap.fromTo(items,
          { opacity: 0, y: 18 },
          {
            opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.09,
            clearProps: 'opacity,transform', // a finished reveal leaves no inline styles behind
            scrollTrigger: { trigger: section, start: 'top 88%', once: true },
          });
      });

      // Case-study media: settles from a touch wider as it reveals, then drifts slowly while crossing the screen.
      [].forEach.call(document.querySelectorAll('.case .work-card__media, .case .case-media'), function (media) {
        var section = media.closest('section') || media;
        if (section.matches(SKIP) || section.closest(SKIP)) return;
        gsap.fromTo(media, { scale: 1.03 }, {
          scale: 1, duration: 1.1, ease: 'power2.out',
          scrollTrigger: { trigger: media, start: 'top 88%', once: true },
        });
        gsap.fromTo(media, { yPercent: 2.5 }, {
          yPercent: -2.5, ease: 'none',
          scrollTrigger: { trigger: media, start: 'top bottom', end: 'bottom top', scrub: true },
        });
      });

      ScrollTrigger.refresh();
    });
  }

  build();
  if (Motion && Motion.onChange) Motion.onChange(build);
})();

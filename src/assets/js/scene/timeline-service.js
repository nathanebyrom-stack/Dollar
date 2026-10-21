/* Service-page scroll timelines (ARCHITECTURE section 7). The die rests showing the service's own face (stage.js sets
   the roll and glow); there are no rolls and no gallery. A short dolly and a gentle drift of the camera round it let
   the light slide across the metal while the hero text scrolls, and the die fades as the hero leaves.
   Like the Home timelines, every tween is a fromTo with immediateRender: false and each timeline owns its properties. */

export function buildServiceTimeline({ state, tier }) {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const hero = document.getElementById('scene-hero');
  if (!gsap || !ScrollTrigger || !hero) return null;

  const scrub = tier === 'high' ? 1 : true;
  const from = { immediateRender: false };

  const context = gsap.context(() => {
    // 60vh of scroll: a short dolly in, and the camera drifts about 30 degrees round (the die turns with it, so the
    // face stays square to the viewer while the lights, fixed in the world, move across the metal).
    gsap.timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: '+=60%', scrub } })
      .fromTo(state, { scrollDolly: 1 }, { scrollDolly: 0.88, duration: 1, ease: 'none', ...from }, 0)
      .fromTo(state, { azHero: 0 }, { azHero: 0.5, duration: 1, ease: 'none', ...from }, 0);

    // The die leaves as the hero scrolls away.
    gsap.fromTo(state, { fade: 0 }, {
      fade: 1, ease: 'none', ...from,
      scrollTrigger: { trigger: hero, start: 'bottom 70%', end: 'bottom 10%', scrub },
    });
  });

  ScrollTrigger.refresh();
  return context;
}

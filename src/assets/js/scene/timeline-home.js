/* Home scroll timelines (ARCHITECTURE section 7). Each one tweens the stage's plain `state` object, never the
   3D objects, and every tween is a fromTo with immediateRender: false, so the values are the same whatever order
   the sections are reached in (a restored scroll position, a jump to #services, a resize).

   Scenes here: 1 Hero (camera dolly and the first half of the orbit), 2 Services (pinned: the second half of the
   orbit, the die turns to face the camera, then three quarter-turn rolls with a text panel for each), and the
   die's hand-off at 3 Work. Scene 0 (Arrival) is time-based and lives in stage.js. */

const QUARTER = Math.PI / 2;

export function buildHomeTimelines({ state, tier }) {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const hero = document.getElementById('scene-hero');
  const services = document.getElementById('scene-services');
  const work = document.getElementById('scene-work');
  if (!gsap || !ScrollTrigger || !hero || !services) return null;

  // One context owns every tween and ScrollTrigger below, so stage.js can revert them all if the live scene is abandoned.
  const context = gsap.context(() => {
    const scrub = tier === 'high' ? 1 : true;
    const from = { immediateRender: false };

    /* Scene 1: Hero. 120vh, no pin. Dolly in about 15% and orbit 0 -> 90 degrees. */
    gsap.timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub } })
      .fromTo(state, { azHero: 0 }, { azHero: QUARTER, ease: 'none', ...from }, 0)
      .fromTo(state, { scrollDolly: 1 }, { scrollDolly: 0.85, ease: 'none', ...from }, 0);

    /* Scene 2: Services. Pinned for 300vh. Times are in arbitrary units on a 10-unit timeline:
         0-1.5   the die turns to face the camera ("34" forward), settling like a part on a fixture
         2-3.5   roll 1: Web design     4.5-6   roll 2: Marketing     7-8.5   roll 3: Workflow automation
       Each roll is a quarter-turn, then a hold; the matching panel slides in as its face seats. */
    const panels = [...services.querySelectorAll('.service-panel')];
    const tl = gsap.timeline({
      scrollTrigger: { trigger: services, start: 'top top', end: '+=300%', pin: true, anticipatePin: 1, invalidateOnRefresh: true, scrub },
    });
    tl.fromTo(state, { azPin: 0 }, { azPin: QUARTER, duration: 10, ease: 'none', ...from }, 0)
      .fromTo(state, { yawMix: 0 }, { yawMix: 1, duration: 1.5, ease: 'power3.inOut', ...from }, 0)
      .fromTo(state, { shift: 0 }, { shift: 1, duration: 2, ease: 'power2.inOut', ...from }, 0);

    const faces = ['front', 'top', 'back', 'bottom'];
    [2, 4.5, 7].forEach((at, i) => {
      const leaving = faces[i];
      const arriving = faces[i + 1];
      tl.fromTo(state, { roll: i }, { roll: i + 1, duration: 1.5, ease: 'power3.inOut', ...from }, at)
        .fromTo(state.glow, { [leaving]: 1 }, { [leaving]: 0, duration: 0.8, ease: 'power2.out', ...from }, at)
        .fromTo(state.glow, { [arriving]: 0 }, { [arriving]: 1, duration: 0.9, ease: 'power2.out', ...from }, at + 0.9);
    });

    // Panels: each is hidden by CSS under .scene-on and slides in from the left as its face arrives.
    [[3.0, 4.3], [5.4, 6.9], [8.0, null]].forEach(([inAt, outAt], i) => {
      const panel = panels[i];
      if (!panel) return;
      tl.fromTo(panel, { autoAlpha: 0, x: -24 }, { autoAlpha: 1, x: 0, duration: 0.8, ease: 'power3.out', ...from }, inAt);
      if (outAt !== null) tl.to(panel, { autoAlpha: 0, x: -24, duration: 0.6, ease: 'power2.in' }, outAt);
    });

    /* Scene 3: the die hands over to the Work section: shrinks and fades as it arrives. */
    if (work) {
      gsap.fromTo(state, { fade: 0 }, {
        fade: 1, ease: 'none', ...from,
        scrollTrigger: { trigger: work, start: 'top 85%', end: 'top 25%', scrub },
      });
    }

  });

  ScrollTrigger.refresh();
  return context;
}

/* Scene 3: the Work gallery, desktop only (D3: under 900 px the cards stay a plain vertical list). The section pins and
   the row of cards travels right to left; the 3D frames follow the cards (frames.js). Called by stage.js once the
   gallery module is ready. Returns a gsap.matchMedia: reverting it removes the pin and the gallery-3d class. */
export function buildWorkGallery({ gallery, tier }) {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const section = document.getElementById('scene-work');
  const list = section && section.querySelector('.work-list');
  if (!gsap || !ScrollTrigger || !list) return null;
  const root = document.documentElement;
  const cards = [...list.querySelectorAll('.work-card')];
  const scrub = tier === 'high' ? 1 : true;
  let trigger = null;

  const pad = () => { const cs = getComputedStyle(section); return (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0); };
  const travel = () => Math.max(0, list.scrollWidth - (section.clientWidth - pad()));

  // A pinned, translated track cannot rely on the browser's own scroll-into-view, so when keyboard focus reaches a card
  // that is off screen, move the page to where that card is in view.
  function reveal(event) {
    if (!trigger) return;
    const card = event.target.closest && event.target.closest('.work-card');
    if (!card) return;
    const distance = travel();
    if (!distance) return;
    const progress = Math.min(1, Math.max(0, card.offsetLeft / distance));
    const y = trigger.start + progress * (trigger.end - trigger.start);
    if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true }); else window.scrollTo(0, y);
  }

  const mm = gsap.matchMedia();
  mm.add('(min-width: 900px)', () => {
    root.classList.add('gallery-3d');
    gallery.setActive(true);
    list.addEventListener('focusin', reveal);
    const tween = gsap.to(list, {
      x: () => -travel(), ease: 'none',
      scrollTrigger: { trigger: section, start: 'top top', end: () => `+=${cards.length * 0.8 * innerHeight}`, pin: true, anticipatePin: 1, invalidateOnRefresh: true, scrub },
    });
    trigger = tween.scrollTrigger;
    ScrollTrigger.refresh();
    return () => {
      list.removeEventListener('focusin', reveal);
      root.classList.remove('gallery-3d');
      gallery.setActive(false);
      trigger = null;
    };
  });
  return mm;
}

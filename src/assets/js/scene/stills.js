/* The Low path: the page with pre-rendered stills of the die instead of live 3D (ARCHITECTURE section 6).
   Used when the tier is Low (no WebGL, a software renderer, save-data, a weak device), under prefers-reduced-motion,
   and as the fallback when the live scene cannot start or gives up (lost context, shader failure, slow frames).

   The stills sit in the same `.die-frame` that positions the live die, so nothing moves when one replaces the other.
   There is no orbit and no roll: the die face changes with a plain crossfade (CSS opacity, scenes.css).

   - Low, normal motion: Services is pinned as on the live page, and scrolling steps through the faces.
   - Reduced motion: nothing is pinned, scrubbed or moved. Services is an ordinary list; each face crossfades in as its
     panel passes the middle of the screen (end states only, ARCHITECTURE section 13). */

const FACES = ['34', 'web-design', 'marketing', 'workflow-automation'];
const SIZES = '(min-width: 900px) min(76vh, 52vw), min(54vh, 112vw)';
const html = document.documentElement;

// The page only ships the "34" still; the other three are added here, so visitors on the live scene never fetch them.
function ensureStills(frame) {
  const path = frame.dataset.diePath;
  for (const face of FACES) {
    if (frame.querySelector(`[data-face="${face}"]`)) continue;
    const picture = document.createElement('picture');
    picture.className = 'die-still';
    picture.dataset.face = face;
    const source = document.createElement('source');
    source.type = 'image/avif';
    source.srcset = `${path}${face}-800.avif 800w, ${path}${face}-1600.avif 1600w`;
    source.sizes = SIZES;
    const img = new Image();
    img.srcset = `${path}${face}-800.webp 800w, ${path}${face}-1600.webp 1600w`;
    img.src = `${path}${face}-1600.webp`;
    img.sizes = SIZES;
    img.width = img.height = 1600;
    img.alt = '';
    img.decoding = 'async';
    picture.append(source, img);
    frame.append(picture);
  }
}

// Which scroll step (0 = the "34" face, 1-3 = the services) a progress through the pinned section falls in.
// The boundaries match where the live rolls seat their faces (timeline-home.js).
const stepFor = (p) => (p < 0.22 ? 0 : p < 0.47 ? 1 : p < 0.72 ? 2 : 3);

export function start({ scene }) {
  const frame = document.querySelector('.die-frame');
  if (!frame) return null;
  const reduced = window.Motion ? window.Motion.reduced : matchMedia('(prefers-reduced-motion: reduce)').matches;

  html.classList.remove('scene-live');
  html.classList.add('scene-still');

  if (scene !== 'home') {
    // A service page: its own still is already in the page (the die's face for that service), so nothing is fetched or
    // stepped. The die just fades away as the hero scrolls out, with or without pinning, so no text sits over it.
    const hero = document.getElementById('scene-hero');
    let io = null;
    if (hero) {
      // The root's top edge sits 40% down the screen, so the hero stops "intersecting" once its bottom passes that line.
      io = new IntersectionObserver((entries) => {
        frame.classList.toggle('is-away', entries.some((e) => !e.isIntersecting && e.boundingClientRect.bottom <= innerHeight * 0.4 + 1));
      }, { threshold: [0, 0.01], rootMargin: '-40% 0px 0px 0px' });
      io.observe(hero);
    }
    return { stop() { if (io) io.disconnect(); html.classList.remove('scene-still'); } };
  }

  ensureStills(frame);

  const stills = new Map([...frame.querySelectorAll('.die-still')].map((el) => [el.dataset.face, el]));
  const hero = document.getElementById('scene-hero');
  const services = document.getElementById('scene-services');
  const work = document.getElementById('scene-work');
  const panels = services ? [...services.querySelectorAll('.service-panel')] : [];
  let step = -1;

  function setStep(next) {
    if (next === step) return;
    step = next;
    stills.forEach((el, face) => el.classList.toggle('is-active', face === FACES[next]));
    panels.forEach((p, i) => p.classList.toggle('is-active', i === next - 1));
  }
  setStep(0);

  const away = (on) => frame.classList.toggle('is-away', on);
  const inServices = (on) => frame.classList.toggle('is-services', on);
  const cleanups = [];

  if (!reduced && window.gsap && window.ScrollTrigger && hero && services) {
    // Pinned, as on the live page: scroll steps through the faces and their panels.
    window.gsap.registerPlugin(window.ScrollTrigger);
    html.classList.add('scene-on');
    let pin = null;
    const context = window.gsap.context(() => {
      pin = window.ScrollTrigger.create({
        trigger: services, start: 'top top', end: '+=300%', pin: true, anticipatePin: 1,
        onUpdate: (self) => setStep(stepFor(self.progress)),
      });
      window.ScrollTrigger.create({ trigger: services, start: 'top 60%', onEnter: () => inServices(true), onLeaveBack: () => inServices(false) });
      if (work) window.ScrollTrigger.create({ trigger: work, start: 'top 80%', onEnter: () => away(true), onLeaveBack: () => away(false) });
    });
    // Every panel stays focusable (scenes.css): focusing one moves the page to the step that shows it (the middle of each step).
    const MID = [0.35, 0.6, 0.87];
    const reveal = (event) => {
      const i = panels.findIndex((p) => p.contains(event.target));
      if (i === -1 || !pin) return;
      const y = pin.start + MID[i] * (pin.end - pin.start);
      if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true }); else window.scrollTo(0, y);
    };
    services.addEventListener('focusin', reveal);
    window.ScrollTrigger.refresh();
    cleanups.push(() => { services.removeEventListener('focusin', reveal); context.revert(); html.classList.remove('scene-on'); });
  } else {
    // Reduced motion (or no GSAP): a thin band across the middle of the screen picks the face. Nothing scrubs or moves.
    const band = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        if (e.target === hero) setStep(0);
        else setStep(panels.indexOf(e.target) + 1);
      }
    }, { rootMargin: '-45% 0px -45% 0px' });
    if (hero) band.observe(hero);
    panels.forEach((p) => band.observe(p));

    const edges = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === services) inServices(e.isIntersecting || e.boundingClientRect.top < 0);
        if (e.target === work) away(e.isIntersecting || e.boundingClientRect.top < 0);
      }
    }, { rootMargin: '0px 0px -40% 0px' });
    if (services) edges.observe(services);
    if (work) edges.observe(work);
    cleanups.push(() => { band.disconnect(); edges.disconnect(); });
  }

  return {
    stop() {
      cleanups.forEach((fn) => fn());
      html.classList.remove('scene-still');
    },
  };
}

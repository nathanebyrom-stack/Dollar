/* The Work gallery's 3D frames (ARCHITECTURE sections 5, 6, 7). Loaded lazily by stage.js when the Work section is
   within one viewport of the screen. Desktop only (>= 900 px); below that the cards are a plain list (D3).

   Each Work card has a media box in the page (.work-card__media). A 3D frame is drawn exactly behind that box: the
   frame follows the box's rectangle every frame, so the cards stay the real, focusable, clickable HTML (the whole card
   is a link) and the scroll travel is just the cards moving. Frames lean up to 6 degrees toward the pointer and
   brighten when their card has keyboard focus.

   Colour: the frame bodies are lit like the die and tone mapped with it. The screens must show the video's own
   colours, so they are drawn separately:
     Mid   the renderer tone maps per material, so a screen is a MeshBasicMaterial with toneMapped: false
     High  everything goes through one tone-mapping pass, so the screens are drawn after it (post.js), as raw display
           values: their textures are left as NoColorSpace so nothing decodes or re-encodes them
   That is why the gallery owns two small scenes (bodies, screens) with identical transforms.

   Video: at most two videos play at once (the frames nearest the middle of the screen); the rest pause and show their
   poster. A video far from the screen has its source released, to free decoder and GPU memory on phones. Every
   <video> is muted, looping, inline and preload="none". */
import * as THREE from '../../vendor/three-r186/three.min.js';
import { RoundedBoxGeometry } from '../../vendor/three-r186/addons/geometries/RoundedBoxGeometry.js';

const CAMERA_DISTANCE = 12;
const TAN_HALF_FOV = Math.tan(15 * Math.PI / 180);
const TILT_MAX = 6 * Math.PI / 180;
const MAX_PLAYING = 2;
const BEZEL = 0.035;     // how far the frame body extends past the screen, as a share of the screen width
const THICKNESS = 0.05;  // body depth, as a share of the screen width
const PANEL = [0x14 / 255, 0x17 / 255, 0x1c / 255]; // the confirmed Panel colour, for screens with no media yet

export function createGallery({ environment, tier, anisotropy, container, cards }) {
  const rawScreens = tier === 'high'; // see the header comment
  const bodies = new THREE.Scene();
  const screens = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_DISTANCE);

  bodies.environment = environment;
  bodies.environmentIntensity = 0.42;
  const key = new THREE.DirectionalLight(0xdce6f5, 1.9);
  key.position.set(-3.4, 3.6, 8);
  bodies.add(key, new THREE.HemisphereLight(0xaeb6c2, 0x0c0e11, 0.14));

  const screenColour = (rgb) => (rawScreens ? new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace) : new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace));
  const loader = new THREE.TextureLoader();
  const colourSpace = rawScreens ? THREE.NoColorSpace : THREE.SRGBColorSpace;

  const occluderMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
  let active = false;
  let width = 1;
  let height = 1;
  let unit = 1; // world units per CSS pixel on the z = 0 plane
  const pointer = { x: -9999, y: -9999, fine: matchMedia('(pointer: fine)').matches };
  const onMove = (e) => { pointer.x = e.clientX; pointer.y = e.clientY; };
  if (pointer.fine) addEventListener('pointermove', onMove, { passive: true });

  /* ---- Frames ---- */
  // One frame per media box: a card with a desktop and a phone recording gets a browser frame and a phone frame.
  const boxes = cards.flatMap((card) => [...card.querySelectorAll('.work-card__media')].map((media) => ({ card, media })));
  const frames = boxes.map(({ card, media }, index) => {
    const video = media.querySelector('.work-card__video');
    const frame = {
      card, media, video, index,
      kind: media.dataset.kind || 'desktop',
      bodyGroup: new THREE.Group(), screenGroup: new THREE.Group(),
      body: null, w: 0, h: 0, tiltX: 0, tiltY: 0, glow: 0, focus: false, playing: false,
      posterTexture: null, videoTexture: null,
    };
    frame.bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2f343b, metalness: 0.92, roughness: 0.46, emissive: 0xf2f5fa, emissiveIntensity: 0 });
    frame.screenMaterial = new THREE.MeshBasicMaterial({ color: screenColour(PANEL), toneMapped: false });
    frame.screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), frame.screenMaterial);
    frame.screenGroup.add(frame.screen);
    // Screens are drawn in a later pass that knows nothing about the bodies (on High, after tone mapping), so each
    // body also leaves a depth-only copy here: a phone frame in front of a browser frame hides the screen behind it.
    frame.occluder = new THREE.Mesh(undefined, occluderMaterial);
    frame.occluder.renderOrder = -1;
    frame.screenGroup.add(frame.occluder);
    frame.bodyGroup.visible = frame.screenGroup.visible = false;
    bodies.add(frame.bodyGroup);
    screens.add(frame.screenGroup);

    if (video && video.getAttribute('poster')) {
      loader.load(video.getAttribute('poster'), (t) => {
        t.colorSpace = colourSpace; t.anisotropy = anisotropy; frame.posterTexture = t;
        if (!frame.playing) showTexture(frame, t);
      });
    }
    if (video) {
      frame.videoTexture = new THREE.VideoTexture(video);
      frame.videoTexture.colorSpace = colourSpace;
      video.addEventListener('playing', () => { frame.playing = true; showTexture(frame, frame.videoTexture); });
      video.addEventListener('emptied', () => { frame.playing = false; if (frame.posterTexture) showTexture(frame, frame.posterTexture); });
    }
    card.addEventListener('focusin', () => { frame.focus = true; });
    card.addEventListener('focusout', () => { frame.focus = false; });
    return frame;
  });

  function showTexture(frame, texture) {
    frame.screenMaterial.map = texture;
    frame.screenMaterial.color.set(0xffffff);
    frame.screenMaterial.needsUpdate = true;
  }

  // The body is a rounded slab sized from the screen; rebuilt only when the screen's size actually changes.
  function buildBody(frame, w, h) {
    if (frame.body) { frame.bodyGroup.remove(frame.body); frame.body.geometry.dispose(); }
    const m = w * BEZEL;
    const depth = w * THICKNESS;
    const radius = Math.min(w * (frame.kind === 'phone' ? 0.09 : 0.03), depth * 0.9);
    const geometry = new RoundedBoxGeometry(w + 2 * m, h + 2 * m, depth, 3, radius);
    frame.body = new THREE.Mesh(geometry, frame.bodyMaterial);
    frame.body.position.z = -depth / 2 - 0.0005 * w; // the screen sits just in front of the slab's face
    frame.bodyGroup.add(frame.body);
    frame.occluder.geometry = geometry; // shared with the body, so it is disposed with it
    frame.occluder.position.copy(frame.body.position);
    frame.screen.scale.set(w, h, 1);
    frame.w = w; frame.h = h;
  }

  /* ---- Video: nearest two play, the rest pause, the far ones let go ---- */
  function source(video) {
    const webm = video.dataset.webm;
    const mp4 = video.dataset.mp4;
    return webm && video.canPlayType('video/webm; codecs="vp9"') ? webm : mp4 || webm;
  }
  function play(frame) {
    const v = frame.video;
    if (v.hasAttribute('data-user-paused')) return; // the person paused it (work-cards.js): leave it paused
    if (!v.getAttribute('src')) { v.src = source(v); v.load(); }
    const p = v.play();
    if (p && p.catch) p.catch(() => { /* refused: the poster stays */ });
  }
  function pause(frame) { if (frame.video) frame.video.pause(); }
  function release(frame) {
    if (!frame.video) return;
    frame.video.pause();
    if (frame.video.getAttribute('src')) { frame.video.removeAttribute('src'); frame.video.load(); }
  }

  function manageVideo(rects) {
    const candidates = [];
    frames.forEach((f, i) => {
      if (!f.video) return;
      const r = rects[i];
      const centre = r.left + r.width / 2;
      const away = Math.abs(centre - width / 2);
      if (r.right > 0 && r.left < width) candidates.push({ f, away });
      else if (away > width * 1.5) release(f);
      else pause(f);
    });
    candidates.sort((a, b) => a.away - b.away);
    candidates.forEach(({ f }, n) => (n < MAX_PLAYING ? play(f) : pause(f)));
  }

  const onVisibility = () => { if (document.hidden) frames.forEach(pause); };
  document.addEventListener('visibilitychange', onVisibility);

  /* ---- Per frame ---- */
  function resize() {
    width = container.clientWidth;
    height = container.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    unit = 2 * CAMERA_DISTANCE * TAN_HALF_FOV / height;
  }

  function update(t, dt) {
    if (!active) return;
    const rects = frames.map((f) => f.media.getBoundingClientRect());
    manageVideo(rects);
    const k = Math.min(1, dt * 6);

    frames.forEach((f, i) => {
      const r = rects[i];
      const on = r.right > -80 && r.left < width + 80 && r.width > 0;
      f.bodyGroup.visible = f.screenGroup.visible = on;
      if (!on) return;
      // A phone frame floats in front of its browser frame, which magnifies it. Scale size and position back by the
      // same factor so its screen still lands exactly on its box in the page.
      const w0 = r.width * unit;
      const z = f.kind === 'phone' ? w0 * 0.9 : 0;
      const k = (CAMERA_DISTANCE - z) / CAMERA_DISTANCE;
      const w = w0 * k;
      const h = r.height * unit * k;
      if (!f.body || Math.abs(w - f.w) > 1e-4 || Math.abs(h - f.h) > 1e-4) buildBody(f, w, h);

      // Lean toward the pointer while it is near this frame.
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (pointer.x - cx) / (r.width * 0.9);
      const dy = (pointer.y - cy) / (r.height * 0.9);
      const near = pointer.fine && Math.abs(dx) < 1.4 && Math.abs(dy) < 1.4;
      const targetY = near ? Math.max(-1, Math.min(1, dx)) * TILT_MAX : 0;
      const targetX = near ? Math.max(-1, Math.min(1, dy)) * TILT_MAX : 0;
      f.tiltY += (targetY - f.tiltY) * k;
      f.tiltX += (targetX - f.tiltX) * k;
      f.glow += ((f.focus ? 1 : 0) - f.glow) * k;
      f.bodyMaterial.emissiveIntensity = f.glow * 0.18;

      const x = (cx - width / 2) * unit * k;
      const y = -(cy - height / 2) * unit * k;
      const lift = 1 + f.glow * 0.015; // a focused card's frame comes forward a touch
      // A slow float so the light keeps moving across the metal: well under a degree.
      const floatX = Math.sin(t * 0.6 + i * 1.7) * 0.004;
      const floatY = Math.sin(t * 0.5 + i * 2.3) * 0.006;
      for (const g of [f.bodyGroup, f.screenGroup]) {
        g.position.set(x, y, z);
        g.rotation.set(f.tiltX + floatX, f.tiltY + floatY, 0);
        g.scale.setScalar(lift);
      }
    });
  }

  /* Mid: draw both scenes on top of what is already there, depth cleared so the die never interferes. */
  function renderDirect(renderer) {
    if (!active) return;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(bodies, camera);
    renderer.render(screens, camera);
    renderer.autoClear = autoClear;
  }

  function setActive(on) {
    active = on;
    if (!on) { frames.forEach((f) => { f.bodyGroup.visible = f.screenGroup.visible = false; release(f); }); }
  }

  function dispose() {
    active = false;
    occluderMaterial.dispose();
    removeEventListener('pointermove', onMove);
    document.removeEventListener('visibilitychange', onVisibility);
    frames.forEach((f) => {
      release(f);
      if (f.body) f.body.geometry.dispose();
      f.bodyMaterial.dispose(); f.screenMaterial.dispose(); f.screen.geometry.dispose();
      if (f.posterTexture) f.posterTexture.dispose();
      if (f.videoTexture) f.videoTexture.dispose();
    });
  }

  resize();
  return {
    bodies, screens, camera, frames,
    get active() { return active; },
    setActive, resize, update, renderDirect, dispose,
  };
}

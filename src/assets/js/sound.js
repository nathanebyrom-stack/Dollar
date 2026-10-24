/* 34 Automation — opt-in sound design (decision D14, Nathan 24 Oct). Scene pages only, where the moments are.
   Everything is synthesised with the Web Audio API — no audio files, no licensing, the CSP untouched.

   The sounds, all quiet and machined:
     - a low workshop hum (brown-ish noise through a low-pass, with a slow swell) while sound is on
     - a soft metallic "seat" as the die settles onto each service face (Home's pinned Services scene)
     - a quieter tick as a Work card's frame crosses the middle of the screen in the pinned gallery

   OFF by default, always. A "Play sound" / "Mute sound" button (same pattern as D12's motion control: the label
   is the action it performs) sits beside "Pause motion"; the AudioContext is only created on the first press,
   which is the user gesture browsers require, so nothing can ever sound on its own (WCAG 1.4.2 is satisfied by
   construction). Session-only; nothing is stored. The hum pauses with the tab and resumes with it only if sound
   was on. The die and gallery sounds key off the live scene's state each frame; on the Low path or after a tier
   fall there is no live scene, so only the hum remains. Sound is not motion, so D12's pause and reduced motion
   leave this alone — but with reduced motion there are no rolls, so there is nothing to hear beyond the hum. */
(function () {
  'use strict';

  if (!document.body.dataset.scene) return;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  var hero = document.querySelector('.scene-hero');
  if (!hero) return;

  var ctx = null;
  var master = null;
  var hum = null;
  var on = false;
  var raf = 0;

  /* ---- Synthesis ---- */
  function start() {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    // The hum: looped brown noise, low-passed to a rumble, swelling very slowly so it never reads as a loop.
    var seconds = 4;
    var buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    var last = 0;
    for (var i = 0; i < data.length; i++) {
      var white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // brown-ish
      data[i] = last * 3.5;
    }
    // Fade the loop ends into each other so the seam is silent.
    var fade = ctx.sampleRate * 0.25;
    for (var j = 0; j < fade; j++) {
      var k = j / fade;
      data[j] *= k;
      data[data.length - 1 - j] *= k;
    }
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    var low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 110;
    var humGain = ctx.createGain();
    humGain.gain.value = 0;
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07; // one slow swell every ~14 s
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.009;
    lfo.connect(lfoGain).connect(humGain.gain);
    src.connect(low).connect(humGain).connect(master);
    src.start();
    lfo.start();
    hum = humGain;
    humTo(0.028, 1.2);
  }

  function humTo(level, seconds) {
    hum.gain.cancelScheduledValues(ctx.currentTime);
    hum.gain.setTargetAtTime(level, ctx.currentTime, seconds / 3);
  }

  // The die seating: a short, dark metallic contact — a filtered noise tap over a low partial that dies fast.
  function seat() {
    if (!on || !ctx) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(93, t);
    osc.frequency.exponentialRampToValueAtTime(61, t + 0.09);
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.11, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(og).connect(master);
    var noise = ctx.createBufferSource();
    var nb = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
    var nd = nb.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
    noise.buffer = nb;
    var band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    band.Q.value = 1.4;
    var ng = ctx.createGain();
    ng.gain.value = 0.05;
    noise.connect(band).connect(ng).connect(master);
    osc.start(t); osc.stop(t + 0.25);
    noise.start(t);
  }

  // The gallery tick: one very short, quiet band of noise, like a pawl passing a tooth.
  function tick() {
    if (!on || !ctx) return;
    var t = ctx.currentTime;
    var noise = ctx.createBufferSource();
    var nb = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate);
    var nd = nb.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
    noise.buffer = nb;
    var band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2100;
    band.Q.value = 2;
    var ng = ctx.createGain();
    ng.gain.value = 0.022;
    noise.connect(band).connect(ng).connect(master);
    noise.start(t);
  }

  /* ---- Event watching: poll the live scene's state each frame; no coupling into the timelines ---- */
  var lastRoll = null;
  var rollMoving = false;
  var cardSides = null;
  function watch() {
    raf = requestAnimationFrame(watch);
    var scene = window.__scene;
    if (!scene) return;

    // The die seats: state.roll moves between integers during a roll; play as it settles onto one.
    var roll = scene.state.roll;
    if (lastRoll === null) lastRoll = roll;
    var near = Math.abs(roll - Math.round(roll)) < 0.02;
    if (!near) rollMoving = true;
    else if (rollMoving && Math.abs(roll - lastRoll) < 0.001) { rollMoving = false; seat(); }
    lastRoll = roll;

    // Gallery ticks: a frame's centre crossing the middle of the screen.
    var gallery = scene.gallery;
    if (gallery && gallery.active) {
      var mid = innerWidth / 2;
      var sides = gallery.frames.map(function (f) {
        var r = f.media.getBoundingClientRect();
        return r.width > 0 ? (r.left + r.width / 2 > mid ? 1 : -1) : 0;
      });
      if (cardSides) {
        for (var i = 0; i < sides.length; i++) {
          if (sides[i] && cardSides[i] && sides[i] !== cardSides[i]) { tick(); break; }
        }
      }
      cardSides = sides;
    } else {
      cardSides = null;
    }
  }

  /* ---- The control ---- */
  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'motion-toggle sound-toggle';
  toggle.textContent = 'Play sound';
  toggle.addEventListener('click', function () {
    on = !on;
    toggle.textContent = on ? 'Mute sound' : 'Play sound';
    if (on) {
      if (!ctx) { start(); watch(); }
      else { ctx.resume(); humTo(0.028, 1.2); }
    } else {
      humTo(0, 0.5);
    }
  });
  hero.appendChild(toggle);

  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (on) ctx.resume();
  });

  // For the smoke suite only.
  window.__sound = { get on() { return on; }, get started() { return !!ctx; } };
})();

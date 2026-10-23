/* 34 Automation — shared motion settings.
   Durations come from tokens.css (--dur-*), so the CSS file stays the single source.
   Requires /assets/vendor/gsap-3.13.0.min.js to be loaded first (both use defer).

   Usage:
     Motion.to(el, { y: 0, opacity: 1 })              // base duration, ease "out"
     Motion.from(els, { y: 24, opacity: 0, stagger: Motion.stagger })
     if (Motion.reduced) { ...static path... }
     Motion.onChange(reduced => ...)                  // user toggles OS setting
*/
(function () {
  'use strict';

  var root = document.documentElement;
  var query = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var listeners = [];

  function readSeconds(name, fallback) {
    var raw = getComputedStyle(root).getPropertyValue(name).trim();
    if (!raw) return fallback;
    var n = parseFloat(raw);
    if (isNaN(n)) return fallback;
    return raw.slice(-2) === 'ms' ? n / 1000 : n;
  }

  // GSAP equivalents of the CSS easings in tokens.css.
  var ease = {
    out: 'power3.out',
    inOut: 'power2.inOut',
    expo: 'expo.out',
    linear: 'none'
  };

  var pauseListeners = [];

  var Motion = {
    reduced: !!(query && query.matches),
    paused: false, // the visitor pressed "Pause motion" (WCAG 2.2.2): idle drift, floats and ambient pulses stand still
    ease: ease,
    dur: {},
    stagger: 0,

    setPaused: function (on) {
      this.paused = !!on;
      root.classList.toggle('motion-paused', this.paused);
      pauseListeners.forEach(function (fn) { fn(Motion.paused); });
    },
    onPausedChange: function (fn) {
      pauseListeners.push(fn);
    },

    refresh: function () {
      this.reduced = !!(query && query.matches);
      this.dur = {
        instant: readSeconds('--dur-instant', 0.12),
        fast: readSeconds('--dur-fast', 0.2),
        base: readSeconds('--dur-base', 0.4),
        slow: readSeconds('--dur-slow', 0.8),
        cinematic: readSeconds('--dur-cinematic', 1.4)
      };
      this.stagger = readSeconds('--stagger', 0.08);
      root.classList.toggle('reduced-motion', this.reduced);
      if (window.gsap) {
        gsap.defaults({ duration: this.dur.base, ease: ease.out });
        // Reduced motion: every tween completes instantly, so end states still apply.
        gsap.globalTimeline.timeScale(this.reduced ? 1000 : 1);
      }
    },

    /* Wrappers that respect reduced motion: with it on, jump straight to the end state. */
    to: function (targets, vars) {
      if (!window.gsap) return null;
      if (this.reduced) return gsap.set(targets, strip(vars));
      return gsap.to(targets, vars);
    },
    from: function (targets, vars) {
      if (!window.gsap) return null;
      if (this.reduced) return null; // leave elements in their natural (final) state
      return gsap.from(targets, vars);
    },
    timeline: function (vars) {
      return window.gsap ? gsap.timeline(vars) : null;
    },
    onChange: function (fn) {
      listeners.push(fn);
    }
  };

  function strip(vars) {
    var out = {};
    for (var k in vars) {
      if (!/^(duration|ease|delay|stagger|repeat|yoyo|onStart|onUpdate)$/.test(k)) out[k] = vars[k];
    }
    return out;
  }

  Motion.refresh();

  /* The pause control (WCAG 2.2.2): pages with a scene carry continuous decorative movement (the die's idle drift,
     the gallery's float, the graph's ambient pulses), so they get a visible way to stop it. Added here, not in the
     markup, so it only exists where scripts run — with no JavaScript there is no movement and no button. Hidden
     under reduced motion (CSS), where nothing moves either. Session-only by design: nothing is stored. */
  if (document.body && document.body.dataset.scene) {
    var hero = document.querySelector('.scene-hero');
    if (hero) {
      // Like the Work cards' Play / Pause: the label is the action it will take, and it swaps.
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'motion-toggle';
      toggle.textContent = 'Pause motion';
      toggle.addEventListener('click', function () {
        Motion.setPaused(!Motion.paused);
        toggle.textContent = Motion.paused ? 'Play motion' : 'Pause motion';
      });
      hero.appendChild(toggle);
    }
  }

  if (query) {
    var handler = function () {
      Motion.refresh();
      listeners.forEach(function (fn) { fn(Motion.reduced); });
    };
    if (query.addEventListener) query.addEventListener('change', handler);
    else if (query.addListener) query.addListener(handler);
  }

  window.Motion = Motion;
})();

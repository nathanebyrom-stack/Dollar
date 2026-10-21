/* 34 Automation — how the Work cards' videos play when they are ordinary HTML (not the 3D gallery).
   Videos are always muted, looping, inline and decorative, and preload="none": nothing downloads until it is needed.

   Mode (on <html> as data-videos):
     tap     Low tier or reduced motion: nothing starts by itself; a Play button on the card starts that one video.
     view    otherwise, in the list layout: a card's video plays while it is mostly on screen (never more than two at once).
     (none)  html.gallery-3d is set: the 3D gallery (scene/frames.js) owns playback, so this script stands down.
   The mode is recomputed when the tier or the gallery class changes, so a fall back from 3D to the stills just works. */
(function () {
  'use strict';

  var root = document.documentElement;
  var cards = [].slice.call(document.querySelectorAll('.work-card'));
  // A card can hold two recordings (desktop and phone); they start, stop and release together.
  var items = cards.map(function (card) {
    return { card: card, medias: [].slice.call(card.querySelectorAll('.work-card__media')), videos: [].slice.call(card.querySelectorAll('.work-card__video')), play: card.querySelector('.work-card__play') };
  }).filter(function (i) { return i.videos.length; });
  if (!items.length) return;

  var MAX_PLAYING = 2;
  var mode = '';
  var visible = [];   // items currently mostly on screen, nearest first
  var io = null;

  function source(video) {
    var webm = video.dataset.webm;
    var mp4 = video.dataset.mp4;
    return webm && video.canPlayType('video/webm; codecs="vp9"') ? webm : mp4 || webm;
  }

  function start(item) {
    item.videos.forEach(function (v) {
      if (!v.getAttribute('src')) { v.src = source(v); v.load(); }
      var p = v.play();
      if (p && p.catch) p.catch(function () { /* autoplay refused: the poster stays and, in tap mode, the button is still there */ });
    });
    item.medias.forEach(function (m) { m.classList.add('is-playing'); });
  }

  function stop(item) {
    item.videos.forEach(function (v) { v.pause(); });
    item.medias.forEach(function (m) { m.classList.remove('is-playing'); });
  }

  function release(item) { // free the decoder and the download when a video is far away
    stop(item);
    item.videos.forEach(function (v) { if (v.getAttribute('src')) { v.removeAttribute('src'); v.load(); } });
  }

  function distance(item) {
    var r = item.card.getBoundingClientRect();
    return Math.abs(r.top + r.height / 2 - innerHeight / 2);
  }

  function rebalance() {
    visible.sort(function (a, b) { return distance(a) - distance(b); });
    items.forEach(function (i) { if (visible.indexOf(i) === -1) stop(i); });
    visible.forEach(function (i, n) { if (n < MAX_PLAYING) start(i); else stop(i); });
  }

  function watch() {
    if (io) io.disconnect();
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var item = items.filter(function (i) { return i.card === e.target; })[0];
        var at = visible.indexOf(item);
        if (e.intersectionRatio >= 0.5 && at === -1) visible.push(item);
        if (e.intersectionRatio < 0.5 && at !== -1) visible.splice(at, 1);
        if (e.intersectionRatio === 0) release(item);
      });
      rebalance();
    }, { threshold: [0, 0.5] });
    items.forEach(function (i) { io.observe(i.card); });
  }

  function onPlay(e) {
    var item = items.filter(function (i) { return i.play === e.currentTarget; })[0];
    if (!item) return;
    items.forEach(function (i) { if (i !== item) stop(i); }); // one at a time in tap mode
    start(item);
  }

  function weakDevice() {
    var c = navigator.connection;
    return !!((c && c.saveData) || (navigator.deviceMemory && navigator.deviceMemory < 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4));
  }

  function setMode() {
    var reduced = window.Motion ? window.Motion.reduced : matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Scene pages get a tier from scene/boot.js. Other pages (/work/) have none, so decide from the same signals that
    // matter for video: save-data, little memory, few cores. WebGL is irrelevant to a <video>.
    var low = root.dataset.tier ? root.dataset.tier === 'low' : weakDevice();
    var next = root.classList.contains('gallery-3d') ? '' : (reduced || low ? 'tap' : 'view');
    if (next === mode) return;
    mode = next;
    if (io) { io.disconnect(); io = null; }
    visible = [];
    items.forEach(function (i) { stop(i); });
    if (mode) root.dataset.videos = mode; else delete root.dataset.videos;
    if (mode === 'view') watch();
    if (mode === 'tap') {
      // Videos that scroll away stop, so a played card does not keep decoding off screen.
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.intersectionRatio === 0) { var item = items.filter(function (i) { return i.card === e.target; })[0]; if (item) release(item); }
        });
      }, { threshold: [0] });
      items.forEach(function (i) { io.observe(i.card); });
    }
  }

  items.forEach(function (i) { if (i.play) i.play.addEventListener('click', onPlay); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) items.forEach(stop); else if (mode === 'view') rebalance(); });
  new MutationObserver(setMode).observe(root, { attributes: true, attributeFilter: ['data-tier', 'class'] });
  if (window.Motion && window.Motion.onChange) window.Motion.onChange(setMode);
  setMode();
})();

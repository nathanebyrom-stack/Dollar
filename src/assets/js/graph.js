/* 34 Automation — the automation graph (decision D4: SVG + GSAP, not WebGL). Home scene 4 and the Workflow automation page.
   The markup is generated at build time (scripts/build.mjs from assets/graph.json) and is fully lit by default, so with no
   JavaScript, or under reduced motion, the page shows the finished graph. This script, when motion is allowed, dims it and
   lights it node by node as the section scrolls: a bright line is drawn along each edge, with a short pulse at its head,
   and the node it reaches lights up. It is a generic flow: no client data, no claimed results.

   Once the flow is fully lit and still on screen, it stays alive (decision D10): a quiet pulse travels the whole flow
   every few seconds, and each node it reaches answers with a thin Spark echo of its own outline. On a fine pointer,
   moving over a node fires the same echo and sends a pulse down its outgoing edges. All of that runs on elements this
   script adds (cloned pulses, echo rects), never on anything the scroll scrub owns, so scrolling back remains exact.
   The life pauses off screen, in a hidden tab, under "Pause motion" (motion.js) and, like everything here, under
   reduced motion. The echoes and clones are inside the SVG's role="img", so assistive tech never sees them.
   Needs gsap, ScrollTrigger, motion.js and smooth.js loaded first (all deferred, in order). */
(function () {
  'use strict';

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  var Motion = window.Motion;
  var root = document.documentElement;
  var section = document.getElementById('scene-graph');
  if (!gsap || !ScrollTrigger || !section) return;

  var matcher = null;
  var sticky = section.querySelector('.scene-graph__sticky');

  // The flow, in order. Each step: edges that run together, then the nodes they reach. Times are on a 3-unit timeline.
  var STEPS = [
    { node: 'trigger', at: 0 },
    { edges: [['trigger', 'filter']], at: 0.35, node: 'filter', nodeAt: 0.85 },
    { edges: [['filter', 'action-a'], ['filter', 'action-b']], at: 1.15, nodes: ['action-a', 'action-b'], nodeAt: 1.7 },
    { edges: [['action-a', 'output'], ['action-b', 'output']], at: 2.0, node: 'output', nodeAt: 2.55 }
  ];

  function animate(svg) {
    if (!svg) return;
    var nodes = {};
    var nodeGroups = {};
    [].forEach.call(svg.querySelectorAll('.graph__node'), function (n) {
      var id = n.getAttribute('data-node');
      nodes[id] = n.querySelector('.graph__lit');
      nodeGroups[id] = n;
    });
    var edges = {};
    [].forEach.call(svg.querySelectorAll('.graph__edge'), function (e) { edges[e.getAttribute('data-from') + '>' + e.getAttribute('data-to')] = e; });

    // Dim everything; the timeline brings it back.
    root.classList.add('graph-on');
    gsap.set(Object.keys(nodes).map(function (k) { return nodes[k]; }), { opacity: 0 });
    Object.keys(edges).forEach(function (k) {
      var lit = edges[k].querySelector('.graph__line--lit');
      var pulse = edges[k].querySelector('.graph__pulse');
      var length = lit.getTotalLength();
      gsap.set(lit, { strokeDasharray: length, strokeDashoffset: length });
      gsap.set(pulse, { strokeDasharray: '14 ' + length * 2, strokeDashoffset: 14, opacity: 1 }); // the dash starts just before the path
      edges[k]._length = length;
    });

    var tl = gsap.timeline({
      defaults: { ease: 'none' },
      // refreshPriority: this script loads before the page's pins exist, and ScrollTrigger refreshes in creation order,
      // so without a lower priority the graph's range was measured before the Services pin's spacing and pointed at the
      // wrong place. A lower number refreshes later, after everything above it on the page.
      // The range is exactly the time the graph is stuck in view (CSS: position sticky at 12svh inside a taller section),
      // so it only animates while all of it is on screen, even the tall phone layout.
      scrollTrigger: { trigger: section, start: 'top 12%', end: function () { return '+=' + Math.max(1, section.offsetHeight - sticky.offsetHeight); }, scrub: true, invalidateOnRefresh: true, refreshPriority: -10 }
    });
    var light = function (id, at) { tl.to(nodes[id], { opacity: 1, duration: 0.3 }, at); };

    STEPS.forEach(function (step) {
      if (step.node && !step.edges) light(step.node, step.at);
      (step.edges || []).forEach(function (pair) {
        var e = edges[pair.join('>')];
        if (!e) return;
        tl.to(e.querySelector('.graph__line--lit'), { strokeDashoffset: 0, duration: 0.5 }, step.at)
          .to(e.querySelector('.graph__pulse'), { strokeDashoffset: -e._length, duration: 0.5 }, step.at);
      });
      (step.nodes || (step.edges && step.node ? [step.node] : [])).forEach(function (id) { light(id, step.nodeAt); });
    });

    /* ---- The living graph (D10): ambient pulses and node echoes, on elements added here ---- */
    var added = [];
    var ambientPulses = {};
    Object.keys(edges).forEach(function (k) {
      var clone = edges[k].querySelector('.graph__pulse').cloneNode(false);
      clone.classList.add('graph__pulse--ambient');
      gsap.set(clone, { strokeDasharray: '16 ' + edges[k]._length * 2, strokeDashoffset: 16, opacity: 0 });
      edges[k].appendChild(clone);
      added.push(clone);
      ambientPulses[k] = clone;
    });
    var echoes = {};
    Object.keys(nodeGroups).forEach(function (id) {
      var box = nodeGroups[id].querySelector('.graph__box');
      var echo = box.cloneNode(false);
      echo.setAttribute('class', 'graph__echo');
      gsap.set(echo, { opacity: 0 });
      nodeGroups[id].appendChild(echo);
      added.push(echo);
      echoes[id] = echo;
    });

    function echoPop(id, strength) {
      var echo = echoes[id];
      if (!echo) return;
      gsap.killTweensOf(echo);
      gsap.fromTo(echo,
        { opacity: 0.55 * strength, scale: 1, transformOrigin: '50% 50%' },
        { opacity: 0, scale: 1.45, duration: 0.9, ease: 'power2.out' });
    }
    function pulseEdge(k, at, timeline) {
      var clone = ambientPulses[k];
      var length = edges[k]._length;
      var into = timeline || gsap.timeline();
      into.fromTo(clone, { strokeDashoffset: 16, opacity: 0.85 }, { strokeDashoffset: -length, opacity: 0.85, duration: 0.6, ease: 'none' }, at || 0)
        .set(clone, { opacity: 0 }, (at || 0) + 0.6);
    }

    // One quiet pulse through the whole flow, every few seconds, while the graph is lit and watched.
    var ambient = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 3.1 });
    STEPS.forEach(function (step) {
      if (step.node && !step.edges) ambient.call(function () { echoPop(step.node, 1); }, null, step.at);
      (step.edges || []).forEach(function (pair) { pulseEdge(pair.join('>'), step.at, ambient); });
      (step.nodes || (step.edges && step.node ? [step.node] : [])).forEach(function (id) {
        ambient.call(function () { echoPop(id, 1); }, null, step.at + 0.55);
      });
    });

    // Run only while: fully lit, on screen, tab visible, and motion not paused by the visitor.
    var state = { lit: false, seen: false };
    function sync() {
      var paused = Motion && Motion.paused;
      var run = state.lit && state.seen && !document.hidden && !paused;
      if (run && ambient.paused()) ambient.play();
      else if (!run && !ambient.paused()) { ambient.pause(); Object.keys(ambientPulses).forEach(function (k) { gsap.set(ambientPulses[k], { opacity: 0 }); }); }
    }
    tl.eventCallback('onUpdate', function () { state.lit = tl.progress() > 0.999; sync(); });
    state.lit = tl.progress() > 0.999;
    var io = new IntersectionObserver(function (entries) {
      state.seen = entries.some(function (e) { return e.isIntersecting; });
      sync();
    }, { threshold: 0.45 });
    io.observe(svg);
    document.addEventListener('visibilitychange', sync);
    if (Motion && Motion.onPausedChange) Motion.onPausedChange(sync);
    sync();

    // A fine pointer over a node: the node answers, and its outgoing edges carry one pulse.
    var hoverHandlers = [];
    if (window.matchMedia && matchMedia('(pointer: fine)').matches) {
      Object.keys(nodeGroups).forEach(function (id) {
        var handler = function () {
          echoPop(id, 1.2);
          Object.keys(edges).forEach(function (k) { if (k.indexOf(id + '>') === 0) pulseEdge(k, 0, null); });
        };
        nodeGroups[id].addEventListener('pointerenter', handler);
        hoverHandlers.push({ el: nodeGroups[id], handler: handler });
      });
    }

    return function () { // gsap.matchMedia reverts the tweens and the inline styles
      root.classList.remove('graph-on');
      ambient.kill();
      gsap.killTweensOf(added);
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      hoverHandlers.forEach(function (h) { h.el.removeEventListener('pointerenter', h.handler); });
      added.forEach(function (el) { el.parentNode && el.parentNode.removeChild(el); });
    };
  }

  function build() {
    if (matcher) { matcher.revert(); matcher = null; }
    root.classList.remove('graph-on');
    if (Motion && Motion.reduced) return; // reduced motion: the finished graph, nothing moves
    matcher = gsap.matchMedia();
    matcher.add('(min-width: 720px)', function () { return animate(section.querySelector('.graph--wide')); });
    matcher.add('(max-width: 719px)', function () { return animate(section.querySelector('.graph--tall')); });
    ScrollTrigger.refresh();
  }

  build();
  if (Motion && Motion.onChange) Motion.onChange(build);
})();

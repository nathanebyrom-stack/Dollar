/* 34 Automation — the automation graph (decision D4: SVG + GSAP, not WebGL). Home scene 4 and the Workflow automation page.
   The markup is generated at build time (scripts/build.mjs from assets/graph.json) and is fully lit by default, so with no
   JavaScript, or under reduced motion, the page shows the finished graph. This script, when motion is allowed, dims it and
   lights it node by node as the section scrolls: a bright line is drawn along each edge, with a short pulse at its head,
   and the node it reaches lights up. It is a generic flow: no client data, no claimed results.
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
    [].forEach.call(svg.querySelectorAll('.graph__node'), function (n) { nodes[n.getAttribute('data-node')] = n.querySelector('.graph__lit'); });
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

    return function () { root.classList.remove('graph-on'); }; // gsap.matchMedia reverts the tweens and the inline styles
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

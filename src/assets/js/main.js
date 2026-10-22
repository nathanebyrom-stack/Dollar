// Site-wide script. Motion (GSAP) and the hero scene are added in later build steps.
document.documentElement.classList.add('js');

/* Header sub-menus open on hover and on keyboard focus. WCAG 1.4.13: content that appears like this must be dismissible
   without moving the pointer or focus, hoverable, and persistent. Hoverable and persistent come from the CSS; this is the
   dismissal: Escape hides the open menu until the pointer or focus has left it, and puts focus on the menu's own link
   (or lets it rest) so a focus ring is never left on a hidden control. */
(function () {
  'use strict';
  var items = [].slice.call(document.querySelectorAll('.site-nav__item'));
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    items.forEach(function (item) {
      if (!item.querySelector('.site-nav__sub')) return;
      var open = item.matches(':hover') || item.contains(document.activeElement);
      if (!open) return;
      item.setAttribute('data-dismissed', '');
      var top = item.querySelector(':scope > a');
      if (item.contains(document.activeElement) && document.activeElement !== top) { if (top) top.focus(); else document.activeElement.blur(); }
    });
  });
  items.forEach(function (item) {
    item.addEventListener('mouseleave', function () { item.removeAttribute('data-dismissed'); });
    item.addEventListener('focusout', function (e) { if (!item.contains(e.relatedTarget)) item.removeAttribute('data-dismissed'); });
  });
})();

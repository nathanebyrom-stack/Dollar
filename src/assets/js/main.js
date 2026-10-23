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
    if (e.key !== 'Escape' || matchMedia('(max-width: 47.99rem)').matches) return;
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

/* Phones: the Menu button opens and closes the navigation panel (base.css). Escape closes it and returns focus to the
   button; so does growing the window past the phone breakpoint. */
(function () {
  'use strict';
  var header = document.querySelector('.site-header');
  var toggle = header && header.querySelector('.site-nav__toggle');
  if (!toggle) return;
  var phone = matchMedia('(max-width: 47.99rem)');
  function setOpen(open) {
    if (open) header.setAttribute('data-menu-open', ''); else header.removeAttribute('data-menu-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  toggle.addEventListener('click', function () { setOpen(!header.hasAttribute('data-menu-open')); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && header.hasAttribute('data-menu-open') && phone.matches) { setOpen(false); toggle.focus(); }
  });
  (phone.addEventListener ? phone.addEventListener.bind(phone, 'change') : phone.addListener.bind(phone))(function () { if (!phone.matches) setOpen(false); });
})();

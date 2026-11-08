/* Shared KEBOON mobile menu; works without a framework. */
(function () {
  'use strict';
  const nav = document.querySelector('.kb-site-header');
  if (!nav) return;
  const toggle = nav.querySelector('.kb-site-menu-toggle');
  const links = nav.querySelector('.kb-site-links');
  if (!toggle || !links) return;
  function setOpen(open) {
    links.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    toggle.textContent = open ? '×' : '☰';
  }
  toggle.addEventListener('click', function () {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });
  links.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () { setOpen(false); });
  });
  document.addEventListener('click', function (event) {
    if (!nav.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 1080) setOpen(false);
  });
})();

/* =========================================================
   PARALLAX — driver for photography outside the hero
   Extends the hero's scroll-scrubbed feel to the page's other
   large images (currently the three feature-band photos) so
   the "fade in, then drift" effect reads consistently down the
   page rather than being a hero-only trick. Each [data-parallax]
   element gets a subtle translateY, clamped tight and applied
   through the --py custom property so it composes with any
   other transform (e.g. the feature-band hover zoom) instead of
   overwriting it. No clock — purely a function of scroll
   position, computed each frame via requestAnimationFrame.
========================================================= */
(function () {
  'use strict';

  const reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
  if (!els.length || reduced) return;

  const FACTOR = 0.08;   // how strongly distance-from-centre translates to offset
  const MAX_PX = 16;     // clamp — stays well inside each image's overscan buffer

  let ticking = false;
  function update() {
    ticking = false;
    const vh = window.innerHeight;
    els.forEach(function (el) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > vh) return; // off-screen — skip the write
      const center = rect.top + rect.height / 2;
      let offset = (center - vh / 2) * FACTOR;
      offset = Math.max(-MAX_PX, Math.min(MAX_PX, offset));
      el.style.setProperty('--py', offset.toFixed(1) + 'px');
    });
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();

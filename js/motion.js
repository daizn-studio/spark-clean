/* =========================================================
   SPARK CLEAN — Motion helpers
   Animation only. No business logic — js/app.js owns all of
   that, and this file must never duplicate its bindings.

   Sets .motion-ready on <html> immediately. css/motion.css
   gates every hidden-by-default state on that class, so if
   this file fails to load the page renders fully visible
   rather than blank.
========================================================= */
document.documentElement.classList.add('motion-ready');

(function () {
  'use strict';

  var reduced = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- INTRO CURTAIN (marketing page) ---------- */
  function runIntroCurtain() {
    var curtain = document.getElementById('introCurtain');
    if (!curtain) return;
    // Once per session: a full-screen animation on every navigation
    // becomes an obstacle rather than an arrival.
    if (reduced || sessionStorage.getItem('sparkIntroPlayed')) {
      curtain.remove();
      return;
    }
    sessionStorage.setItem('sparkIntroPlayed', '1');

    var blade = document.createElement('div');
    blade.className = 'squeegee-blade';
    var foam = document.createElement('div');
    foam.className = 'foam-trail';
    var word = document.createElement('span');
    word.className = 'intro-word';
    word.textContent = 'Spark Clean · Melbourne';
    curtain.appendChild(foam);
    curtain.appendChild(blade);
    curtain.appendChild(word);

    requestAnimationFrame(function () { curtain.classList.add('run'); });
    setTimeout(function () {
      curtain.classList.add('done');
      // Removed from the DOM, not just hidden, so it can never
      // intercept clicks afterwards.
      setTimeout(function () { curtain.remove(); }, 260);
    }, 1850);
  }

  /* ---------- SCROLL REVEAL ---------- */
  function initScrollReveal() {
    var els = document.querySelectorAll('.reveal, [data-reveal]');
    if (!els.length) return;
    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('squeegee-in'); });
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var dir = entry.target.getAttribute('data-reveal-dir') || 'left';
        var cls = dir === 'right' ? 'squeegee-in-right'
                : dir === 'up'    ? 'squeegee-in-up'
                : 'squeegee-in';
        entry.target.classList.add(cls);
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });
    els.forEach(function (el) { obs.observe(el); });
  }

  /* ---------- MOP DIVIDERS ---------- */
  function initMopDividers() {
    var els = document.querySelectorAll('.mop-divider');
    if (!els.length) return;
    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach(function (d) { d.classList.add('mop-stroke'); });
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('mop-stroke'); obs.unobserve(e.target); }
      });
    }, { threshold: 0.35 });
    els.forEach(function (d) { obs.observe(d); });
  }

  /* ---------- COUNT UP ---------- */
  function countUp(el, target, opts) {
    opts = opts || {};
    var prefix = opts.prefix || '', suffix = opts.suffix || '';
    if (reduced) { el.textContent = prefix + target + suffix; return; }
    var start = null, duration = opts.duration || 1400;
    requestAnimationFrame(function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = prefix + target + suffix;
    });
  }
  function initCountUp() {
    var els = document.querySelectorAll('[data-count]');
    if (!els.length) return;
    function run(el) {
      countUp(el, parseFloat(el.getAttribute('data-count')), {
        prefix: el.getAttribute('data-prefix') || '',
        suffix: el.getAttribute('data-suffix') || ''
      });
    }
    if (reduced || !('IntersectionObserver' in window)) { els.forEach(run); return; }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { run(e.target); obs.unobserve(e.target); }
      });
    }, { threshold: 0.5 });
    els.forEach(function (el) { obs.observe(el); });
  }

  /* ---------- PARALLAX ---------- */
  function initHeroParallax() {
    var shine = document.querySelector('.floor-shine');
    if (!shine || reduced) return;
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        shine.style.transform = 'translateY(' + (window.pageYOffset * 0.28) + 'px)';
        ticking = false;
      });
    }, { passive: true });
  }

  /* =========================================================
     HOOKS CALLED BY js/app.js
     These are the only functions app.js depends on. Names and
     signatures must stay stable.
  ========================================================= */

  // Called on every step change. app.js swaps the step at ~380ms,
  // which is when the blade covers the screen.
  window.sweepPageWipe = function (direction) {
    var wipe = document.getElementById('pageWipe');
    if (!wipe || reduced) return;
    var cls = direction === 'back' ? 'sweep-backward' : 'sweep-forward';
    wipe.classList.remove('sweep-forward', 'sweep-backward');
    void wipe.offsetWidth; // restart the animation
    wipe.classList.add(cls);
    setTimeout(function () { wipe.classList.remove(cls); }, 900);
  };

  window.applyStepStagger = function (stepEl) {
    if (!stepEl || reduced) return;
    stepEl.classList.remove('step-content-fade');
    void stepEl.offsetWidth;
    stepEl.classList.add('step-content-fade');
  };

  window.applyPriceRowStagger = function () {
    // css/motion.css drives the cascade with :nth-child delays, which
    // re-trigger naturally each time app.js re-renders the rows.
  };

  window.pulsePriceAmount = function () {
    var el = document.querySelector('.price-range');
    if (!el || reduced) return;
    el.classList.remove('price-tick');
    void el.offsetWidth;
    el.classList.add('price-tick');
  };

  window.sprayPulse = function (el) {
    if (!el || reduced) return;
    el.classList.add('spray-ring');
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
    setTimeout(function () { el.classList.remove('pulse'); }, 1000);
  };

  window.drawConfirmCheck = function () {
    var el = document.getElementById('confirmationCheck');
    if (!el) return;
    el.classList.remove('run');
    void el.offsetWidth;
    el.classList.add('run');
  };

  window.initScrollReveal = initScrollReveal;
  window.initHeroParallax = initHeroParallax;

  // app.js uses this to count the estimate range up/down so a price
  // change reads as movement rather than a jump cut.
  window.animateNumber = function (el, from, to, duration, prefix) {
    if (!el) return;
    duration = duration || 450;
    prefix = prefix === undefined ? '$' : prefix;
    if (reduced) { el.textContent = prefix + to; return; }
    var start = performance.now();
    requestAnimationFrame(function tick(now) {
      var progress = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = prefix + Math.round(from + (to - from) * eased);
      if (progress < 1) requestAnimationFrame(tick);
      else el.textContent = prefix + to;
    });
  };

  // app.js checks this before running its own timed sequences.
  window.prefersReducedMotion = function () { return reduced; };

  /* ---------- INIT ---------- */
  function init() {
    runIntroCurtain();
    initScrollReveal();
    initMopDividers();
    initCountUp();
    initHeroParallax();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();

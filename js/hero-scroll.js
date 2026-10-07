/* =========================================================
   SCROLL HERO — driver
   One value, --p (0→1), tracks how far the hero has scrolled
   past the top of the viewport. css/hero-scroll.css reads it
   for every layer's parallax and the light-streak sweep, so
   scrolling down plays the scene forward and scrolling back
   up runs it back — there is no clock anywhere in this file.
========================================================= */
(function () {
  'use strict';

  const root = document.querySelector('.sh');
  if (!root) return;

  const reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!reduced) {
    let ticking = false;
    function update() {
      ticking = false;
      const rect = root.getBoundingClientRect();
      const h = rect.height || 1;
      const p = Math.max(0, Math.min(1, -rect.top / h));
      root.style.setProperty('--p', p.toFixed(4));
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  /* =========================================================
     BACKGROUND VIDEO — loaded conditionally, never just dumped
     in the markup with a live src. Skipped on narrow viewports
     and data-saver connections (bandwidth, not just motion),
     and under prefers-reduced-motion (an autoplaying video is
     exactly the kind of motion that preference asks us to
     avoid). Every one of those cases already has a complete,
     attractive look on its own: the navy gradient in
     css/hero-scroll.css. A failed load (stale hotlink) falls
     back to that same gradient.

     PLACEHOLDER: pexels.com/video/person-cleaning-a-mirror-
     4238760/ — free, commercially-licensed stock footage, a
     real gloved hand wiping thick soap suds off a bathroom
     mirror with a sponge — a home surface, not a vehicle. Swap
     the URL below for our own filmed footage before launch.
  ========================================================= */
  (function () {
    const video = root.querySelector('.sh__video');
    if (!video) return;
    // Phones and tablets get the 960x540 rendition (~2.7MB instead of
    // ~9.5MB) so the hero moves on mobile just like it does on PC.
    const small = window.matchMedia('(max-width: 1024px), (pointer: coarse)').matches;
    const saveData = navigator.connection && navigator.connection.saveData;
    if (reduced || saveData) return;

    const PLACEHOLDER_SRC = small
      ? 'https://videos.pexels.com/video-files/4238760/4238760-sd_960_540_30fps.mp4'
      : 'https://videos.pexels.com/video-files/4238760/4238760-hd_1920_1080_30fps.mp4';
    // iOS only autoplays inline video that is muted as a property, not
    // just via the attribute.
    video.muted = true;
    video.setAttribute('playsinline', '');
    const source = document.createElement('source');
    source.src = PLACEHOLDER_SRC;
    source.type = 'video/mp4';
    video.appendChild(source);
    // Stays [hidden] — showing the gradient — until frames are actually
    // playing. An empty/loading <video> renders as an opaque black box
    // by default, so revealing it any earlier would blot out the
    // gradient fallback instead of falling back to it.
    video.addEventListener('playing', function () {
      video.hidden = false;
    });
    video.addEventListener('error', function () {
      video.hidden = true;
    });
    video.load();

    /* ---- Scroll-scrubbed playback speed ----
       Scrolling down eases the footage into slow motion; scrolling
       back up eases it back to full speed. Runs its own persistent
       rAF loop rather than only reacting to scroll events, so the
       easing keeps animating smoothly for a moment even after the
       scroll stops — a hard "set rate on scroll tick" read as
       jumpy, this doesn't.

       Gated by IntersectionObserver below: a rAF loop (plus a
       decoding, playing video) left running forever after the hero
       scrolls out of view drains CPU for the rest of the page visit
       for nothing visible — that's what was actually causing the
       lag, not the effect itself. */
    let currentRate = 1;
    let rafId = null;
    function rateLoop() {
      const p = parseFloat(root.style.getPropertyValue('--p')) || 0;
      const target = 1 - p * 0.68; // eases down to ~0.32x at full scroll-through
      currentRate += (target - currentRate) * 0.06;
      // Compressed footage gets visibly choppy below ~0.3x (the decoder is
      // just holding frames longer, not interpolating new ones), and
      // rewriting playbackRate every frame for a near-zero change is what
      // made this feel stuttery rather than smooth — only touch it once
      // the delta is big enough to matter.
      if (video.readyState > 0) {
        const next = Math.max(0.32, currentRate);
        if (Math.abs(next - video.playbackRate) > 0.01) video.playbackRate = next;
      }
      rafId = requestAnimationFrame(rateLoop);
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            video.play().catch(function () {});
            if (rafId === null) rafId = requestAnimationFrame(rateLoop);
          } else {
            video.pause();
            if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
          }
        });
      }, { threshold: 0.01 }).observe(root);
    } else {
      // No IntersectionObserver support — fall back to always-on rather
      // than never starting.
      video.play().catch(function () {});
      rafId = requestAnimationFrame(rateLoop);
    }
  })();

  /* ---- Populate dates first, so the link picks up a real value ---- */
  (function () {
    const sel = document.getElementById('shDate');
    if (!sel || sel.options.length) return;
    const fmt = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    for (let i = 1; i <= 14; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const o = document.createElement('option');
      o.value = d.toISOString().slice(0, 10);
      o.textContent = fmt.format(d);
      sel.appendChild(o);
    }
  })();

  /* =========================================================
     QUICK-START → carries the three choices into the wizard.
  ========================================================= */
  const cta = document.getElementById('shCta');
  if (cta) {
    const sync = () => {
      const beds = document.getElementById('shBeds');
      const date = document.getElementById('shDate');
      const time = document.getElementById('shTime');
      const p = new URLSearchParams();
      if (beds && beds.value) p.set('beds', beds.value);
      if (date && date.value) p.set('date', date.value);
      if (time && time.value) p.set('time', time.value);
      cta.href = 'book.html' + (p.toString() ? '?' + p.toString() : '');
    };
    root.querySelectorAll('.sh__row select').forEach(s => s.addEventListener('change', sync));
    sync();
  }
})();

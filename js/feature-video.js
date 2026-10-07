/* =========================================================
   FEATURE-BAND VIDEO
   Same safe-loading pattern as the hero (js/hero-scroll.js):
   loaded conditionally via JS rather than a live <source> in
   markup, skipped on narrow viewports / data-saver connections
   / prefers-reduced-motion, stays [hidden] until frames are
   actually playing (an empty <video> renders as an opaque
   black box, which would blot out the photo fallback beneath
   it), and paused via IntersectionObserver the moment it
   scrolls out of view — a decoding, playing video left running
   forever off-screen is exactly what caused the hero lag
   earlier; every video on this page uses this same guard now.

   Each [data-src] on a .feature-band-video element is a
   placeholder Pexels URL — swap for owned footage before launch.
========================================================= */
(function () {
  'use strict';

  const reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Phones and tablets play the light data-src-mobile rendition (~2-3MB)
  // instead of the full-size clip; a video with no mobile rendition keeps
  // its photo on those devices.
  const small = window.matchMedia('(max-width: 1024px), (pointer: coarse)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  if (reduced || saveData) return;

  const videos = document.querySelectorAll('.feature-band-video[data-src]');
  if (!videos.length || !('IntersectionObserver' in window)) return;

  videos.forEach(function (video) {
    const src = small ? video.dataset.srcMobile : video.dataset.src;
    if (!src) return;
    video.muted = true;
    let loaded = false;

    function ensureLoaded() {
      if (loaded) return;
      loaded = true;
      const source = document.createElement('source');
      source.src = src;
      source.type = 'video/mp4';
      video.appendChild(source);
      video.addEventListener('playing', function () { video.hidden = false; });
      video.addEventListener('error', function () { video.hidden = true; });
      video.load();
    }

    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          ensureLoaded();
          video.play().catch(function () {});
        } else if (loaded) {
          video.pause();
        }
      });
    }, { threshold: 0.15 }).observe(video);
  });
})();

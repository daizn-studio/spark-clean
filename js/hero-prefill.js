/* =========================================================
   HERO PREFILL
   The hero panel on index.html is real HTML, so its three
   selections should actually carry into the wizard rather than
   being decorative. This reads them from the URL and fills the
   matching fields.

   Load AFTER js/app.js so the wizard has already initialised
   and our 'input'/'change' events reach its live pricing.

   Nothing here is required: with no params, or if a field is
   missing, it exits quietly and the wizard behaves normally.
========================================================= */
(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  if (![...params.keys()].length) return;

  const set = (id, value, evt) => {
    const el = document.getElementById(id);
    if (!el || !value) return false;
    el.value = value;
    el.dispatchEvent(new Event(evt, { bubbles: true }));
    return true;
  };

  // Bedrooms — clamped to the field's own min/max so a hand-edited
  // URL can't push the pricing engine outside its valid range.
  const beds = parseInt(params.get('beds'), 10);
  if (!Number.isNaN(beds)) {
    const el = document.getElementById('bedrooms');
    if (el) {
      const min = Number(el.min || 0), max = Number(el.max || 20);
      set('bedrooms', String(Math.max(min, Math.min(max, beds))), 'input');
    }
  }

  // Date — only accept a real YYYY-MM-DD that isn't in the past.
  const date = params.get('date');
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(date + 'T00:00:00') >= today) set('preferredDate', date, 'change');
  }

  // Time — must be one of the two slots the wizard offers.
  const time = params.get('time');
  if (['morning', 'evening'].includes(time)) {
    set('preferredTime', time, 'change');
  }

  // Clear the params from the address bar so a refresh or a shared link
  // doesn't silently re-apply stale choices over what the person has
  // since changed.
  if (window.history && window.history.replaceState) {
    window.history.replaceState({}, '', window.location.pathname);
  }
})();

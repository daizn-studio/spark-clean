/* =========================================================
   APP — step navigation, live pricing, booking flow
========================================================= */

const state = {
  step: 1,
  serviceTrack: 'residential',
  heavyDuty: false,
  uploadedPhotos: [],
  bookingId: null,
  photoAdjustmentPct: 0,
  lastBookingSyncFailed: false,
  lastBookingSyncErrorDetail: '',
  stripeMounted: false,
  commercialCleanType: 'standard',
  // Standalone steam track: which kind of site the carpets are in. Does
  // not change the rate (rooms always bill at PRICING.steam rates) — it
  // carried so the crew, the receipt and the booking record all say what
  // they're attending.
  steamPropertyType: 'lease',
  // Steam booked together with a full clean of the same property. Off by
  // default so a standalone steam job is still the cheap, simple path.
  steamCombined: false,
  lockedGst: null
};

/* =========================================================
   MOTION HELPER GUARDS
   js/motion.js provides these. They are presentation only, so if that
   file fails to load the wizard must still navigate, price and submit —
   previously a missing prefersReducedMotion() broke step navigation
   entirely.
========================================================= */
if (typeof window.prefersReducedMotion !== 'function') {
  window.prefersReducedMotion = function () {
    return window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  };
}
['sweepPageWipe','applyStepStagger','applyPriceRowStagger','pulsePriceAmount',
 'drawConfirmCheck','sprayPulse','initScrollReveal','initHeroParallax'
].forEach(function (fn) {
  if (typeof window[fn] !== 'function') window[fn] = function () {};
});
if (typeof window.animateNumber !== 'function') {
  window.animateNumber = function (el, from, to, dur, prefix) {
    if (el) el.textContent = (prefix === undefined ? '$' : prefix) + to;
  };
}

const TOTAL_STEPS = 6;

function generateBookingId() {
  return 'bk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Minimal HTML escaper — used only for displaying raw error text safely,
// since that text comes from a server response rather than a fixed string.
function escapeHtmlBasic(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------- STEP NAVIGATION ----------------
function performStepChange(n) {
  document.querySelectorAll('.step').forEach(el => {
    el.classList.toggle('is-active', Number(el.dataset.step) === n);
  });
  document.querySelectorAll('.stepper__item').forEach(el => {
    const s = Number(el.dataset.step);
    el.classList.toggle('is-active', s === n);
    el.classList.toggle('is-done', s < n);
  });
  state.step = n;
  document.getElementById('priceSidebar').style.display = n >= 4 ? 'none' : '';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const activeStepEl = document.querySelector(`.step[data-step="${n}"]`);
  if (activeStepEl) applyStepStagger(activeStepEl);

  if (n === 4) {
    // The order review is the receipt the customer actually reads before
    // paying, so the price is locked here — the moment it first becomes
    // visible — rather than later on the payment step. That way what's
    // shown here and what Payment/Stripe charges can never disagree.
    if (!state.lockedGst) state.lockedGst = calculateGst(lastResult.total);
    renderOrderReview(state.lockedGst);
  }
  if (n === 5) {
    checkLowValueWarning();
    // Always already locked by the time Payment is reachable (Review
    // comes first) — this fallback only matters if that ever changes.
    if (!state.lockedGst) state.lockedGst = calculateGst(lastResult.total);
    renderGstBreakdown(state.lockedGst);
    if (!state.stripeMounted) {
      state.stripeMounted = true;
      // Wait until the step's entrance animation has actually finished
      // before mounting, so Stripe measures a container with final,
      // stable layout, not one still mid-transition.
      setTimeout(() => { initStripeElements(state.lockedGst.total, state.bookingId); }, 700);
    }
  }
  if (n === 6) {
    renderConfirmationSummary();
    if (typeof drawConfirmCheck === 'function') drawConfirmCheck();
  }
}

/**
 * A real cleaning instrument visibly sweeps across the full screen
 * between steps — the page content actually changes underneath it right
 * as it passes, like the old content is being wiped away to reveal the
 * next step. This is deliberately more literal than the earlier subtle
 * clip-path wipe on just the step artwork — that stays too, this adds a
 * full-screen moment on top of it for the step transition specifically.
 */
function goToStep(n) {
  if (n < 1 || n > TOTAL_STEPS) return;
  const wipe = document.getElementById('pageWipe');

  if (!wipe || prefersReducedMotion() || n === state.step) {
    performStepChange(n);
    return;
  }

  // The squeegee blade fully covers the screen at ~380ms, which is when
  // the content swaps, so the change happens behind it rather than
  // visibly popping. sweepPageWipe lives in js/motion.js.
  if (typeof sweepPageWipe === 'function') {
    sweepPageWipe(n >= state.step ? 'forward' : 'back');
  }
  setTimeout(() => performStepChange(n), 380);
}

document.querySelectorAll('[data-next]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!validateStepBeforeAdvance(state.step)) return;
    goToStep(state.step + 1);
  });
});
document.querySelectorAll('[data-prev]').forEach(btn => {
  btn.addEventListener('click', () => goToStep(state.step - 1));
});

function validateStepBeforeAdvance(step) {
  if (step === 1) {
    // Every check runs (not short-circuited) so all relevant errors show
    // at once, beneath their own fields, rather than one alert per click.
    const nameOk = validateNameField();
    const phoneOk = validatePhoneField();
    const emailOk = validateEmailField();
    const scheduleOk = validateScheduleField();

    // Residential defaults to 0 bedrooms so the sidebar genuinely starts
    // at $0 — but that also means an unconfigured property would sail
    // through as a free booking unless this explicitly blocks it.
    const sizeErrEl = document.getElementById('propertySizeError');
    let sizeOk = true;
    sizeErrEl.textContent = '';

    if (state.serviceTrack === 'residential') {
      const beds = parseInt(document.getElementById('bedrooms').value, 10) || 0;
      sizeOk = beds > 0;
      sizeErrEl.textContent = sizeOk ? '' : 'Please select at least 1 bedroom to get a quote.';
    }
    // The steam track needs no size gate: its baseline always covers one
    // room, so there is no "configured nothing" state to catch, and the
    // office pathway's panel has real defaults for floor area.

    return nameOk && phoneOk && emailOk && scheduleOk && sizeOk;
  }
  if (step === 2) {
    const agreeEl = document.getElementById('agreeTerms');
    const agreeErrEl = document.getElementById('agreeTermsError');
    const agreeOk = agreeEl.checked;
    agreeErrEl.textContent = agreeOk ? '' : 'Please confirm you\'ve read and accept the disclaimer and Terms of Service.';
    return agreeOk;
  }
  return true;
}

// ---------------- FIELD VALIDATION ----------------
// Full Australian phone validation — covers what the old version missed:
// - Mobile: 04xx xxx xxx (or +61 4xx xxx xxx)
// - Landline: 0[2378] xxxx xxxx — Sydney/ACT (02), VIC/TAS (03), QLD (07), WA/SA/NT (08)
// - Toll-free / local-rate: 1300 xxx xxx, 1800 xxx xxx, 13 xx xx
// With or without spaces, dashes, parentheses, or the +61/61 country code.
/**
 * Reduces a phone number to a comparable form: digits only, with +61/61
 * rewritten to a leading 0. Without this, "0412 345 678" and
 * "0412345678" are treated as different customers, so someone who books
 * with spaces and looks up without them is told they have no booking.
 */
function normalisePhone(value) {
  let d = String(value || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+61')) d = '0' + d.slice(3);
  else if (d.startsWith('61') && d.length > 9) d = '0' + d.slice(2);
  return d.replace(/\D/g, '');
}

function isValidAuPhone(value) {
  // Validate the digits only. The previous version stripped just spaces,
  // parentheses and hyphens, so "0412.345.678" or an en-dash pasted from a
  // contact card was rejected as invalid. normalisePhone() drops every
  // separator and folds +61 to 0, so the customer can type it however
  // they like and it still works.
  const d = normalisePhone(value);
  if (/^0[2-478]\d{8}$/.test(d)) return true;  // mobile + landline
  if (/^1300\d{6}$/.test(d)) return true;      // 1300 xxx xxx
  if (/^1800\d{6}$/.test(d)) return true;      // 1800 xxx xxx
  if (/^13\d{4}$/.test(d)) return true;        // 13 xx xx
  return false;
}
function isValidEmailFormat(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validatePhoneField() {
  const val = document.getElementById('custPhone').value.trim();
  const errEl = document.getElementById('custPhoneError');
  if (!val) {
    errEl.textContent = 'Please enter your phone number.';
    return false;
  }
  if (!isValidAuPhone(val)) {
    errEl.textContent = 'That doesn\'t look like a valid Australian phone number. Please enter a mobile (e.g. 0412 345 678) or landline (e.g. 03 9123 4567).';
    return false;
  }
  errEl.textContent = '';
  return true;
}
function validateNameField() {
  const val = document.getElementById('custName').value.trim();
  const errEl = document.getElementById('custNameError');
  if (!val) {
    errEl.textContent = 'Please enter your full name.';
    return false;
  }
  errEl.textContent = '';
  return true;
}
/**
 * Whole days between today and the selected preferred date, or null if
 * no date is chosen yet / it doesn't parse. Used to apply the urgent-
 * booking surcharge (PRICING.urgent) — 0 covers same-day.
 */
function daysUntilPreferredDate() {
  const dateVal = document.getElementById('preferredDate').value;
  if (!dateVal) return null;
  const target = new Date(dateVal + 'T00:00:00');
  if (isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
function validateScheduleField() {
  const dateVal = document.getElementById('preferredDate').value;
  const timeVal = document.getElementById('preferredTime').value;
  const errEl = document.getElementById('scheduleError');
  if (!dateVal) {
    errEl.textContent = 'Please select a preferred cleaning date.';
    return false;
  }
  // Must be at least 1 hour from right now — catches both "yesterday" and
  // "today, but a slot that's already started or about to."
  const hour = timeSlotToHour(timeVal);
  const target = new Date(dateVal + 'T00:00:00');
  target.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  const minAllowed = new Date(Date.now() + 60 * 60 * 1000);
  if (target.getTime() < minAllowed.getTime()) {
    errEl.textContent = 'Preferred date/time must be at least 1 hour from now — please choose a later date or slot.';
    return false;
  }
  errEl.textContent = '';
  return true;
}
function validateEmailField() {
  const val = document.getElementById('custEmail').value.trim();
  const errEl = document.getElementById('custEmailError');
  if (!val || isValidEmailFormat(val)) {
    errEl.textContent = '';
    return true;
  }
  errEl.textContent = 'That doesn\'t look like a valid email address. Please enter a correct one.';
  return false;
}
document.getElementById('custPhone').addEventListener('blur', validatePhoneField);
document.getElementById('custEmail').addEventListener('blur', validateEmailField);
document.getElementById('custName').addEventListener('blur', validateNameField);
document.getElementById('preferredDate').addEventListener('change', function () { validateScheduleField(); updatePrice(); });
document.getElementById('preferredTime').addEventListener('change', validateScheduleField);

// ---------------- SERVICE TABS ----------------
/* Three service lines, each with its own tab, panel and pricing function.
   Kept as a table rather than the old pair of booleans: with a third
   track, `isResidential ? a : b` silently lumps steam in with commercial
   everywhere it appears, which is exactly the class of bug that showed
   the wrong panel when this was two tracks. */
const SERVICE_TRACKS = {
  residential: {
    tab: 'tabResidential',
    panel: 'panelResidential',
    label: 'End of Lease Clean',
    description: 'Residential vacate/bond cleans, priced against real estate bond-back standards.'
  },
  commercial: {
    tab: 'tabCommercial',
    panel: 'panelCommercial',
    label: 'Office Cleaning',
    description: 'Commercial office cleans, priced by floor area with tiered sqm rates. Minimum $180 per job.'
  },
  steam: {
    tab: 'tabSteam',
    panel: 'panelSteam',
    label: 'Carpet Steam Clean',
    description: 'Carpet steam cleaning for homes and offices — $150 covers the first room, then $45 per additional room.'
  }
};
const serviceDescription = document.getElementById('serviceDescription');

function setServiceTrack(track) {
  if (!SERVICE_TRACKS[track]) track = 'residential';
  state.serviceTrack = track;

  // A combined steam booking physically moves a full-clean panel inside
  // the steam panel. Put it back BEFORE the show/hide below, or leaving
  // the steam track hides the panel that contains it and the residential
  // tab opens to an empty step.
  restoreComboPanels();

  Object.keys(SERVICE_TRACKS).forEach(key => {
    const cfg = SERVICE_TRACKS[key];
    const isActive = key === track;
    const tabEl = document.getElementById(cfg.tab);
    const panelEl = document.getElementById(cfg.panel);
    if (tabEl) {
      tabEl.classList.toggle('is-active', isActive);
      tabEl.setAttribute('aria-selected', String(isActive));
    }
    // Toggle BOTH the class and the attribute. css/style.css hides
    // .service-panel with a class rule, and a class rule out-ranks the
    // `hidden` attribute — so setting `.hidden` alone left the commercial
    // panel invisible no matter what. Keeping the two in step means the
    // panel shows regardless of which mechanism the stylesheet relies on.
    if (panelEl) {
      panelEl.classList.toggle('is-visible', isActive);
      panelEl.hidden = !isActive;
    }
  });

  if (serviceDescription) serviceDescription.textContent = SERVICE_TRACKS[track].description;
  renderComboPanel();
  renderSteamRoomsTotal();
  renderJobDurationNotice();
  updatePrice();
}
Object.keys(SERVICE_TRACKS).forEach(key => {
  const tabEl = document.getElementById(SERVICE_TRACKS[key].tab);
  if (tabEl) tabEl.addEventListener('click', () => setServiceTrack(key));
});

/**
 * What to call the service being booked, including the combined case.
 * One function so the receipt, the confirmation screen, the booking record
 * and the long-term enquiry email all say the same thing.
 */
function currentServiceLabel() {
  const base = serviceTrackLabel(state.serviceTrack);
  if (state.serviceTrack !== 'steam') return base;

  const forWhat = state.steamPropertyType === 'office'
    ? 'office / commercial'
    : 'home / end of lease';

  if (!state.steamCombined) return `${base} (${forWhat})`;

  const pairedWith = serviceTrackLabel(
    state.steamPropertyType === 'office' ? 'commercial' : 'residential'
  );
  return `${base} + ${pairedWith}`;
}

/**
 * The 3-hour / $43-per-extra-hour policy, shown under the sizing panels on
 * step 1 and again at the top of the step 4 receipt. Both read the same
 * sentence out of js/pricing.js so the two can never disagree.
 */
function renderJobDurationNotice() {
  const text = typeof jobDurationPolicyText === 'function'
    ? jobDurationPolicyText(state.serviceTrack)
    : '';
  const stepOneEl = document.getElementById('jobDurationNotice');
  if (stepOneEl) {
    stepOneEl.textContent = text;
    stepOneEl.hidden = !text;
  }
}

// ---------------- LOCATION ----------------
document.getElementById('serviceSuburb').addEventListener('input', (e) => {
  const pill = document.getElementById('locationPill');
  const suburb = e.target.value.trim();
  pill.textContent = suburb ? `📍 ${suburb}, Melbourne VIC` : '📍 Melbourne, VIC';
});

/* Number steppers (the −/+ pairs) are wired by an inline script at the
   foot of book.html, not here. Do not add a second handler in this file:
   both would fire on the same click and every + would count twice. */

// ---------------- RESIDENTIAL INPUTS ----------------
['bedrooms', 'bathrooms', 'resKitchens', 'livingAreas'].forEach(id => {
  document.getElementById(id).addEventListener('input', updatePrice);
});
/**
 * A single on/off feature toggled as a real button (not a checkbox) —
 * used for "multi-storey" on both service tracks. State lives on the
 * button itself via aria-pressed, so getResidentialInputs()/
 * getCommercialInputs() can read it back without a separate variable.
 */
function wireFeatureToggle(id) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const pressed = btn.getAttribute('aria-pressed') === 'true';
    btn.setAttribute('aria-pressed', String(!pressed));
    btn.classList.toggle('is-active', !pressed);
    updatePrice();
  });
}
function isToggled(id) {
  const el = document.getElementById(id);
  return el ? el.getAttribute('aria-pressed') === 'true' : false;
}
wireFeatureToggle('multiStoreyBtn');
wireFeatureToggle('addonOven');

// ---------------- COMMERCIAL INPUTS ----------------
const sqmInput = document.getElementById('sqm');
const sqmValue = document.getElementById('sqmValue');
sqmInput.addEventListener('input', () => {
  sqmValue.textContent = sqmInput.value;
  updatePrice();
});
/* Null-safe binding. If app.js and book.html ever fall out of step (one
   updated, the other not), calling addEventListener on a missing element
   throws and every line after it — including setServiceTrack, which is
   what makes the panels visible — never runs. The page then shows an
   empty step with no clue why. Skipping absent controls degrades to
   "that field just isn't wired" instead of a dead page. */
function bind(id, evt, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(evt, fn);
  else console.warn(`[app] control #${id} not found in the HTML — skipping.`);
}

['bins', 'toilets', 'desks', 'kitchens', 'commercialCarpetRooms'].forEach(id => bind(id, 'input', updatePrice));
['addHighDusting','addGlass',
 'addFridge','addDishwasher','addMicrowave','hasKitchen'
].forEach(id => bind(id, 'change', updatePrice));
bind('frequency', 'change', updatePrice);
wireFeatureToggle('addMultiStoreyBtn');

// Standard vs deep clean — a deep/first-time clean takes about twice the
// time, so it multiplies the per-m² rate rather than adding a flat fee.
(function () {
  const stdBtn = document.getElementById('cleanStandardBtn');
  const deepBtn = document.getElementById('cleanDeepBtn');
  if (!stdBtn || !deepBtn) return;
  function setType(t) {
    state.commercialCleanType = t;
    stdBtn.setAttribute('aria-pressed', String(t === 'standard'));
    deepBtn.setAttribute('aria-pressed', String(t === 'deep'));
    updatePrice();
  }
  stdBtn.addEventListener('click', () => setType('standard'));
  deepBtn.addEventListener('click', () => setType('deep'));
})();

// ---------------- STEAM INPUTS ----------------
['steamExtraRooms', 'steamKitchens', 'steamWashrooms', 'steamLivingAreas']
  .forEach(id => bind(id, 'input', () => { renderSteamRoomsTotal(); updatePrice(); }));

/* The two full-clean panels can be relocated underneath the steam panel
   when a combined booking is chosen. Rather than duplicating their markup
   (which would duplicate ~25 element ids and break every getElementById in
   this file), the real node is moved and then put back exactly where it
   was. Its original position is recorded once, at load, before anything
   has had a chance to move it. */
const PANEL_HOME = {};
['panelCommercial'].forEach(id => {
  const el = document.getElementById(id);
  if (el) PANEL_HOME[id] = { el: el, parent: el.parentNode, anchor: el.nextSibling };
});

/** Carpet is priced by the steam rooms above in a combined booking, so the
 *  office panel's own $110/room carpet row is hidden AND zeroed — hiding
 *  alone would leave a stale non-zero value the price reader still picks
 *  up, billing the same carpet twice. */
function setComboCarpetRow(panelId, hidden) {
  const row = document.getElementById('commercialCarpetRoomsRow');
  const input = document.getElementById('commercialCarpetRooms');
  if (row) row.hidden = hidden;
  if (hidden && input) input.value = '0';
}

/**
 * Returns every relocated panel to its original slot, hidden.
 *
 * Hiding on the way back matters: turning the combined toggle off while
 * still on the steam track moves the panel home but nothing else runs
 * afterwards to hide it, so without this the full end-of-lease panel
 * reappears above the steam controls as if that track were selected.
 * setServiceTrack calls this before its own show/hide pass, so the panel
 * that genuinely is active gets re-shown a moment later.
 */
function restoreComboPanels() {
  Object.keys(PANEL_HOME).forEach(id => {
    const home = PANEL_HOME[id];
    if (home.el.parentNode !== home.parent) {
      home.parent.insertBefore(home.el, home.anchor);
      home.el.hidden = true;
      home.el.classList.remove('is-visible');
    }
    setComboCarpetRow(id, false);
  });
}

/**
 * Shows or hides the combined full-clean panel beneath the steam controls.
 * Always restores first, so switching property type mid-selection can't
 * leave the previous panel stranded inside the steam panel.
 */
function renderComboPanel() {
  const mount = document.getElementById('steamCombinedMount');
  const toggle = document.getElementById('steamAddFullClean');
  const comboWrap = document.getElementById('steamComboWrap');
  const leaseAddons = document.getElementById('steamLeaseAddons');
  if (!mount || !toggle) return;

  const isOffice = state.steamPropertyType === 'office';
  const onSteam = state.serviceTrack === 'steam';

  // Keep the property buttons in step with state here rather than only in
  // their click handler, so a programmatic reset (new booking) visibly
  // moves the selection back instead of leaving the old one highlighted.
  const leaseBtn = document.getElementById('steamForLeaseBtn');
  const officeBtn = document.getElementById('steamForOfficeBtn');
  if (leaseBtn) leaseBtn.setAttribute('aria-pressed', String(!isOffice));
  if (officeBtn) officeBtn.setAttribute('aria-pressed', String(isOffice));

  // The two pathways offer different extras: residential gets the
  // kitchen/washroom/living-area counters, office gets a whole office
  // clean. Exactly one is ever on screen.
  if (leaseAddons) leaseAddons.hidden = isOffice;
  if (comboWrap) comboWrap.hidden = !isOffice;

  // An office-only option, so it can never be left on after switching
  // back to the residential pathway.
  if (!isOffice) state.steamCombined = false;

  const on = onSteam && isOffice && state.steamCombined;
  toggle.setAttribute('aria-pressed', String(on));
  toggle.setAttribute('aria-expanded', String(on));
  toggle.classList.toggle('is-active', on);

  restoreComboPanels();

  if (!on) {
    mount.hidden = true;
    mount.innerHTML = '';
    return;
  }

  const home = PANEL_HOME.panelCommercial;
  if (!home) return;

  mount.hidden = false;
  mount.appendChild(home.el);
  home.el.hidden = false;
  home.el.classList.add('is-visible');
  setComboCarpetRow('panelCommercial', true);
}

/** Spells out the room count, since the customer enters ADDITIONAL rooms
 *  but is buying a total that includes one. */
function renderSteamRoomsTotal() {
  const el = document.getElementById('steamRoomsTotal');
  if (!el) return;
  const extra = parseInt((document.getElementById('steamExtraRooms') || {}).value, 10) || 0;
  const total = PRICING.steam.includedRooms + extra;
  el.textContent = `Total carpeted rooms: ${total}`;
}

// Home vs office. On its own this only labels the booking (same rate
// either way) — but it also decides WHICH full-clean panel a combined
// booking pairs with, so the panel is re-rendered whenever it changes.
(function () {
  const leaseBtn = document.getElementById('steamForLeaseBtn');
  const officeBtn = document.getElementById('steamForOfficeBtn');
  if (!leaseBtn || !officeBtn) return;
  function setSteamProperty(t) {
    state.steamPropertyType = t;
    leaseBtn.setAttribute('aria-pressed', String(t === 'lease'));
    officeBtn.setAttribute('aria-pressed', String(t === 'office'));
    renderComboPanel();
    updatePrice();
  }
  leaseBtn.addEventListener('click', () => setSteamProperty('lease'));
  officeBtn.addEventListener('click', () => setSteamProperty('office'));
})();

bind('steamAddFullClean', 'click', () => {
  state.steamCombined = !state.steamCombined;
  renderComboPanel();
  updatePrice();
});

// ---------------- HEAVY-DUTY FILTER ----------------
const heavyNoBtn = document.getElementById('heavyNoBtn');
const heavyYesBtn = document.getElementById('heavyYesBtn');
const heavyModal = document.getElementById('heavyModal');
const conditionsNextBtn = document.getElementById('conditionsNextBtn');

function setHeavyDuty(isHeavy) {
  state.heavyDuty = isHeavy;
  heavyNoBtn.setAttribute('aria-pressed', String(!isHeavy));
  heavyYesBtn.setAttribute('aria-pressed', String(isHeavy));
  conditionsNextBtn.disabled = isHeavy;
  conditionsNextBtn.style.opacity = isHeavy ? 0.5 : 1;
  if (isHeavy) heavyModal.hidden = false;
}
heavyNoBtn.addEventListener('click', () => setHeavyDuty(false));
heavyYesBtn.addEventListener('click', () => setHeavyDuty(true));
document.getElementById('heavyModalClose').addEventListener('click', () => {
  heavyModal.hidden = true;
  setHeavyDuty(false); // let them re-answer instead of getting stuck
});
document.getElementById('heavyModalRefer').addEventListener('click', async () => {
  const comment = document.getElementById('heavyModalComment').value.trim();
  heavyModal.hidden = true;

  const result = await triggerReferralWebhook({
    serviceTrack: state.serviceTrack,
    location: { suburb: document.getElementById('serviceSuburb').value },
    comment
  });
  if (!result.ok) {
    console.warn('[referral] Notification may not have reached management — check ZAPIER_WEBHOOK_URL is configured:', result.error);
  }

  alert('Thanks — we\'ve flagged this as a restoration referral. A partner specialist will be in touch.');
});

// Previously did nothing — the button existed in the HTML but had no
// listener at all, so clicking it silently failed to do anything.
document.getElementById('heavyModalHome').addEventListener('click', () => {
  heavyModal.hidden = true;
  document.getElementById('returnHomeBtn').click(); // reuse the existing full reset
});

// ---------------- PHOTO UPLOAD ----------------
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keypress', (e) => { if (e.key === 'Enter') fileInput.click(); });
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('is-dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('is-dragover');
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => {
  handleFiles(fileInput.files);
  fileInput.value = ''; // allow re-selecting the same file after a delete
});

/**
 * Uploads and scores each file individually (not as a batch), so every
 * photo has its own tracked adjustmentPct — required for delete to work
 * correctly, since removing one photo needs to recompute the average from
 * exactly what's left, not an approximation.
 */
function handleFiles(files) {
  const fileArr = Array.from(files);
  if (fileArr.length === 0) return;

  const statusEl = document.getElementById('aiPhotoStatus');
  statusEl.hidden = false;
  statusEl.textContent = 'Reviewing your photo(s)…';

  Promise.all(fileArr.map(file => scoreOnePhoto(file))).then(results => {
    results.forEach(r => state.uploadedPhotos.push(r));
    recomputePhotoAdjustment();
    renderFileList();

    const last = results[results.length - 1];
    const changeText = Math.abs(state.photoAdjustmentPct) < 0.005
      ? 'no change to your estimate'
      : `estimate adjusted ${state.photoAdjustmentPct > 0 ? '+' : ''}${Math.round(state.photoAdjustmentPct * 100)}% based on what we could see`;
    // Showing the model's own reason turns an opaque number into something
    // the customer can sanity-check, and makes it obvious in testing that
    // the photo was genuinely looked at.
    const sourceTag = CONFIG.FUNCTIONS_URL
      ? (last.source === 'ai'
          ? (last.reason ? ` — ${last.reason}` : ' [AI-reviewed]')
          : ' (AI review unavailable right now, so your standard price applies)')
      : '';

    statusEl.textContent = `Photo review complete — ${changeText}.${sourceTag}`;
    statusEl.classList.remove('is-sprayed');
    void statusEl.offsetWidth;
    statusEl.classList.add('is-sprayed');

    updatePrice();
  });
}

/**
 * Uploads + scores ONE photo, returning everything needed to display it
 * and later delete it: { id, name, path, adjustmentPct, source, fallbackReason }.
 * Uses the real vision API (via upload-photo + verify-photo) when Supabase
 * is configured, otherwise the local brightness/contrast heuristic.
 */
async function scoreOnePhoto(file) {
  const localId = 'ph_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // Without the AI service there is no honest way to judge condition from
  // a photo (the old fallback guessed from brightness, so a dim photo of a
  // spotless room raised the price). No AI review means no adjustment.
  if (!CONFIG.FUNCTIONS_URL) {
    return { id: localId, name: file.name, path: null, adjustmentPct: 0, source: 'local', fallbackReason: 'AI review not configured' };
  }

  try {
    const uploadForm = new FormData();
    uploadForm.append('file', file);
    uploadForm.append('bookingId', state.bookingId || '');

    const uploadResponse = await fetch(`${CONFIG.FUNCTIONS_URL}/upload-photo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
        'apikey': CONFIG.SUPABASE_ANON_KEY
      },
      body: uploadForm
      // No Content-Type header on purpose — the browser sets the correct
      // multipart/form-data boundary automatically for FormData.
    });

    if (!uploadResponse.ok) {
      const errBody = await uploadResponse.json().catch(() => ({}));
      throw new Error(errBody.error || `upload-photo returned ${uploadResponse.status}`);
    }
    const { path } = await uploadResponse.json();

    const response = await fetch(`${CONFIG.FUNCTIONS_URL}/verify-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
        'apikey': CONFIG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        serviceTrack: state.serviceTrack,
        bookingId: state.bookingId,
        storagePath: path
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `verify-photo returned ${response.status}`);
    }

    const result = await response.json();
    // verify-photo answers 200 even when Gemini itself fails, so the body
    // must be checked too. Treating that as success reported a confident
    // "no change" — which is exactly how the image never reaching Gemini
    // went unnoticed.
    if (result.note === 'GEMINI_API_KEY not set') {
      throw new Error('GEMINI_API_KEY not configured on the server');
    }
    if (result.error) {
      throw new Error(result.error);
    }

    return { id: localId, name: file.name, path,
             adjustmentPct: result.adjustmentPct || 0, source: 'ai',
             reason: result.reason || '' };
  } catch (err) {
    console.warn('[photo verification] AI review failed — no price adjustment applied:', err);
    return { id: localId, name: file.name, path: null, adjustmentPct: 0, source: 'local', fallbackReason: err.message || String(err) };
  }
}

function recomputePhotoAdjustment() {
  if (state.uploadedPhotos.length === 0) {
    state.photoAdjustmentPct = 0;
    return;
  }
  const sum = state.uploadedPhotos.reduce((s, p) => s + p.adjustmentPct, 0);
  state.photoAdjustmentPct = sum / state.uploadedPhotos.length;
}

/**
 * Removes a photo the customer no longer wants included — the whole
 * point being this can happen any time before payment, not just as an
 * append-only list. Recomputes the price adjustment from what's left,
 * and best-effort cleans up the uploaded file + its booking_photos row
 * server-side too (via delete-photo), so nothing orphaned lingers in
 * storage for a photo the customer explicitly removed.
 */
function removePhoto(photoId) {
  const index = state.uploadedPhotos.findIndex(p => p.id === photoId);
  if (index === -1) return;
  const [removed] = state.uploadedPhotos.splice(index, 1);
  recomputePhotoAdjustment();
  renderFileList();
  updatePrice();

  const statusEl = document.getElementById('aiPhotoStatus');
  if (state.uploadedPhotos.length === 0) {
    statusEl.hidden = true;
  } else {
    statusEl.hidden = false;
    statusEl.textContent = Math.abs(state.photoAdjustmentPct) < 0.005
      ? 'Photo review complete — no change to your estimate.'
      : `Photo review complete — estimate adjusted ${state.photoAdjustmentPct > 0 ? '+' : ''}${Math.round(state.photoAdjustmentPct * 100)}% based on what we could see.`;
  }

  if (removed.path && CONFIG.FUNCTIONS_URL) {
    fetch(`${CONFIG.FUNCTIONS_URL}/delete-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
        'apikey': CONFIG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ path: removed.path, bookingId: state.bookingId })
    }).catch(err => console.warn('[delete-photo] cleanup call failed (non-critical):', err));
  }
}

function renderFileList() {
  fileList.innerHTML = state.uploadedPhotos.map(p => `
    <span class="file-chip">📷 ${escapeHtmlBasic(p.name)}
      <button type="button" class="file-chip__remove" aria-label="Remove ${escapeHtmlBasic(p.name)}" data-remove-photo="${p.id}">✕</button>
    </span>
  `).join('');
  fileList.querySelectorAll('[data-remove-photo]').forEach(btn => {
    btn.addEventListener('click', () => removePhoto(btn.dataset.removePhoto));
  });
}

// ---------------- CAMERA CAPTURE ----------------
// A second way to add a photo besides drag-drop/browse ("the library") —
// opens the device camera live, lets the customer see a preview, and
// captures a still frame into the same upload pipeline as any other file.
let cameraStream = null;

document.getElementById('openCameraBtn').addEventListener('click', async () => {
  const panel = document.getElementById('cameraPanel');
  const video = document.getElementById('cameraVideo');
  const errorEl = document.getElementById('cameraError');
  errorEl.textContent = '';
  panel.hidden = false;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    errorEl.textContent = 'Camera access isn\'t supported in this browser. Please use "Drag & drop" / "click to browse" instead.';
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = cameraStream;
  } catch (err) {
    errorEl.textContent = 'Couldn\'t access your camera — check your browser\'s camera permission for this site, or use "Drag & drop" / "click to browse" instead.';
  }
});

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  document.getElementById('cameraPanel').hidden = true;
}
document.getElementById('closeCameraBtn').addEventListener('click', stopCamera);

document.getElementById('captureBtn').addEventListener('click', () => {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  if (!video.videoWidth) return; // camera not actually ready yet

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(blob => {
    if (!blob) return;
    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
    handleFiles([file]);
    stopCamera();
  }, 'image/jpeg', 0.9);
});

// ---------------- LIVE PRICE CALCULATION ----------------
function getResidentialInputs() {
  const kitchensEl = document.getElementById('resKitchens');
  const kitchens = kitchensEl ? (parseInt(kitchensEl.value, 10) || 1) : 1;
  return {
    bedrooms: parseInt(document.getElementById('bedrooms').value, 10),
    bathrooms: parseInt(document.getElementById('bathrooms').value, 10),
    kitchens: kitchens,
    extraLiving: parseInt(document.getElementById('livingAreas').value, 10) || 0,
    multiStorey: isToggled('multiStoreyBtn'),
    // No carpetRooms: carpet steam is its own service track now, so the
    // end-of-lease path neither collects nor prices it.
    oven: isToggled('addonOven')
  };
}
function getCommercialInputs() {
  // Tolerate a missing control rather than throwing — same reasoning as
  // bind() above: an out-of-date HTML file should not break pricing.
  const num = id => { const el = document.getElementById(id); return el ? (parseInt(el.value, 10) || 0) : 0; };
  const on  = id => { const el = document.getElementById(id); return el ? el.checked : false; };
  return {
    sqm: parseInt(sqmInput.value, 10),
    desks: num('desks'),
    bins: num('bins'),
    toilets: num('toilets'),
    kitchens: num('kitchens'),
    carpetRooms: num('commercialCarpetRooms'),
    cleanType: state.commercialCleanType || 'standard',
    frequency: document.getElementById('frequency').value,
    addOns: {
      multiStorey: isToggled('addMultiStoreyBtn'),
      highDusting: on('addHighDusting'),
      glass:       on('addGlass'),
      fridge:      on('addFridge'),
      dishwasher:  on('addDishwasher'),
      microwave:   on('addMicrowave')
    }
  };
}

function getSteamInputs() {
  const num = id => { const el = document.getElementById(id); return el ? (parseInt(el.value, 10) || 0) : 0; };
  const propertyType = state.steamPropertyType || 'lease';
  const isOffice = propertyType === 'office';

  const inputs = {
    extraRooms: num('steamExtraRooms'),
    propertyType: propertyType,
    // A full office clean is only offered on the office pathway.
    combined: isOffice && !!state.steamCombined,
    // The kitchen/washroom/living-area extras belong to the residential
    // pathway. Zeroed on the office pathway so a value left behind by
    // someone switching across can't quietly stay on the bill.
    addons: isOffice ? {} : {
      kitchens:    num('steamKitchens'),
      washrooms:   num('steamWashrooms'),
      livingAreas: num('steamLivingAreas')
    }
  };

  // Read the office panel through its normal reader. The panel is the
  // same DOM it always was — only its position on the page changed — so
  // nothing here needs to know it has been relocated.
  if (inputs.combined) inputs.sub = getCommercialInputs();
  return inputs;
}

let lastResult = { total: 0, breakdown: [] };
let lastRawInputs = {};

function updatePrice() {
  let result;
  if (state.serviceTrack === 'residential') {
    lastRawInputs = getResidentialInputs();
    result = calculateResidentialPrice(lastRawInputs);
  } else if (state.serviceTrack === 'steam') {
    lastRawInputs = getSteamInputs();
    result = lastRawInputs.combined
      ? calculateCombinedPrice(lastRawInputs)
      : calculateSteamPrice(lastRawInputs);
  } else {
    lastRawInputs = getCommercialInputs();
    result = calculateCommercialPrice(lastRawInputs);
  }

  let total = result.total;
  const breakdown = [...result.breakdown];

  if (state.photoAdjustmentPct) {
    const adjustmentAmount = total * state.photoAdjustmentPct;
    total += adjustmentAmount;
    breakdown.push({
      label: `AI photo review (${state.photoAdjustmentPct > 0 ? '+' : ''}${Math.round(state.photoAdjustmentPct * 100)}%)`,
      amount: adjustmentAmount
    });
  }

  const daysUntil = daysUntilPreferredDate();
  if (daysUntil !== null && daysUntil >= 0 && daysUntil <= PRICING.urgent.maxDays) {
    const surcharge = total * PRICING.urgent.surchargePct;
    total += surcharge;
    breakdown.push({
      label: `Urgent booking (within ${PRICING.urgent.maxDays * 24} hours, +${Math.round(PRICING.urgent.surchargePct * 100)}%)`,
      amount: surcharge
    });
  }

  lastResult = { total, breakdown, hitFloor: result.hitFloor };

  // Only call the range "AI-verified" once the AI has actually reviewed a
  // photo; before that it is a standard estimate from the details entered.
  const headerEl = document.querySelector('.price-sidebar-header');
  if (headerEl) {
    const aiReviewed = state.uploadedPhotos.some(ph => ph.source === 'ai');
    headerEl.textContent = aiReviewed ? 'AI-verified estimate (incl. GST)' : 'Your estimate (incl. GST)';
  }

  // Display the GST-INCLUSIVE range in the sidebar. Melbourne
  // competitors all advertise GST-inclusive fixed prices, so showing an
  // excl-GST figure here made this look ~10% cheaper than it actually
  // was, then surprised the customer with the real total at checkout.
  // The breakdown rows below stay excl-GST (they're component costs),
  // and the checkout still shows subtotal / GST / total in full.
  const range = toEstimatedRange(calculateGst(total).total);
  const priceLowEl = document.getElementById('priceLow');
  const priceHighEl = document.getElementById('priceHigh');
  const previousLow = parseInt((priceLowEl.textContent || '$0').replace(/\D/g, ''), 10) || 0;
  const previousHigh = parseInt((priceHighEl.textContent || '$0').replace(/\D/g, ''), 10) || 0;
  animateNumber(priceLowEl, previousLow, range.low);
  animateNumber(priceHighEl, previousHigh, range.high);
  pulsePriceAmount();

  // The component rows are excl-GST, but the headline range above is
  // incl-GST — without a GST row the breakdown visibly fails to add up
  // to the price being advertised, which reads as a hidden markup.
  const gstOnTotal = calculateGst(total);
  document.getElementById('priceBreakdown').innerHTML = breakdown
    .map(item => `<div><span>${item.label}</span><span class="mono">$${item.amount.toFixed(2)}</span></div>`)
    .join('')
    + (result.hitFloor ? `<div><span>Minimum call-out floor applied</span><span class="mono">$${PRICING.commercial.minimumCallOut.toFixed(2)}</span></div>` : '')
    + `<div><span>GST (10%)</span><span class="mono">$${gstOnTotal.gst.toFixed(2)}</span></div>`
    + `<div class="breakdown__total"><span>Estimated total</span><span class="mono">$${gstOnTotal.total.toFixed(2)}</span></div>`;
  applyPriceRowStagger();
}

/* ---------------- LONG-TERM / RECURRING ENQUIRY ----------------
   Step 2 offers an optional route out of the one-off wizard: recurring and
   contract work is quoted on a special rate, so it goes to a human instead
   of through checkout.

   Everything the customer typed on step 1 is handed to the homepage
   contact box through sessionStorage, so the email they end up sending is
   already filled in and the only thing left to type is which days they
   need us. sessionStorage (not localStorage) on purpose: it's scoped to
   this tab and clears when the tab closes, so a shared or public computer
   doesn't keep a stranger's contact details around. */
const LONG_TERM_KEY = 'sparkCleanLongTermEnquiry';

function buildLongTermEnquiry() {
  const val = id => (document.getElementById(id) || {}).value || '';
  const timeLabels = {
    morning: 'Morning (8am–12pm)', evening: 'Evening (1pm–5pm)',
    midday: 'Midday (11am–2pm)', afternoon: 'Afternoon (2pm–5pm)'
  };
  const track = state.serviceTrack;
  const gst = calculateGst(lastResult.total);

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    customer: {
      name: val('custName').trim(),
      phone: val('custPhone').trim(),
      email: val('custEmail').trim()
    },
    service: {
      track,
      label: currentServiceLabel(),
      steamPropertyType: track === 'steam'
        ? (state.steamPropertyType === 'office' ? 'Office / commercial' : 'Home / end of lease')
        : null,
      city: val('serviceCity'),
      suburb: val('serviceSuburb').trim(),
      preferredDate: val('preferredDate'),
      preferredTime: timeLabels[val('preferredTime')] || val('preferredTime')
    },
    // The live breakdown doubles as the "sizing and requirements" list —
    // it's already an itemised, human-readable description of the job.
    sizing: lastResult.breakdown.map(item => ({
      label: item.label,
      amount: Number(item.amount.toFixed(2))
    })),
    estimate: { subtotal: gst.subtotal, gst: gst.gst, total: gst.total }
  };
}

bind('longTermContactBtn', 'click', () => {
  // Reuse step 1's own validators so the enquiry can't be sent with a
  // blank name or an unusable phone/email — the whole point is that the
  // customer doesn't have to retype any of it on the other side.
  const ok = [validateNameField(), validatePhoneField(), validateEmailField()]
    .every(Boolean);
  if (!ok) {
    goToStep(1);
    return;
  }

  try {
    sessionStorage.setItem(LONG_TERM_KEY, JSON.stringify(buildLongTermEnquiry()));
  } catch (err) {
    // Private browsing or a full quota — still worth sending them to the
    // contact box, they'll just have to describe the job themselves.
    console.warn('[long-term] could not stash enquiry details:', err);
  }
  window.location.href = 'index.html?contact=longterm#contact';
});

// ---------------- REVIEW / CONFIRMATION ----------------
function currentBookingData() {
  return {
    id: state.bookingId || null,
    status: 'pending', // pending | confirmed | cancelled — set by admin
    serviceTrack: state.serviceTrack,
    calculatedPrice: lastResult.total,
    // GST-inclusive, the same figures the customer was shown.
    priceRange: toEstimatedRange(calculateGst(lastResult.total).total),
    roomMetrics: lastResult.breakdown,
    roomMetricsRaw: lastRawInputs,
    customer: {
      name: document.getElementById('custName').value.trim(),
      phone: document.getElementById('custPhone').value.trim(),
      email: document.getElementById('custEmail').value.trim()
    },
    location: {
      city: document.getElementById('serviceCity').value,
      suburb: document.getElementById('serviceSuburb').value.trim()
    },
    schedule: {
      preferredDate: document.getElementById('preferredDate').value,
      preferredTime: document.getElementById('preferredTime').value,
      confirmedDate: null,
      confirmedTime: null
    },
    // Only meaningful on the steam track; null elsewhere so a downstream
    // reader can't mistake a default for a real answer.
    steamPropertyType: state.serviceTrack === 'steam' ? state.steamPropertyType : null,
    // Plain-language name of what was booked, including a combined steam
    // + full clean. serviceTrack alone says 'steam' for both, so without
    // this the crew sheet can't tell a carpet-only visit from a whole job.
    serviceLabel: currentServiceLabel(),
    // Which full clean (if any) was booked alongside the steam clean.
    combinedWith: (state.serviceTrack === 'steam' && state.steamCombined)
      ? (state.steamPropertyType === 'office' ? 'commercial' : 'residential')
      : null,
    // The overtime terms the customer was actually shown at checkout,
    // snapshotted onto the booking. If the rate is ever changed in
    // pricing.js, past bookings still carry the deal they agreed to.
    jobDuration: {
      includedHours: PRICING.jobDuration.includedHours,
      extraHourRate: PRICING.jobDuration.extraHourRate
    },
    extraCharge: 0,
    aiAdjustmentPct: state.photoAdjustmentPct || 0,
    createdAt: new Date().toISOString()
  };
}

/**
 * Saves a booking to the real database (Supabase `orders` table) when
 * CONFIG.SUPABASE_URL/ANON_KEY are set in js/config.js. Falls back to
 * localStorage — same-browser only, for local testing — when not
 * configured, so the site keeps working either way.
 */
async function saveBooking(booking) {
  const saveLocally = () => {
    const KEY = 'sparkCleanBookings';
    const existing = JSON.parse(localStorage.getItem(KEY) || '[]');
    existing.push(booking);
    localStorage.setItem(KEY, JSON.stringify(existing));
  };

  if (CONFIG.FUNCTIONS_URL) {
    try {
      const response = await fetch(`${CONFIG.FUNCTIONS_URL}/create-booking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
          'apikey': CONFIG.SUPABASE_ANON_KEY
        },
        body: JSON.stringify(booking)
      });

      if (response.status === 429) {
        // Rate-limited — this is a deliberate block, not a network problem.
        // Don't fall back to localStorage and pretend it worked.
        const result = await response.json().catch(() => ({}));
        return { savedRemotely: false, rateLimited: true, error: result.error };
      }

      if (response.status === 400) {
        // A validation rejection (bad phone format, implausible price, etc.)
        // is a data problem, not a connection problem — showing the generic
        // "connection dropped" message here would be actively misleading
        // and send you chasing the wrong fix, which is exactly what happened
        // during testing. Surface the real reason instead.
        const result = await response.json().catch(() => ({}));
        return { savedRemotely: false, validationError: true, error: result.error };
      }

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || `Server returned ${response.status}`);
      }

      return { savedRemotely: true };
    } catch (err) {
      // A dropped connection here means the customer has ALREADY been
      // charged (this runs after confirmStripePayment succeeds) — we must
      // never let this throw uncaught and strand them on a frozen
      // "Processing…" button. Fall through to the local safety net, and
      // pass the real error message through so it can be shown on-screen
      // — much easier to act on than digging through browser DevTools.
      console.error('[saveBooking] create-booking function failed, falling back to local storage:', err);
      saveLocally();
      return { savedRemotely: false, errorDetail: err.message || String(err) };
    }
  }

  saveLocally();
  return { savedRemotely: false };
}

// ---------------- PAYMENT ----------------
const payBtn = document.getElementById('payBtn');
const lowValueNotice = document.getElementById('lowValueNotice');

function checkLowValueWarning() {
  lowValueNotice.hidden = lastResult.total >= 150;
}

function renderGstBreakdown(overrideGst, targetId) {
  const gst = overrideGst || calculateGst(lastResult.total);
  const el = document.getElementById(targetId || 'gstBreakdown');
  if (el) el.innerHTML = `
    <div><span>Subtotal (excl. GST)</span><span class="mono">$${gst.subtotal.toFixed(2)}</span></div>
    <div><span>GST (10%)</span><span class="mono">$${gst.gst.toFixed(2)}</span></div>
    <div class="gst-total"><span>Total charged today</span><span class="mono">$${gst.total.toFixed(2)}</span></div>
  `;
  return gst;
}

/**
 * Step 4 (Order Review) — the receipt the customer checks before paying.
 * Shows exactly what's in state.lockedGst: the base price if no photos
 * were reviewed, or the AI-adjusted price (already folded into
 * lastResult.breakdown as its own line) if they were.
 */
function renderOrderReview(gst) {
  const booking = currentBookingData();
  const summaryEl = document.getElementById('orderReviewSummary');
  if (!summaryEl) return;

  const itemsHtml = lastResult.breakdown.map(item => `
    <div><span>${item.label}</span><span class="mono">$${item.amount.toFixed(2)}</span></div>
  `).join('');

  const dateLabel = booking.schedule.preferredDate
    ? `${booking.schedule.preferredDate} — ${({
        morning: 'Morning (8am–12pm)', evening: 'Evening (1pm–5pm)',
        // Superseded slot names, kept for bookings made before the change.
        midday: 'Midday (11am–2pm)', afternoon: 'Afternoon (2pm–5pm)'
      })[booking.schedule.preferredTime] || booking.schedule.preferredTime}`
    : 'To be confirmed';

  const photoNote = state.uploadedPhotos.length > 0
    ? `AI-reviewed from ${state.uploadedPhotos.length} photo${state.uploadedPhotos.length === 1 ? '' : 's'} you uploaded.`
    : 'No photos uploaded — this is the standard quoted price for the details above.';

  // Surfaced at the TOP of the receipt, above the line items — the
  // customer sees the 3-hour cap and the overtime rate before the price,
  // not buried under it.
  const durationEl = document.getElementById('reviewDurationNotice');
  if (durationEl) {
    const durationText = typeof jobDurationPolicyText === 'function'
      ? jobDurationPolicyText(booking.serviceTrack)
      : '';
    durationEl.textContent = durationText;
    durationEl.hidden = !durationText;
  }

  summaryEl.innerHTML = `
    <div class="order-review-block">
      <h4>Service</h4>
      <p>${currentServiceLabel()} — ${escapeHtmlBasic(booking.location.suburb || 'Melbourne')}, VIC</p>
    </div>
    <div class="order-review-block">
      <h4>Scheduled for</h4>
      <p>${dateLabel}</p>
    </div>
    <div class="order-review-block">
      <h4>Selected items</h4>
      <div class="price-breakdown">${itemsHtml}</div>
      <p class="field-hint" style="margin-top:8px">${photoNote}</p>
    </div>
  `;
  renderGstBreakdown(gst, 'orderReviewGst');
}

payBtn.addEventListener('click', async () => {
  checkLowValueWarning();
  // Use the amount locked in when this step first mounted the payment
  // form, NOT a fresh recalculation — Payment Element's PaymentIntent
  // was already created for state.lockedGst.total specifically, so
  // charging/recording anything else here would mismatch what Stripe
  // actually processes.
  const gst = state.lockedGst || renderGstBreakdown();

  const cardholderName = document.getElementById('cardholderName').value.trim();
  if (!cardholderName && isOnlinePaymentEnabled()) {
    alert('Please enter the name on the card before confirming your booking.');
    return;
  }

  payBtn.disabled = true;
  payBtn.textContent = 'Processing…';

  // Create (and rate-limit-check) the booking record BEFORE charging —
  // this order matters: if we charged first and the save was rejected
  // (rate limit or otherwise), the customer would be charged with no
  // booking on file. Creating first means a rejection here never costs
  // anyone money — at worst it leaves an unpaid, ignorable record.
  // Note: state.bookingId is NOT regenerated here — it was set once at
  // page load, specifically so any photos uploaded back on step 5 (which
  // happens before this point) share the same ID and end up linked to
  // this booking in booking_photos once it exists.
  const booking = currentBookingData();
  booking.gst = gst;
  // Store the phone in one canonical shape. create-booking saves whatever
  // it is given, and the lookup normalises before querying — if the stored
  // value keeps the customer's spacing they can never find their booking.
  booking.customer.phone = normalisePhone(booking.customer.phone);

  const saveResult = await saveBooking(booking);

  if (saveResult.rateLimited) {
    alert(saveResult.error || "We couldn't process this booking right now. Please contact us directly.");
    payBtn.disabled = false;
    payBtn.textContent = 'Confirm booking';
    return;
  }

  if (saveResult.validationError) {
    alert(`Please check your details: ${saveResult.error || 'something in your booking looks invalid.'}`);
    payBtn.disabled = false;
    payBtn.textContent = 'Confirm booking';
    return;
  }

  // The amount was already locked in when the PaymentIntent was created
  // back when this step first mounted — confirmStripePayment no longer
  // takes an amount, only the cardholder name.
  const paymentResult = await confirmStripePayment(cardholderName);

  if (!paymentResult.success) {
    alert(`Payment could not be confirmed: ${paymentResult.error || 'unknown error'}`);
    payBtn.disabled = false;
    payBtn.textContent = 'Confirm booking';
    return;
  }

  // Fill in the PaymentIntent ID now that Stripe has actually returned one —
  // best-effort: a failure here shouldn't block the customer's confirmation,
  // since the payment already succeeded and the booking already exists.
  if (paymentResult.paymentIntent?.id && CONFIG.FUNCTIONS_URL) {
    try {
      await fetch(`${CONFIG.FUNCTIONS_URL}/record-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
          'apikey': CONFIG.SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ bookingId: state.bookingId, paymentIntentId: paymentResult.paymentIntent.id })
      });
    } catch (err) {
      console.error('[payment] record-payment call failed:', err);
    }
  }

  // The webhook is best-effort even on a good connection (see webhook.js) —
  // wrapped here too so a drop here specifically can never strand the UI
  // after the customer has already been charged.
  try {
    await triggerLeadWebhook(booking);
  } catch (err) {
    console.error('[payment] Lead webhook failed after successful payment:', err);
  }
  localStorage.setItem('sparkCleanMyPhone', booking.customer.phone);

  state.paidOnline = !paymentResult.demo;
  state.lastBookingSyncFailed = !saveResult.savedRemotely && !!CONFIG.FUNCTIONS_URL;
  state.lastBookingSyncErrorDetail = saveResult.errorDetail || '';

  payBtn.disabled = false;
  payBtn.textContent = 'Confirm booking';
  goToStep(6);
});

function renderConfirmationSummary() {
  const booking = currentBookingData();
  const syncWarning = state.lastBookingSyncFailed
    ? `<p class="notice notice--warn">⚠️ Your payment succeeded, but we had trouble saving your booking details just now. <strong>Please save this reference number and screenshot this screen</strong> — contact us with it if you don't receive a confirmation text within a few hours: <span class="mono">${state.bookingId || ''}</span>${state.lastBookingSyncErrorDetail ? `<br><span class="mono" style="font-size:.8em;">Technical detail: ${escapeHtmlBasic(state.lastBookingSyncErrorDetail)}</span>` : ''}</p>`
    : '';
  document.getElementById('confirmationSummary').innerHTML = `
    ${syncWarning}
    <p><strong>${escapeHtmlBasic(booking.customer.name)}</strong> — ${escapeHtmlBasic(booking.location.suburb || 'Melbourne')}, VIC</p>
    <p>Service: ${currentServiceLabel()}</p>
    <p>Total: <span class="mono">$${(state.lockedGst || calculateGst(booking.calculatedPrice)).total.toFixed(2)}</span> (incl. GST)</p>
    <p>Booking reference: <span class="mono">${state.bookingId || ''}</span></p>
    ${state.paidOnline ? '' : '<p class="microcopy">No card was charged online. We will contact you to arrange payment.</p>'}
    <p class="microcopy">After your clean is completed, we'll text you a link to rate the job and leave a review. <a href="feedback.html?bookingId=${encodeURIComponent(state.bookingId || '')}">Preview that feedback page →</a></p>
  `;
}

// ---------------- MY BOOKING STATUS ----------------
const myBookingModal = document.getElementById('myBookingModal');
const myBookingPhone = document.getElementById('myBookingPhone');

document.getElementById('myBookingBtn').addEventListener('click', () => {
  myBookingModal.hidden = false;
  showMyBookingLookupView();
  const rememberedPhone = localStorage.getItem('sparkCleanMyPhone');
  if (rememberedPhone) {
    myBookingPhone.value = rememberedPhone;
    runMyBookingLookup(rememberedPhone);
  }
});
document.getElementById('myBookingCloseBtn').addEventListener('click', () => { myBookingModal.hidden = true; });
document.getElementById('myBookingSearchAgainBtn').addEventListener('click', showMyBookingLookupView);

function showMyBookingLookupView() {
  document.getElementById('myBookingLookupView').hidden = false;
  document.getElementById('myBookingResultsView').hidden = true;
  document.getElementById('myBookingError').textContent = '';
}

document.getElementById('myBookingLookupBtn').addEventListener('click', () => {
  const phone = myBookingPhone.value.trim();
  const errorEl = document.getElementById('myBookingError');
  if (!phone || !isValidAuPhone(phone)) {
    errorEl.textContent = 'Enter the phone number you booked with, e.g. 0412 345 678 or 03 9123 4567.';
    return;
  }
  errorEl.textContent = '';
  runMyBookingLookup(phone);
});

async function runMyBookingLookup(phone) {
  let results;
  if (CONFIG.FUNCTIONS_URL) {
    try {
      const response = await fetch(`${CONFIG.FUNCTIONS_URL}/lookup-booking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
          'apikey': CONFIG.SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ phone: normalisePhone(phone) })
      });
      if (response.status === 429) {
        const result = await response.json().catch(() => ({}));
        document.getElementById('myBookingList').innerHTML = `<p class="microcopy">${escapeHtmlBasic(result.error || 'Too many lookups — please try again later.')}</p>`;
        document.getElementById('myBookingLookupView').hidden = true;
        document.getElementById('myBookingResultsView').hidden = false;
        return;
      }
      const result = await response.json();
      results = (result.bookings || []).map(row => ({
        status: row.status, serviceTrack: row.service_track,
        calculatedPrice: row.calculated_price, extraCharge: row.extra_charge || 0,
        schedule: { preferredDate: row.preferred_date, preferredTime: row.preferred_time, confirmedDate: row.confirmed_date, confirmedTime: row.confirmed_time }
      }));
    } catch (err) {
      console.warn('[my-booking] lookup-booking function failed, falling back to local storage:', err);
      const local = JSON.parse(localStorage.getItem('sparkCleanBookings') || '[]');
      const wanted = normalisePhone(phone);
      results = local.filter(b => normalisePhone(b.customer?.phone) === wanted).reverse();
    }
  } else {
    const local = JSON.parse(localStorage.getItem('sparkCleanBookings') || '[]');
    const wanted = normalisePhone(phone);
    results = local.filter(b => normalisePhone(b.customer?.phone) === wanted).reverse();
  }
  renderMyBookingResults(results);
}

function renderMyBookingResults(results) {
  const listEl = document.getElementById('myBookingList');
  document.getElementById('myBookingLookupView').hidden = true;
  document.getElementById('myBookingResultsView').hidden = false;

  if (results.length === 0) {
    listEl.innerHTML = '<p class="microcopy">No bookings found.</p>';
    return;
  }

  listEl.innerHTML = results.map(b => `
    <div class="my-booking-card">
      <div class="my-booking-card__row">
        <strong>${serviceTrackLabel(b.serviceTrack)}</strong>
        <span class="status-badge status-badge--${b.status}">${b.status}</span>
      </div>
      <p class="my-booking-card__eta">${formatTimeUntilService(b.schedule.confirmedDate || b.schedule.preferredDate, b.schedule.confirmedTime || b.schedule.preferredTime)}</p>
      <p class="mono">$${calculateGst(Number(b.calculatedPrice) + Number(b.extraCharge || 0)).total.toFixed(2)} <span class="microcopy">incl. GST</span></p>
    </div>
  `).join('');
}

function timeSlotToHour(slot) {
  if (slot === 'morning') return 10;   // 8am–12pm window
  if (slot === 'evening') return 15;   // 1pm–5pm window
  // Superseded slot names — kept so bookings made before the two-slot
  // change still resolve to a sensible hour instead of falling through
  // to the 9am default.
  if (slot === 'midday') return 12;
  if (slot === 'afternoon') return 14;
  const match = /^(\d{2}):(\d{2})/.exec(slot || '');
  if (match) return parseInt(match[1], 10) + parseInt(match[2], 10) / 60;
  return 9;
}

function formatTimeUntilService(dateStr, timeSlotOrTime) {
  if (!dateStr) return 'Date to be confirmed by management';
  const hour = timeSlotToHour(timeSlotOrTime);
  const target = new Date(dateStr + 'T00:00:00');
  if (isNaN(target.getTime())) return 'Date to be confirmed by management';
  target.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  const diffMs = target - new Date();
  const diffDays = diffMs / 86400000;
  // Sanity bounds: a booking date more than 2 years out or in the past
  // almost always means a stray/mistyped date (e.g. a date picker quirk
  // where a 2-digit year like "26" gets read as year 0026) rather than a
  // real booking that far away — show a safe fallback instead of a
  // nonsense "in 71403 days" figure.
  if (diffDays < 0) return 'Scheduled time has passed';
  if (diffDays > 730) return 'Date to be confirmed by management';
  const diffHours = diffMs / 3600000;
  if (diffHours < 24) return `Cleaner arriving in about ${Math.round(diffHours)} hour${Math.round(diffHours) === 1 ? '' : 's'}`;
  const diffDaysRounded = Math.round(diffHours / 24);
  return `Cleaner arriving in about ${diffDaysRounded} day${diffDaysRounded === 1 ? '' : 's'}`;
}

// Phones show the price as a docked bar; tapping it opens the breakdown.
// Harmless on desktop, where the breakdown is always visible.
bind('priceSidebar', 'click', () => {
  document.getElementById('priceSidebar').classList.toggle('is-open');
});

// ---------------- INIT ----------------
// ---------------- CONNECTION STATUS ----------------
// Nothing the customer has typed is ever lost when the connection drops —
// it all stays in the DOM/state exactly as entered. This just stops them
// from submitting into a network that isn't there, and clearly explains
// why, rather than a request silently failing or hanging.
function updateConnectionBanner() {
  const banner = document.getElementById('connectionBanner');
  const offline = !navigator.onLine;
  banner.hidden = !offline;
  document.querySelectorAll('[data-next], #payBtn').forEach(btn => {
    btn.disabled = offline;
  });
  // Reconciliation: the heavy-duty condition gate (step 2) has its own
  // reason to stay disabled that's independent of connectivity — don't
  // let reconnecting silently override it.
  if (!offline && state.heavyDuty) {
    document.getElementById('conditionsNextBtn').disabled = true;
  }
}
window.addEventListener('online', updateConnectionBanner);
window.addEventListener('offline', updateConnectionBanner);
updateConnectionBanner();

(function setDateBounds() {
  const today = new Date();
  const twoYearsOut = new Date();
  twoYearsOut.setFullYear(today.getFullYear() + 2);
  const toISODate = d => d.toISOString().slice(0, 10);
  const dateInput = document.getElementById('preferredDate');
  dateInput.min = toISODate(today);
  dateInput.max = toISODate(twoYearsOut);
})();

function resetWizardToStart() {
  state.step = 1;
  setHeavyDuty(false); // resets both state.heavyDuty AND the toggle buttons/Continue button's visual state
  state.uploadedPhotos = [];
  state.bookingId = generateBookingId();
  state.photoAdjustmentPct = 0;
  state.lastBookingSyncFailed = false;
  state.lastBookingSyncErrorDetail = '';
  // A new booking has its own price, which means it needs its own fresh
  // PaymentIntent — Payment Element (unlike the old Card Element) can't
  // just be reused as-is across two different amounts.
  state.stripeMounted = false;
  state.lockedGst = null;
  document.getElementById('custName').value = '';
  document.getElementById('custPhone').value = '';
  document.getElementById('custEmail').value = '';
  document.getElementById('agreeTerms').checked = false;
  document.getElementById('fileList').innerHTML = '';
  document.getElementById('aiPhotoStatus').hidden = true;
  ['steamExtraRooms', 'steamKitchens', 'steamWashrooms', 'steamLivingAreas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '0';
  });
  renderSteamRoomsTotal();
  // Clear the combined booking before the track resets, so the relocated
  // full-clean panel goes home rather than staying inside the steam panel.
  state.steamCombined = false;
  state.steamPropertyType = 'lease';
  renderComboPanel();
  ['custNameError', 'custPhoneError', 'custEmailError', 'scheduleError',
   'agreeTermsError', 'propertySizeError', 'steamRoomsError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
  // Back to the default track, which also re-renders the duration notice
  // and recalculates the (now empty) price.
  setServiceTrack('residential');
  goToStep(1);
}

document.getElementById('returnHomeBtn').addEventListener('click', resetWizardToStart);

/* Init sequence, isolated.
   These ran as a bare list, so one throw took out everything after it —
   e.g. a blocked Leaflet CDN made initLocationMap() fail, which meant
   goToStep(1) never ran and the whole wizard was dead rather than just
   the map. Each call is now independent; the pricing and navigation ones
   are essential and are attempted regardless of what came before. */
function safeInit(label, fn) {
  try { fn(); }
  catch (err) { console.warn(`[init] ${label} failed (continuing):`, err); }
}

safeInit('map', () => initLocationMap());
safeInit('service track', () => setServiceTrack('residential'));
safeInit('pricing', () => updatePrice());
state.bookingId = generateBookingId();
safeInit('first step', () => goToStep(1));
safeInit('scroll reveal', () => initScrollReveal());
safeInit('hero parallax', () => initHeroParallax());

/* Opens the lookup modal when arriving from the header "My booking" link
   (book.html#myBooking), so that button lands on the thing it names
   instead of dropping the person at step 1. */
(function () {
  if (window.location.hash !== '#myBooking') return;
  const btn = document.getElementById('myBookingBtn');
  if (btn) {
    btn.click();
    // Drop the hash so a refresh doesn't reopen it unexpectedly.
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname + window.location.search);
    }
  }
})();

/* =========================================================
   CONTACT BOX — phone or email, with the booking details carried over

   Two jobs:

   1. Open a contact box anywhere on the homepage, from any element marked
      `data-open-contact`. The value picks the view: "phone", "email", or
      nothing for the method chooser.

   2. Receive a long-term/recurring enquiry handed over from step 2 of the
      booking wizard. js/app.js stashes everything the customer already
      typed (personal info, sizing, requirements, preferred slot) in
      sessionStorage and sends them here with ?contact=longterm. The email
      body is then written for them — the only thing left to type is which
      days they need us.

   Degrades safely: with JS off, the header links are still a working
   tel: and mailto:. Nothing here is required for the page to function.
========================================================= */
(function () {
  'use strict';

  // Must match js/app.js's LONG_TERM_KEY.
  var ENQUIRY_KEY = 'sparkCleanLongTermEnquiry';

  var COMPANY = {
    email: 'sparkclean09@gmail.com',
    phoneDisplay: '0469 739 149',
    phoneDial: '+61469739149'
  };

  var modal = document.getElementById('contactModal');
  if (!modal) return;

  var methodView = document.getElementById('contactMethodView');
  var phoneView = document.getElementById('contactPhoneView');
  var emailView = document.getElementById('contactEmailView');
  var intro = document.getElementById('contactModalIntro');
  var prefillBox = document.getElementById('contactPrefillBox');
  var prefillSummary = document.getElementById('contactPrefillSummary');
  var manualFields = document.getElementById('contactManualFields');
  var daysInput = document.getElementById('contactDays');
  var daysError = document.getElementById('contactDaysError');

  // The enquiry handed over from the wizard, or null for a cold visitor
  // who just clicked "Contact us" in the header.
  var enquiry = readEnquiry();
  var lastFocused = null;

  function readEnquiry() {
    try {
      var raw = sessionStorage.getItem(ENQUIRY_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      // Guard against a stale shape from an older version of the wizard —
      // a half-read object here would render a broken email body.
      if (!parsed || parsed.version !== 1 || !parsed.customer) return null;
      return parsed;
    } catch (err) {
      console.warn('[contact] could not read stashed enquiry:', err);
      return null;
    }
  }

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  /* ---------------- VIEWS ---------------- */

  function showView(name) {
    methodView.hidden = name !== 'method';
    phoneView.hidden = name !== 'phone';
    emailView.hidden = name !== 'email';

    if (name === 'method') {
      intro.textContent = enquiry
        ? 'Long-term and recurring work is quoted on a special rate. Pick how you\'d like to reach us — your booking details come with you either way.'
        : 'How would you like to reach us? Both go to the same team.';
    } else if (name === 'phone') {
      intro.textContent = 'Give us a call and tell us what you need — there\'s nothing to prepare.';
    } else {
      intro.textContent = enquiry
        ? 'Everything you entered is already filled in below. Just add which days you need us.'
        : 'Tell us what you need and we\'ll come back with a long-term rate.';
    }

    if (name === 'email') renderEmailView();
  }

  function renderEmailView() {
    var hasEnquiry = !!enquiry;
    prefillBox.hidden = !hasEnquiry;
    manualFields.hidden = hasEnquiry;
    if (!hasEnquiry) return;

    var s = enquiry.service;
    var rows = [
      ['Name', enquiry.customer.name],
      ['Phone', enquiry.customer.phone],
      ['Email', enquiry.customer.email],
      ['Service', s.label + (s.steamPropertyType ? ' (' + s.steamPropertyType + ')' : '')],
      ['Location', [s.suburb, 'Melbourne VIC'].filter(Boolean).join(', ')]
    ];
    if (s.preferredDate) {
      rows.push(['Preferred slot', s.preferredDate + ' — ' + s.preferredTime]);
    }

    var html = rows.map(function (r) {
      return '<div><span>' + esc(r[0]) + '</span><span>' + esc(r[1] || '—') + '</span></div>';
    }).join('');

    if (enquiry.sizing && enquiry.sizing.length) {
      html += '<div class="contact-prefill__rule"></div>';
      html += enquiry.sizing.map(function (item) {
        return '<div><span>' + esc(item.label) + '</span><span class="mono">$'
             + Number(item.amount).toFixed(2) + '</span></div>';
      }).join('');
    }

    prefillSummary.innerHTML = html;
  }

  /* ---------------- OPEN / CLOSE ---------------- */

  function openContact(view) {
    lastFocused = document.activeElement;
    enquiry = readEnquiry(); // re-read: they may have just arrived from step 2
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    showView(view || 'method');

    // Focus the first thing that's actually actionable in this view, so
    // keyboard and screen-reader users land inside the dialog.
    var target = modal.querySelector(
      (view === 'email' ? '#contactDays' : view === 'phone' ? '.contact-dial' : '#contactPickPhone')
    );
    if (target) target.focus();
  }

  function closeContact() {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-open-contact]');
    if (opener) {
      // Only now do we swallow the tel:/mailto: fallback — if this script
      // had failed to load, the link would still have worked.
      e.preventDefault();
      openContact(opener.getAttribute('data-open-contact') || 'method');
      return;
    }
    if (e.target.closest('[data-contact-back]')) {
      showView('method');
      return;
    }
    // Click on the backdrop itself (not the panel) closes.
    if (e.target === modal) closeContact();
  });

  document.getElementById('contactModalClose').addEventListener('click', closeContact);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) closeContact();
  });

  document.getElementById('contactPickPhone').addEventListener('click', function () { showView('phone'); });
  document.getElementById('contactPickEmail').addEventListener('click', function () { showView('email'); });

  /* ---------------- EMAIL COMPOSITION ---------------- */

  function buildEmailBody(days) {
    var lines = [];
    var push = function (s) { lines.push(s == null ? '' : s); };

    push('LONG-TERM / RECURRING CLEANING ENQUIRY');
    push('======================================');
    push('');

    if (enquiry) {
      var s = enquiry.service;
      push('PERSONAL INFO');
      push('Name:  ' + enquiry.customer.name);
      push('Phone: ' + enquiry.customer.phone);
      push('Email: ' + enquiry.customer.email);
      push('');
      push('SERVICE & LOCATION');
      push('Service:  ' + s.label + (s.steamPropertyType ? ' (' + s.steamPropertyType + ')' : ''));
      push('Location: ' + [s.suburb, 'Melbourne VIC'].filter(Boolean).join(', '));
      if (s.preferredDate) push('Preferred slot: ' + s.preferredDate + ' — ' + s.preferredTime);
      push('');
      push('SIZING & REQUIREMENTS');
      if (enquiry.sizing && enquiry.sizing.length) {
        enquiry.sizing.forEach(function (item) {
          push('  - ' + item.label + ': $' + Number(item.amount).toFixed(2));
        });
      } else {
        push('  (not specified)');
      }
      push('');
      push('One-off price for the above, for reference:');
      push('  $' + enquiry.estimate.subtotal.toFixed(2) + ' excl. GST'
         + '  /  $' + enquiry.estimate.total.toFixed(2) + ' incl. GST');
      push('  (Quoted by the online calculator — I\'m after a long-term rate instead.)');
    } else {
      push('PERSONAL INFO');
      push('Name:  ' + (document.getElementById('contactName').value.trim() || '(not given)'));
      push('Phone: ' + (document.getElementById('contactPhoneNum').value.trim() || '(not given)'));
      push('');
      push('WHAT I NEED CLEANED');
      push(document.getElementById('contactNeeds').value.trim() || '(not given)');
    }

    push('');
    push('DAYS I NEED THE SERVICE');
    push(days);
    push('');
    push('Please send through your long-term rate for this schedule. Thanks!');

    return lines.join('\r\n');
  }

  document.getElementById('contactSendEmail').addEventListener('click', function () {
    var days = (daysInput.value || '').trim();
    if (!days) {
      daysError.textContent = 'Let us know roughly which days or how often you need us.';
      daysInput.focus();
      return;
    }
    daysError.textContent = '';

    var who = enquiry ? enquiry.customer.name : (document.getElementById('contactName').value.trim());
    var subject = 'Long-term cleaning enquiry' + (who ? ' — ' + who : '');

    var href = 'mailto:' + COMPANY.email
      + '?subject=' + encodeURIComponent(subject)
      + '&body=' + encodeURIComponent(buildEmailBody(days));

    // Some mail clients truncate very long mailto: URLs. The body here is
    // a few hundred characters at most, well inside what every major
    // client handles, so this stays a plain mailto: rather than needing a
    // server round-trip.
    window.location.href = href;
  });

  /* ---------------- AUTO-OPEN ----------------
     Arriving from step 2 (?contact=longterm) opens the box straight away,
     on the method chooser, which is what the wizard promises. The param is
     then stripped so a refresh or a shared link doesn't reopen it. */
  var params = new URLSearchParams(window.location.search);
  if (params.get('contact')) {
    var requested = params.get('contact');
    var view = (requested === 'phone' || requested === 'email') ? requested : 'method';

    if (window.history && window.history.replaceState) {
      params.delete('contact');
      var qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
    }
    // Let the page paint (and the intro curtain clear) before it opens.
    setTimeout(function () { openContact(view); }, 350);
  }
})();

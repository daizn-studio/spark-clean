/* =========================================================
   PAYMENT — STRIPE PAYMENT ELEMENT INTEGRATION

   Security note for your IT developer:
   This deliberately does NOT hand-roll a credit card form
   (own regex-formatted card number / expiry / CVC inputs).
   A custom form like that means raw PANs pass through your
   own JS and, if ever posted anywhere by mistake, your
   servers — which is a PCI-DSS violation and the same shape
   as a card-skimmer. Stripe's Payment Element mounts real
   card fields inside a secure Stripe-hosted iframe: card data
   never touches this codebase or your server at all.

   Why Payment Element instead of the older Card Element:
   the classic 'card' Element creates an internal hidden
   autofill-detection input that recent Chrome versions
   (127+) actively conflict with, which is what was breaking
   typing entirely on some machines. Payment Element is
   Stripe's current, actively maintained component and doesn't
   have that issue. It's also a fuller checkout by default —
   whatever payment methods you enable in your Stripe Dashboard
   (cards, Google Pay, Afterpay, etc.) show up here
   automatically, no extra code needed.

   Architecture note: Payment Element needs a PaymentIntent's
   client_secret BEFORE it can mount — unlike the old Card
   Element, you can't mount it blank and create the intent
   later at click-time. So the intent is now created (and the
   price effectively locked) the moment the customer reaches
   the Payment step, not when they click "Confirm booking".
   Going back and changing earlier answers after that point
   won't change what gets charged — if you want to guard
   against that, restart the booking instead of going back.

   To go live you need:
   1. A Stripe account + publishable key (pk_live_... / pk_test_...)
   2. supabase/functions/create-payment-intent deployed (already
      built — see SETUP-APIS.md)
   3. Swap STRIPE_PUBLISHABLE_KEY (in js/config.js) from test to live
========================================================= */

const STRIPE_PUBLISHABLE_KEY = CONFIG.STRIPE_PUBLISHABLE_KEY;
const CREATE_PAYMENT_INTENT_URL = CONFIG.FUNCTIONS_URL ? `${CONFIG.FUNCTIONS_URL}/create-payment-intent` : '';

let stripe = null;
let elements = null;
let paymentElement = null;
let stripeMountRetries = 0;
const MAX_STRIPE_MOUNT_RETRIES = 5;

/**
 * Creates a PaymentIntent for the given amount and mounts Stripe's
 * Payment Element into it. Call this once, when the customer reaches
 * the Payment step — see js/app.js's goToStep(7) handling.
 */
async function initStripeElements(amountAud, bookingId) {
  const mountEl = document.getElementById('stripe-card-element');

  if (typeof Stripe === 'undefined') {
    console.warn('[payment] Stripe.js failed to load (offline demo mode).');
    mountEl.innerHTML = '<span class="stripe-placeholder">The secure payment form could not load. Check your connection and refresh the page.</span>';
    return;
  }
  if (!STRIPE_PUBLISHABLE_KEY) {
    console.warn('[payment] STRIPE_PUBLISHABLE_KEY not set in js/config.js — running in demo mode. Payment form will not mount.');
    // Say so plainly instead of leaving "Loading secure payment form…" up
    // forever: the booking is still taken, nothing is charged online.
    mountEl.innerHTML = '<span class="stripe-placeholder">Online card payment is not switched on yet. Confirm your booking and no card is charged now. We will contact you to arrange payment.</span>';
    const nameField = document.getElementById('cardholderName');
    if (nameField && nameField.closest('.field')) nameField.closest('.field').hidden = true;
    return;
  }

  mountEl.innerHTML = '<span class="stripe-placeholder">Loading secure payment form…</span>';

  try {
    const intentResponse = await fetch(CREATE_PAYMENT_INTENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
        'apikey': CONFIG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ amount: Math.round(amountAud * 100), bookingId })
    });
    const data = await intentResponse.json();
    if (!intentResponse.ok || !data.clientSecret) {
      throw new Error(data.error || `create-payment-intent returned ${intentResponse.status}`);
    }

    stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
    elements = stripe.elements({
      clientSecret: data.clientSecret,
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#C1683B',
          colorText: '#16221F',
          fontFamily: '"Inter", system-ui, sans-serif',
          fontSizeBase: '15px',
          borderRadius: '10px'
        }
      }
    });

    // billingDetails name: 'never' — the site already has its own
    // "Name on card" field above this one; this avoids asking for the
    // same thing twice inside Stripe's own form.
    paymentElement = elements.create('payment', {
      fields: { billingDetails: { name: 'never', address: 'never' } }
    });

    // Same defensive layout check as before — mounting into a
    // container with no real width yet produces a broken, non-
    // interactive form. Payment Element needs this just as much as
    // the old Card Element did.
    if (mountEl.offsetWidth === 0) {
      stripeMountRetries++;
      if (stripeMountRetries > MAX_STRIPE_MOUNT_RETRIES) {
        console.error('[payment] Card container never got a layout width after multiple retries — check for a CSS issue hiding #stripe-card-element.');
        mountEl.innerHTML = '<span class="stripe-placeholder">Payment form failed to load — please refresh the page.</span>';
        return;
      }
      console.warn(`[payment] Card container has no layout width yet — retry ${stripeMountRetries}/${MAX_STRIPE_MOUNT_RETRIES}.`);
      setTimeout(() => initStripeElements(amountAud, bookingId), 400);
      return;
    }

    mountEl.innerHTML = '';
    paymentElement.mount('#stripe-card-element');

    paymentElement.on('change', (event) => {
      const errorEl = document.getElementById('stripe-card-errors');
      errorEl.textContent = event.error ? event.error.message : '';
    });
  } catch (err) {
    console.error('[payment] Failed to initialise the payment form:', err);
    mountEl.innerHTML = '<span class="stripe-placeholder">Payment form failed to load — please refresh the page.</span>';
  }
}

/** True when card payments are actually wired up (publishable key set). */
function isOnlinePaymentEnabled() {
  return !!STRIPE_PUBLISHABLE_KEY;
}

/**
 * Confirms the already-created PaymentIntent. In demo mode (no
 * publishable key configured), simulates a successful confirmation so
 * the booking flow can still be tested end to end.
 */
async function confirmStripePayment(cardholderName) {
  if (isOnlinePaymentEnabled() && (!stripe || !elements)) {
    // Key is set but the form never mounted (Stripe blocked, intent failed).
    // Never pretend that succeeded — the customer would think they had paid.
    return { success: false, error: 'The secure payment form did not load. Please refresh the page and try again.' };
  }
  if (!stripe || !elements) {
    console.warn('[payment] Demo mode: simulating a successful payment confirmation. Wire up STRIPE_PUBLISHABLE_KEY to go live.');
    await new Promise(r => setTimeout(r, 600));
    return { success: true, demo: true };
  }

  try {
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        payment_method_data: { billing_details: { name: cardholderName } },
        return_url: window.location.href
      },
      redirect: 'if_required' // stays on this page for card payments; only redirects for methods that require it (e.g. some bank redirects)
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }
    return { success: true, paymentIntent: result.paymentIntent };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

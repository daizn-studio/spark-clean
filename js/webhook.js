/* =========================================================
   LEAD / SMS WEBHOOK
   Fires a JSON payload to a configurable automation URL
   (Zapier, Make, Twilio Studio flow, your own backend, etc.)
   after a successful booking submission.

   IMPORTANT: this file does NOT send SMS itself — browsers
   can't send SMS directly. It hands off a payload to whatever
   automation you configure at WEBHOOK_URL, which is
   responsible for actually dispatching the text message
   (e.g. a Twilio/Zapier flow reading these fields).
========================================================= */

const WEBHOOK_URL = CONFIG.ZAPIER_WEBHOOK_URL;

const SMS_TEMPLATES = {
  residential: (name, price) =>
    `[Spark Clean] Hi ${name}, thank you for booking your End of Lease Clean! Your initial AI-verified estimate is ${price} + GST (subject to layout verification). Management will send a final verification text within 24 hours.`,
  commercial: (name, price) =>
    `[Spark Clean] Hi ${name}, thank you for submitting your office layout. Your preliminary automated estimate is ${price} + GST. An onboarding manager will call you shortly to finalize your schedule.`,
  steam: (name, price) =>
    `[Spark Clean] Hi ${name}, thank you for booking your Carpet Steam Clean! Your estimate is ${price} + GST. Management will confirm your slot within 24 hours. Please allow 2-4 hours drying time after we finish.`
};

/**
 * Build the SMS body for a given booking (used by the receiving automation,
 * or for local preview/testing).
 */
function buildSmsMessage(bookingData) {
  const priceStr = `$${bookingData.calculatedPrice.toFixed(2)}`;
  const template = SMS_TEMPLATES[bookingData.serviceTrack];
  return template ? template(bookingData.customer.name, priceStr) : '';
}

/**
 * POST the completed booking to the configured webhook.
 * @param {object} bookingData
 * @returns {Promise<{ok:boolean, status?:number, error?:string}>}
 */
async function triggerLeadWebhook(bookingData) {
  const payload = {
    event: 'booking.created',
    timestamp: new Date().toISOString(),
    serviceTrack: bookingData.serviceTrack,           // 'residential' | 'commercial' | 'steam'
    calculatedPrice: bookingData.calculatedPrice,      // number, AUD excl. GST
    priceRange: bookingData.priceRange,                // { low, high }
    roomMetrics: bookingData.roomMetrics,              // breakdown object from pricing.js
    customer: bookingData.customer,                    // { name, phone, email }
    location: bookingData.location,                    // { city, suburb, cbdHighrise }
    smsPreview: buildSmsMessage(bookingData)
  };

  if (!WEBHOOK_URL) {
    console.warn('[webhook] CONFIG.ZAPIER_WEBHOOK_URL is not set in js/config.js — payload logged locally only:', payload);
    return { ok: false, error: 'ZAPIER_WEBHOOK_URL not configured' };
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: response.ok, status: response.status };
  } catch (err) {
    console.error('[webhook] Failed to send lead webhook:', err);
    return { ok: false, error: String(err) };
  }
}

/**
 * Notifies you when someone hits the heavy-duty decline (mould/biological
 * waste/odour) — previously this information was entirely lost: the
 * "Connect me with a restoration partner" button just showed an alert()
 * and never actually told you anything happened, and their optional
 * comment about the situation was never captured anywhere. This is what
 * that referral fee mentioned in the UI copy actually depends on you
 * knowing about.
 */
async function triggerReferralWebhook(details) {
  const payload = {
    event: 'referral.created',
    timestamp: new Date().toISOString(),
    serviceTrack: details.serviceTrack,             // 'residential' | 'commercial' | 'steam'
    location: details.location,                     // { suburb, cbdHighrise }
    comment: details.comment || null                // whatever the customer told us about the situation
  };

  if (!WEBHOOK_URL) {
    console.warn('[webhook] CONFIG.ZAPIER_WEBHOOK_URL is not set in js/config.js — referral payload logged locally only:', payload);
    return { ok: false, error: 'ZAPIER_WEBHOOK_URL not configured' };
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: response.ok, status: response.status };
  } catch (err) {
    console.error('[webhook] Failed to send referral webhook:', err);
    return { ok: false, error: String(err) };
  }
}

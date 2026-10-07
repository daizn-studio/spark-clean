/* =========================================================
   ADMIN / ON-SITE MANAGER PORTAL
   - Subcontractor payout split (internal business math)
========================================================= */

/**
 * Splits a quote total between business margin and subcontractor payout.
 * Business margin target: 40%. Subcontractor payout: 60%.
 * This is the baseline the ~$200k first-year profit target is modelled
 * against, using the same base packages / sqm tiers / add-ons as pricing.js —
 * it doesn't introduce separate numbers, it just splits the one total.
 */
function calculateSubcontractorSplit(totalPrice) {
  const businessMargin = +(totalPrice * 0.40).toFixed(2);
  const subcontractorPayout = +(totalPrice * 0.60).toFixed(2);
  return { businessMargin, subcontractorPayout };
}

function formatAud(n) {
  return `$${n.toFixed(2)}`;
}

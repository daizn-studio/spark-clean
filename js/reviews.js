/* =========================================================
   REVIEWS
   Fetches real, submitted customer reviews from the list-reviews
   Supabase function and renders them. If none exist yet — or the
   backend isn't configured (CONFIG.FUNCTIONS_URL empty) — this script
   does nothing and the page's own static empty-state markup (already
   in index.html/reviews.html) is left exactly as it was. Nothing here
   ever invents a review.
========================================================= */
(function () {
  'use strict';

  function starString(rating) {
    let out = '';
    for (let i = 1; i <= 5; i++) out += `<span class="${i <= rating ? '' : 'is-off'}">★</span>`;
    return out;
  }

  function timeAgo(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return '1 day ago';
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
    const years = Math.floor(months / 12);
    return `${years} year${years > 1 ? 's' : ''} ago`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function renderCard(r) {
    const name = r.reviewer_name && String(r.reviewer_name).trim()
      ? escapeHtml(r.reviewer_name.trim())
      : 'Verified customer';
    return `
      <article class="review-card">
        <div class="stars" aria-label="${r.rating} out of 5 stars">${starString(r.rating)}</div>
        <p>${escapeHtml(r.comment)}</p>
        <div class="review-meta">
          <span class="review-name">${name}</span>
          <span class="review-date">${timeAgo(r.submitted_at)}</span>
        </div>
      </article>
    `;
  }

  async function fetchReviews(limit) {
    if (!window.CONFIG || !CONFIG.FUNCTIONS_URL) return [];
    try {
      const res = await fetch(`${CONFIG.FUNCTIONS_URL}/list-reviews?limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
          'apikey': CONFIG.SUPABASE_ANON_KEY
        }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.reviews) ? data.reviews : [];
    } catch (err) {
      console.error('[reviews] fetch failed:', err);
      return [];
    }
  }

  // ---- Homepage teaser: top 3 recent reviews + "More reviews" link ----
  async function initHomepageTeaser() {
    const mount = document.getElementById('reviewsMount');
    if (!mount) return;
    const reviews = await fetchReviews(3);
    if (!reviews.length) return; // leave the existing empty state exactly as it was

    const emptyState = document.getElementById('reviewsEmpty');
    if (emptyState) emptyState.hidden = true;

    mount.innerHTML = `<div class="review-grid">${reviews.map(renderCard).join('')}</div>`;
    mount.hidden = false;

    const more = document.getElementById('reviewsMoreWrap');
    if (more) more.hidden = false;
  }

  // ---- Full reviews page (reviews.html) ----
  async function initReviewsPage() {
    const mount = document.getElementById('allReviewsMount');
    if (!mount) return;
    const reviews = await fetchReviews(50);
    const emptyState = document.getElementById('reviewsEmpty');
    if (!reviews.length) {
      if (emptyState) emptyState.hidden = false;
      return;
    }
    if (emptyState) emptyState.hidden = true;
    mount.innerHTML = `<div class="reviews-list-page">${reviews.map(renderCard).join('')}</div>`;
    mount.hidden = false;
  }

  initHomepageTeaser();
  initReviewsPage();
})();

/* =========================================================
   ADMIN DASHBOARD
   Uses the real Supabase `orders`/`feedback` tables when js/config.js has
   SUPABASE_URL/ANON_KEY set. Falls back to the same localStorage keys
   js/app.js writes to (sparkCleanBookings, sparkCleanFeedback) when not
   configured, so this page works either way without code changes.
========================================================= */

requireAdminLogin();

const BOOKINGS_KEY = 'sparkCleanBookings';
const FEEDBACK_KEY = 'sparkCleanFeedback';
const LAST_SEEN_KEY = 'sparkCleanAdminLastSeenCount';

let selectedBookingId = null;

async function loadBookings() {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client.from('orders').select('*').order('created_at', { ascending: false });
    if (error) { console.error('[dashboard] Failed to load orders from Supabase:', error); return []; }
    return data.map(row => ({
      id: row.id,
      status: row.status,
      serviceTrack: row.service_track,
      calculatedPrice: Number(row.calculated_price) || 0,
      extraCharge: Number(row.extra_charge) || 0,
      extraChargeReason: row.extra_charge_reason || '',
      aiAdjustmentPct: Number(row.ai_adjustment_pct) || 0,
      roomMetrics: row.room_metrics || [],
      roomMetricsRaw: row.room_metrics_raw,
      // Needed by the month forecast. Without it every booking fell back to
      // "now" and was counted as this month's, inflating the projection.
      createdAt: row.created_at,
      customer: { name: row.customer_name, phone: row.customer_phone, email: row.customer_email },
      location: { suburb: row.suburb, cbdHighrise: row.cbd_highrise },
      schedule: {
        preferredDate: row.preferred_date, preferredTime: row.preferred_time,
        confirmedDate: row.confirmed_date, confirmedTime: row.confirmed_time
      }
    }));
  }
  return JSON.parse(localStorage.getItem(BOOKINGS_KEY) || '[]');
}

async function saveBookingUpdate(booking) {
  const client = getSupabaseClient();
  if (client) {
    const { error } = await client.from('orders').update({
      status: booking.status,
      confirmed_date: booking.schedule.confirmedDate || null,
      confirmed_time: booking.schedule.confirmedTime || null,
      extra_charge: booking.extraCharge || 0,
      extra_charge_reason: booking.extraChargeReason || ''
    }).eq('id', booking.id);
    if (error) console.error('[dashboard] Failed to update order in Supabase:', error);
    return;
  }
  const bookings = JSON.parse(localStorage.getItem(BOOKINGS_KEY) || '[]');
  const idx = bookings.findIndex(b => b.id === booking.id);
  if (idx !== -1) { bookings[idx] = booking; localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings)); }
}

async function loadFeedback() {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client.from('feedback').select('*').order('submitted_at', { ascending: false });
    if (error) { console.error('[dashboard] Failed to load feedback from Supabase:', error); return []; }
    return data.map(row => ({ bookingId: row.booking_id, rating: row.rating, comment: row.comment, submittedAt: row.submitted_at }));
  }
  return JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]');
}

// ---------------- HEADER / SESSION ----------------
(function initHeader() {
  const session = JSON.parse(localStorage.getItem('sparkCleanAdminSession') || '{}');
  document.getElementById('adminEmailPill').textContent = session.email || 'Admin';
  document.getElementById('logoutBtn').addEventListener('click', adminLogout);
  document.getElementById('demoModeBanner').hidden = !ADMIN_AUTH_DEMO_MODE;
})();

// ---------------- TABS ----------------
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('is-active'));
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('is-active'));
    tab.classList.add('is-active');
    document.getElementById(tab.dataset.panel).classList.add('is-active');

    if (tab.dataset.panel === 'balancePanel') renderBalanceSheet();
    if (tab.dataset.panel === 'aiPanel') renderAiPrediction();
  });
});

// ---------------- BALANCE SHEET ----------------
async function renderBalanceSheet() {
  const bookings = (await loadBookings()).filter(b => b.status !== 'cancelled');

  const totalRevenue = bookings.reduce((sum, b) => sum + b.calculatedPrice + (b.extraCharge || 0), 0);
  const split = calculateSubcontractorSplit(totalRevenue);
  const avgJobValue = bookings.length ? totalRevenue / bookings.length : 0;
  const extraChargesTotal = bookings.reduce((sum, b) => sum + (b.extraCharge || 0), 0);

  document.getElementById('balanceGrid').innerHTML = [
    ['Total revenue (excl. GST)', formatAud(totalRevenue)],
    ['Business margin (40%)', formatAud(split.businessMargin)],
    ['Subcontractor payout (60%)', formatAud(split.subcontractorPayout)],
    ['Bookings counted', String(bookings.length)],
    ['Average job value', formatAud(avgJobValue)],
    ['Extra charges collected', formatAud(extraChargesTotal)]
  ].map(([label, value]) => balanceCard(label, value)).join('');

  const sumPrice = arr => arr.reduce((s, b) => s + b.calculatedPrice + (b.extraCharge || 0), 0);

  // Driven off the track list in js/pricing.js rather than a hardcoded
  // residential/commercial pair, so revenue on a newly added service line
  // (carpet steam) is counted here the moment it exists instead of
  // silently vanishing from the per-service breakdown.
  document.getElementById('balanceByServiceGrid').innerHTML =
    Object.keys(SERVICE_TRACK_LABELS).flatMap(track => {
      const rows = bookings.filter(b => b.serviceTrack === track);
      const name = serviceTrackLabel(track, 'short');
      return [
        [`${name} — bookings`, String(rows.length)],
        [`${name} — revenue`, formatAud(sumPrice(rows))]
      ];
    }).map(([label, value]) => balanceCard(label, value)).join('');
}

function balanceCard(label, value, accent) {
  return `<div class="balance-card${accent ? ' balance-card--accent' : ''}"><p class="balance-card__label">${escapeHtml(label)}</p><p class="balance-card__value">${escapeHtml(value)}</p></div>`;
}

// ---------------- AI PREDICTION ----------------
async function renderAiPrediction() {
  const bookings = (await loadBookings()).filter(b => b.status !== 'cancelled');

  // Simple linear-projection forecast: (revenue so far this month / days elapsed) × days in month.
  // This is a stand-in for real forecasting — swap for a proper time-series model once you have
  // a few months of real data; a straight-line projection is unreliable on small sample sizes.
  const now = new Date();
  const daysElapsed = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const thisMonthBookings = bookings.filter(b => {
    if (!b.createdAt) return false;
    const created = new Date(b.createdAt);
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  });
  const monthRevenueSoFar = thisMonthBookings.reduce((sum, b) => sum + b.calculatedPrice + (b.extraCharge || 0), 0);
  const projectedMonthRevenue = daysElapsed > 0 ? (monthRevenueSoFar / daysElapsed) * daysInMonth : 0;

  document.getElementById('forecastGrid').innerHTML = [
    ['Bookings this month', String(thisMonthBookings.length)],
    ['Revenue so far this month', formatAud(monthRevenueSoFar)],
    ['Projected month-end revenue', formatAud(projectedMonthRevenue)]
  ].map(([label, value], i) => balanceCard(label, value, i === 2)).join('');

  document.getElementById('forecastNote').textContent =
    thisMonthBookings.length < 5
      ? 'Projection is based on very few bookings so far this month — treat it as a rough guide, not a forecast you can plan cash flow around.'
      : `Straight-line projection based on ${thisMonthBookings.length} bookings and ${daysElapsed} of ${daysInMonth} days elapsed this month.`;

  const adjusted = bookings.filter(b => b.aiAdjustmentPct);
  document.getElementById('aiAdjustmentsEmptyState').hidden = adjusted.length > 0;
  document.getElementById('aiAdjustmentsBody').innerHTML = adjusted.map(b => {
    // The stored price already has the AI line folded in, so multiplying it
    // by the percentage overstated the effect. Read the actual line from the
    // receipt; fall back to backing it out of the adjusted price.
    const aiLine = (b.roomMetrics || []).find(item => /^AI photo review/.test(item.label || ''));
    const effect = aiLine ? Number(aiLine.amount) || 0
      : b.calculatedPrice - b.calculatedPrice / (1 + b.aiAdjustmentPct);
    return `<tr>
      <td>${escapeHtml(b.customer.name || 'Unnamed')}</td>
      <td>${serviceTrackLabel(b.serviceTrack, 'short')}</td>
      <td>${escapeHtml(b.location?.suburb || '—')}${b.location?.cbdHighrise ? ' <span class="microcopy">CBD</span>' : ''}</td>
      <td class="mono">${b.aiAdjustmentPct > 0 ? '+' : ''}${Math.round(b.aiAdjustmentPct * 100)}%</td>
      <td class="mono">${effect >= 0 ? '+' : ''}${formatAud(effect)}</td>
    </tr>`;
  }).join('');
}

// ---------------- NEW ORDER NOTIFICATION ----------------
async function checkForNewOrders() {
  const bookings = await loadBookings();
  const lastSeen = parseInt(localStorage.getItem(LAST_SEEN_KEY) || '0', 10);
  const newCount = bookings.length - lastSeen;

  if (newCount > 0) {
    const banner = document.getElementById('newOrderBanner');
    document.getElementById('newOrderText').textContent =
      `🔔 ${newCount} new booking${newCount > 1 ? 's' : ''} since you last checked.`;
    banner.hidden = false;

    // Browser push-style notification, if the admin has granted permission.
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Spark Clean — New booking', { body: `${newCount} new booking${newCount > 1 ? 's' : ''} received.` });
    }
  }
}
document.getElementById('dismissNewOrderBtn').addEventListener('click', async () => {
  localStorage.setItem(LAST_SEEN_KEY, String((await loadBookings()).length));
  document.getElementById('newOrderBanner').hidden = true;
});

// Ask for notification permission once, quietly, on first dashboard load.
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// ---------------- TODAY'S REMINDER ----------------
async function checkTodayReminders() {
  const today = new Date().toISOString().slice(0, 10);
  const bookings = await loadBookings();
  const todayJobs = bookings.filter(b =>
    b.status === 'confirmed' &&
    (b.schedule.confirmedDate === today || (!b.schedule.confirmedDate && b.schedule.preferredDate === today))
  );
  if (todayJobs.length > 0) {
    const names = todayJobs.map(j => j.customer.name || 'Unnamed customer').join(', ');
    document.getElementById('todayReminderText').textContent =
      `📅 Reminder — you're scheduled to clean for: ${names} today.`;
    document.getElementById('todayReminderBanner').hidden = false;
  }
}

// ---------------- RENDER ORDERS TABLE ----------------
async function renderOrdersTable() {
  const bookings = (await loadBookings()).slice().reverse(); // newest first
  const tbody = document.getElementById('ordersTableBody');
  document.getElementById('ordersEmptyState').hidden = bookings.length > 0;

  tbody.innerHTML = bookings.map(b => `
    <tr data-id="${b.id}">
      <td>${escapeHtml(b.customer.name || 'Unnamed')}<br><span class="microcopy">${escapeHtml(b.customer.phone || '')}</span></td>
      <td>${serviceTrackLabel(b.serviceTrack, 'short')}</td>
      <td>${escapeHtml(b.location?.suburb || '—')}${b.location?.cbdHighrise ? ' <span class="microcopy">CBD</span>' : ''}</td>
      <td>${b.schedule.confirmedDate || b.schedule.preferredDate || '—'} <span class="microcopy">${b.schedule.confirmedTime || b.schedule.preferredTime || ''}</span></td>
      <td class="mono">$${(b.calculatedPrice + (b.extraCharge || 0)).toFixed(2)}</td>
      <td><span class="status-badge status-badge--${b.status}">${b.status}</span></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', () => openDetailDrawer(row.dataset.id));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------- ORDER DETAIL DRAWER ----------------
const detailDrawer = document.getElementById('detailDrawer');
let cachedBookings = [];

async function openDetailDrawer(id) {
  selectedBookingId = id;
  cachedBookings = await loadBookings();
  const booking = cachedBookings.find(b => b.id === id);
  if (!booking) return;

  document.getElementById('detailSummary').innerHTML = `
    <p><strong>${escapeHtml(booking.customer.name)}</strong></p>
    <p>${escapeHtml(booking.customer.phone)} · ${escapeHtml(booking.customer.email)}</p>
    <p>${serviceTrackLabel(booking.serviceTrack)} — ${escapeHtml(booking.location.suburb || 'Melbourne')}</p>
    <p>Original quote: <span class="mono">$${booking.calculatedPrice.toFixed(2)}</span></p>
    <p>Customer's preferred slot: ${booking.schedule.preferredDate || '—'} (${booking.schedule.preferredTime || '—'})</p>
  `;

  document.getElementById('confirmDate').value = booking.schedule.confirmedDate || booking.schedule.preferredDate || '';
  document.getElementById('confirmTime').value = booking.schedule.confirmedTime || '';
  document.getElementById('extraChargeInput').value = booking.extraCharge || 0;
  document.getElementById('extraChargeReason').value = booking.extraChargeReason || '';
  updateDetailTotalNote(booking);

  detailDrawer.hidden = false;
}
document.getElementById('detailCloseBtn').addEventListener('click', () => { detailDrawer.hidden = true; });

function updateDetailTotalNote(booking) {
  const extra = parseFloat(document.getElementById('extraChargeInput').value) || 0;
  const total = booking.calculatedPrice + extra;
  document.getElementById('detailTotalNote').textContent = `New total with extra charge: $${total.toFixed(2)} (excl. GST)`;
}
document.getElementById('extraChargeInput').addEventListener('input', () => {
  const booking = cachedBookings.find(b => b.id === selectedBookingId);
  if (booking) updateDetailTotalNote(booking);
});

async function updateSelectedBooking(mutator) {
  const booking = cachedBookings.find(b => b.id === selectedBookingId);
  if (!booking) return;
  mutator(booking);
  await saveBookingUpdate(booking);
  await renderOrdersTable();
}

document.getElementById('saveDetailBtn').addEventListener('click', async () => {
  await updateSelectedBooking(b => {
    b.schedule.confirmedDate = document.getElementById('confirmDate').value;
    b.schedule.confirmedTime = document.getElementById('confirmTime').value;
    b.extraCharge = parseFloat(document.getElementById('extraChargeInput').value) || 0;
    b.extraChargeReason = document.getElementById('extraChargeReason').value.trim();
  });
  detailDrawer.hidden = true;
  checkTodayReminders();
});

document.getElementById('acceptOrderBtn').addEventListener('click', async () => {
  await updateSelectedBooking(b => {
    b.status = 'confirmed';
    b.schedule.confirmedDate = document.getElementById('confirmDate').value || b.schedule.preferredDate;
    b.schedule.confirmedTime = document.getElementById('confirmTime').value || b.schedule.preferredTime;
    b.extraCharge = parseFloat(document.getElementById('extraChargeInput').value) || 0;
    b.extraChargeReason = document.getElementById('extraChargeReason').value.trim();
  });
  detailDrawer.hidden = true;
  checkTodayReminders();
});

document.getElementById('cancelOrderBtn').addEventListener('click', async () => {
  if (!confirm('Cancel this booking? The customer will need to be notified separately.')) return;
  await updateSelectedBooking(b => { b.status = 'cancelled'; });
  detailDrawer.hidden = true;
});

// ---------------- FEEDBACK PANEL ----------------
async function renderFeedback() {
  const feedback = (await loadFeedback()).slice().reverse();
  const list = document.getElementById('feedbackList');
  document.getElementById('feedbackEmptyState').hidden = feedback.length > 0;

  list.innerHTML = feedback.map(f => `
    <div class="feedback-card">
      <div class="feedback-card__stars">${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}</div>
      <p>${escapeHtml(f.comment || '(no written comment)')}</p>
      <p class="feedback-card__meta">Booking ${escapeHtml(f.bookingId || '—')} · ${new Date(f.submittedAt).toLocaleDateString('en-AU')}</p>
    </div>
  `).join('');
}

// ---------------- INIT ----------------
renderOrdersTable();
renderFeedback();
checkForNewOrders();
checkTodayReminders();

/* =========================================================
   BOOKINGS TOOLBAR — search, status filter, CSV export
   Filtering happens in the DOM on rows already loaded, so it stays
   instant and costs no extra database reads. Export writes whatever
   is currently visible, so a filtered view exports exactly what you
   can see rather than silently dumping everything.
========================================================= */
(function () {
  const searchEl = document.getElementById('orderSearch');
  const statusEl = document.getElementById('orderStatusFilter');
  const exportEl = document.getElementById('exportCsvBtn');
  const countEl  = document.getElementById('ordersCount');
  if (!searchEl || !statusEl) return;

  function visibleRows() {
    return Array.from(document.querySelectorAll('#ordersTableBody tr'))
      .filter(tr => !tr.classList.contains('is-hidden'));
  }

  function applyFilters() {
    const q = searchEl.value.trim().toLowerCase();
    const status = statusEl.value;
    const rows = Array.from(document.querySelectorAll('#ordersTableBody tr'));

    rows.forEach(tr => {
      const text = tr.textContent.toLowerCase();
      const rowStatus = (tr.querySelector('.status-badge')?.textContent || '').trim().toLowerCase();
      const matchesText = !q || text.includes(q) || (tr.dataset.id || '').toLowerCase().includes(q);
      const matchesStatus = !status || rowStatus === status;
      tr.classList.toggle('is-hidden', !(matchesText && matchesStatus));
    });

    const shown = visibleRows().length;
    countEl.textContent = rows.length === 0
      ? ''
      : `Showing ${shown} of ${rows.length} booking${rows.length === 1 ? '' : 's'}`;
  }

  searchEl.addEventListener('input', applyFilters);
  statusEl.addEventListener('change', applyFilters);

  // Re-apply whenever the table is re-rendered, so a filter isn't
  // silently dropped when bookings refresh in the background.
  const tbody = document.getElementById('ordersTableBody');
  if (tbody && 'MutationObserver' in window) {
    new MutationObserver(applyFilters).observe(tbody, { childList: true });
  }

  if (exportEl) {
    exportEl.addEventListener('click', () => {
      const rows = visibleRows();
      if (rows.length === 0) {
        alert('Nothing to export — no bookings match the current filter.');
        return;
      }
      const headers = Array.from(document.querySelectorAll('#ordersPanel .orders-table thead th'))
        .map(th => th.textContent.trim());
      // Quote every field and double any internal quotes, so a comma in a
      // customer's name or suburb can't shift the columns out of line.
      // Collapse the line break between name and phone (from the <br> in
      // the cell) into a single space. A raw newline inside a quoted CSV
      // field is technically valid but renders as a wrapped, ragged cell
      // in Excel and Sheets.
      const clean = v => String(v).replace(/\s+/g, ' ').trim();
      // <br> contributes no whitespace to textContent, so name and phone
      // would run together as "Alice Nguyen0412345678". Swap line breaks
      // for spaces on a clone before reading the text.
      const cellText = td => {
        const clone = td.cloneNode(true);
        clone.querySelectorAll('br').forEach(br => br.replaceWith(' '));
        return clone.textContent;
      };
      const esc = v => '"' + clean(v).replace(/"/g, '""') + '"';
      const lines = [
        ['Reference', ...headers].map(esc).join(','),
        ...rows.map(tr => [
          tr.dataset.id || '',
          ...Array.from(tr.querySelectorAll('td')).map(cellText)
        ].map(esc).join(','))
      ];
      const stamp = new Date().toISOString().slice(0, 10);
      const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spark-clean-bookings-${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  applyFilters();
})();

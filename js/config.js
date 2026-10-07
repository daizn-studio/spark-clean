/* =========================================================
   ALL SITE CONFIGURATION LIVES HERE.
   This is the only file you need to edit to connect real APIs.
   Loaded first, before every other script, on every page.

   Leave a value as '' and that feature automatically falls back to its
   safe demo mode (localStorage instead of a database, simulated payment
   instead of a real charge, etc.) — nothing breaks if you fill these in
   one at a time.
========================================================= */

const CONFIG = {
  // From your Supabase project → Settings → API.
  // Filling these in switches bookings/feedback/admin-login from
  // localStorage/demo-mode over to your real, shared database.
  SUPABASE_URL: 'https://helyjetaiiectfsxtojk.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlbHlqZXRhaWllY3Rmc3h0b2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MzI5MzQsImV4cCI6MjEwNDAwODkzNH0.E8tBabD7RsIr6APmeVwIj3H3P-yHd3TcLYKa7ntJgj8',

  // From your Stripe dashboard → Developers → API keys.
  // This is the PUBLISHABLE key only — never put your secret key here,
  // it belongs only in Supabase's function secrets (see SETUP-APIS.md).
  STRIPE_PUBLISHABLE_KEY: '', // not provided yet — payment stays in demo mode until this is set

  // Optional: only needed if you want SMS/lead alerts to go through
  // Zapier/Make/Twilio Studio instead of (or in addition to) Supabase.
  // Leave blank if you're not using this.
  ZAPIER_WEBHOOK_URL: ''
};

// Derived — you don't need to touch these.
CONFIG.FUNCTIONS_URL = CONFIG.SUPABASE_URL ? `${CONFIG.SUPABASE_URL}/functions/v1` : '';

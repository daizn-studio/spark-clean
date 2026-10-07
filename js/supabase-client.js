/* =========================================================
   SHARED SUPABASE CLIENT
   Requires the Supabase JS SDK loaded via CDN (added in each HTML page's
   <head>) and CONFIG.SUPABASE_URL / CONFIG.SUPABASE_ANON_KEY set in
   js/config.js. Returns null if not configured, so callers can fall
   back to their demo-mode (localStorage) behaviour.
========================================================= */

let _supabaseClient = null;

function getSupabaseClient() {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return null;
  if (typeof supabase === 'undefined') {
    console.warn('[supabase] SDK not loaded — add the CDN script tag to this page.');
    return null;
  }
  if (!_supabaseClient) {
    _supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
  return _supabaseClient;
}

const IS_LIVE_BACKEND = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

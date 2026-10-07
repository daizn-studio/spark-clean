/* =========================================================
   ADMIN AUTH

   SECURITY NOTE FOR YOUR DEVELOPER — read before going live:
   Client-side JavaScript can never be the actual security boundary.
   Anyone can view the source of this file, so a real deployment MUST
   verify admin sessions server-side (e.g. Supabase Auth + Row Level
   Security policies restricting the `orders` table to admin accounts).

   This file ships in two modes:
   - DEMO MODE (default, no Supabase keys set): any email/password
     "logs in" so you can click through the dashboard UI locally.
     There is NO real security in this mode — it's for building/testing
     the interface only.
   - LIVE MODE (once SUPABASE_URL + SUPABASE_ANON_KEY are set below):
     uses real Supabase Auth. You still need to mark specific accounts
     as admins in your database and enforce that server-side — see
     README.md → "Securing the admin portal".
========================================================= */

const ADMIN_AUTH_DEMO_MODE = !IS_LIVE_BACKEND;
const SESSION_KEY = 'sparkCleanAdminSession';

async function adminLogin(email, password) {
  if (!email || !password) {
    return { success: false, error: 'Enter both an email and a password.' };
  }

  if (ADMIN_AUTH_DEMO_MODE) {
    // Demo-only stand-in. Configure js/config.js to switch to real Supabase Auth.
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email, demo: true, loggedInAt: Date.now() }));
    return { success: true };
  }

  // --- LIVE MODE: real Supabase Auth call, then verify admin membership ---
  try {
    const client = getSupabaseClient();
    // getSupabaseClient() returns null if the Supabase SDK script didn't
    // load — a blocked CDN, an offline machine, or a slow connection that
    // timed out. Without this guard the next line throws a raw
    // "Cannot read properties of null (reading 'auth')" straight into the
    // login form, which tells the person nothing about what to do.
    if (!client) {
      return {
        success: false,
        error: 'Could not reach the authentication service. Check your internet connection and refresh the page.'
      };
    }
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };

    // Being logged in isn't enough — customer accounts use the same Auth
    // system. Only accounts listed in the `admins` table are admins.
    const { data: adminRow, error: adminCheckError } = await client
      .from('admins')
      .select('user_id')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (adminCheckError || !adminRow) {
      await client.auth.signOut();
      return { success: false, error: 'This account is not an admin. Contact the business owner to be added.' };
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify({ email, demo: false, loggedInAt: Date.now() }));
    return { success: true, session: data.session };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

function isAdminLoggedIn() {
  return !!localStorage.getItem(SESSION_KEY);
}

function adminLogout() {
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'login.html';
}

/**
 * Call at the top of any admin page to bounce non-logged-in visitors
 * straight to the login screen.
 */
function requireAdminLogin() {
  if (!isAdminLoggedIn()) {
    window.location.href = 'login.html';
  }
}

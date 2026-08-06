/* ReadTrack — auth.js
   Supabase Auth via REST API (no SDK needed)
*/
'use strict';

let SUPABASE_URL = '';
let SUPABASE_KEY = '';

// ── Load config from server ───────────────────────────────────
async function loadConfig() {
  try {
    const res  = await fetch('/.netlify/functions/config');
    const data = await res.json();
    SUPABASE_URL = data.supabaseUrl;
    SUPABASE_KEY = data.supabaseKey;
  } catch(e) {
    console.error('Could not load config:', e);
  }
}

// ── Helpers ───────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function showPage(id) {
  document.querySelectorAll('.auth-page').forEach(p => p.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}
function showErr(id, msg) {
  const el = $(id);
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}
function hideEl(id) { $(id)?.classList.add('hidden'); }
function setBtn(id, text, disabled) {
  const btn = $(id);
  if (btn) { btn.textContent = text; btn.disabled = disabled; }
}

// ── Supabase Auth API ─────────────────────────────────────────
async function sbAuth(endpoint, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      'apikey':       SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, data: await res.json() };
}

async function sbGet(table, filter = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${filter}`, {
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + getToken(),
      'Content-Type':  'application/json',
    },
  });
  return res.json();
}

async function sbInsert(table, body, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:  'POST',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + (token || getToken()),
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(body),
  });
  return res.ok;
}

// ── Token storage ─────────────────────────────────────────────
function saveSession(data) {
  localStorage.setItem('rt-auth', JSON.stringify({
    token:       data.access_token,
    refresh:     data.refresh_token,
    userId:      data.user?.id,
    email:       data.user?.email,
    expiresAt:   Date.now() + (data.expires_in || 3600) * 1000,
  }));
}
function getToken() {
  const s = getSession();
  return s?.token || '';
}
function getSession() {
  try { return JSON.parse(localStorage.getItem('rt-auth') || 'null'); } catch { return null; }
}
function clearSession() { localStorage.removeItem('rt-auth'); localStorage.removeItem('rt-profile'); }

// ── State ─────────────────────────────────────────────────────
let selectedRole = 'student';

// ── Role selection ────────────────────────────────────────────
document.querySelectorAll('.role-card').forEach(card => {
  card.addEventListener('click', () => {
    selectedRole = card.dataset.role;
    $('login-title')?.setAttribute('data-role', selectedRole);
    if ($('login-title'))   $('login-title').textContent   = selectedRole === 'teacher' ? 'Teacher Login'  : 'Student Login';
    if ($('signup-title'))  $('signup-title').textContent  = selectedRole === 'teacher' ? 'Create Teacher Account' : 'Create Student Account';
    // Hide class code field for teachers (they create classes separately)
    const classField = $('signup-class-field');
    if (classField) classField.style.display = selectedRole === 'teacher' ? 'none' : '';
    showPage('auth-page-login');
  });
});

document.querySelector('.auth-skip')?.addEventListener('click', () => {
  window.location.href = '/';
});

// ── Login ─────────────────────────────────────────────────────
$('btn-go-signup')?.addEventListener('click', () => showPage('auth-page-signup'));
$('btn-go-login')?.addEventListener('click',  () => showPage('auth-page-login'));
$('btn-login-back')?.addEventListener('click', () => showPage('auth-page-role'));
$('btn-signup-back')?.addEventListener('click', () => showPage('auth-page-login'));
$('btn-forgot-pw')?.addEventListener('click',  () => showPage('auth-page-forgot'));
$('btn-forgot-back')?.addEventListener('click', () => showPage('auth-page-login'));
$('btn-back-to-login')?.addEventListener('click', () => showPage('auth-page-login'));

$('btn-login')?.addEventListener('click', async () => {
  const email    = $('login-email')?.value.trim();
  const password = $('login-password')?.value;
  hideEl('login-error');

  if (!email || !password) { showErr('login-error', 'Please enter email and password.'); return; }

  setBtn('btn-login', 'Signing in…', true);

  const { ok, data } = await sbAuth('token?grant_type=password', { email, password });

  if (!ok) {
    showErr('login-error', data.error_description || data.message || 'Invalid email or password.');
    setBtn('btn-login', 'Sign In', false);
    return;
  }

  saveSession(data);

  // Load profile to get role
  const profiles = await sbGet('profiles', `?id=eq.${data.user.id}&select=*`);
  const profile  = Array.isArray(profiles) ? profiles[0] : null;

  if (profile) {
    localStorage.setItem('rt-profile', JSON.stringify(profile));
    // Redirect based on role
    if (profile.role === 'teacher') {
      window.location.href = '/teacher.html';
    } else {
      window.location.href = '/';
    }
  } else {
    // No profile yet — go to main app
    window.location.href = '/';
  }
});

// ── Sign Up ───────────────────────────────────────────────────
$('btn-signup')?.addEventListener('click', async () => {
  const name      = $('signup-name')?.value.trim();
  const email     = $('signup-email')?.value.trim();
  const classCode = $('signup-class-code')?.value.trim().toUpperCase();
  const password  = $('signup-password')?.value;
  const confirm   = $('signup-confirm')?.value;

  hideEl('signup-error'); hideEl('signup-success');

  if (!name || !email || !password) { showErr('signup-error', 'Please fill in all required fields.'); return; }
  if (selectedRole === 'student' && !classCode) { showErr('signup-error', 'Please enter your class code.'); return; }
  if (password.length < 6)   { showErr('signup-error', 'Password must be at least 6 characters.'); return; }
  if (password !== confirm)  { showErr('signup-error', 'Passwords do not match.'); return; }

  setBtn('btn-signup', 'Creating account…', true);

  const { ok, data } = await sbAuth('signup', { email, password });

  if (!ok) {
    showErr('signup-error', data.error_description || data.message || 'Sign up failed.');
    setBtn('btn-signup', 'Create Account', false);
    return;
  }

  // Create profile
  const token = data.access_token;
  if (token) {
    await sbInsert('profiles', {
      id:         data.user.id,
      full_name:  name,
      role:       selectedRole,
      class_code: selectedRole === 'student' ? classCode : null,
    }, token);
  }

  $('signup-success')?.classList.remove('hidden');
  setBtn('btn-signup', 'Create Account', false);
});

// ── Forgot Password ───────────────────────────────────────────
$('btn-reset-pw')?.addEventListener('click', async () => {
  const email = $('forgot-email')?.value.trim();
  hideEl('forgot-error'); hideEl('forgot-success');
  if (!email) { showErr('forgot-error', 'Please enter your email.'); return; }

  setBtn('btn-reset-pw', 'Sending…', true);

  const { ok, data } = await sbAuth('recover', { email });

  if (!ok) {
    showErr('forgot-error', data.error_description || 'Failed to send reset email.');
  } else {
    $('forgot-success')?.classList.remove('hidden');
  }
  setBtn('btn-reset-pw', 'Send Reset Link', false);
});

// ── Auto-check existing session ───────────────────────────────
const existingSession = getSession();
if (existingSession && existingSession.token && existingSession.expiresAt > Date.now()) {
  const profile = JSON.parse(localStorage.getItem('rt-profile') || 'null');
  if (profile?.role === 'teacher') {
    window.location.href = '/teacher.html';
  } else {
    window.location.href = '/';
  }
}

// ── Init ──────────────────────────────────────────────────────
loadConfig();

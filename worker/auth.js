/* KAIROS V5.0 — Cloudflare Workers Authentication & Account Module
 * Uses standard Web Crypto PBKDF2-SHA256 (100,000 iterations — Cloudflare Workers max),
 * CSPRNG SHA-256 hashed session tokens, HttpOnly SameSite=Lax cookies, CSRF origin checks,
 * per-IP brute-force throttling, and strict D1 user data isolation.
 */

const PBKDF2_ITERATIONS = 100000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

const authFailures = new Map();

function randomBytesHex(len) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  const dig = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(dig), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const saltBytes = new Uint8Array(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMat,
    256
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  if (sa.length !== sb.length) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i++) {
    diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  }
  return diff === 0;
}

function parseCookies(headerStr) {
  const out = {};
  if (!headerStr) return out;
  const parts = String(headerStr).split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch (e) {
      out[k] = v;
    }
  }
  return out;
}

function buildSessionCookie(token, requestUrl, maxAgeSec) {
  const isHttps = String(requestUrl || '').startsWith('https://');
  const attrs = [
    `kairos_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`
  ];
  if (isHttps) attrs.push('Secure');
  return attrs.join('; ');
}

function authJson(obj, status, extraHeaders) {
  const headers = Object.assign(
    {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff'
    },
    extraHeaders || {}
  );
  return new Response(JSON.stringify(obj), { status: status || 200, headers });
}

function verifyCsrf(request) {
  const m = request.method;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return true;
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin) {
    try {
      const o = new URL(origin);
      if (o.origin !== url.origin) return false;
    } catch (e) {
      return false;
    }
  }
  const referer = request.headers.get('Referer');
  if (!origin && referer) {
    try {
      const r = new URL(referer);
      if (r.origin !== url.origin) return false;
    } catch (e) {
      return false;
    }
  }
  return true;
}

function checkAuthRateLimit(ip, recordFailure) {
  const now = Date.now();
  const entry = authFailures.get(ip);
  if (!entry || now - entry.start > LOGIN_WINDOW_MS) {
    if (recordFailure) authFailures.set(ip, { start: now, count: 1 });
    return true;
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) return false;
  if (recordFailure) entry.count++;
  return true;
}

function clearAuthFailures(ip) {
  authFailures.delete(ip);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 160;
}

async function getSessionUser(request, env) {
  if (!env || !env.DB) return null;
  const cookies = parseCookies(request.headers.get('Cookie'));
  let rawToken = cookies.kairos_session || '';
  if (!rawToken) {
    const authHdr = request.headers.get('Authorization') || '';
    if (authHdr.startsWith('Bearer ')) rawToken = authHdr.slice(7).trim();
  }
  if (!rawToken || rawToken.length < 16) return null;
  const tokenHash = await sha256Hex(rawToken);
  const now = Date.now();
  const row = await env.DB.prepare(
    'SELECT s.id as session_id, s.expires_at, u.id, u.email, u.email_verified, u.display_name, u.avatar_url, u.bio, u.role, u.created_at FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > ?'
  )
    .bind(tokenHash, now)
    .first();
  if (!row) return null;
  return {
    sessionId: row.session_id,
    id: row.id,
    email: row.email,
    emailVerified: Boolean(row.email_verified),
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    role: row.role,
    createdAt: row.created_at
  };
}

async function createUserSession(env, userId, request) {
  const rawToken = randomBytesHex(32);
  const tokenHash = await sha256Hex(rawToken);
  const sessionId = 'ses_' + randomBytesHex(12);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  const ipHash = (await sha256Hex(ip)).slice(0, 24);
  const ua = String(request.headers.get('User-Agent') || '').slice(0, 180);
  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at, ip_hash, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(sessionId, userId, tokenHash, expiresAt, ipHash, ua, now)
    .run();
  return { rawToken, sessionId, expiresAt };
}

async function sendOptionalResendEmail(env, toEmail, subject, htmlBody) {
  if (!env || !env.RESEND_API_KEY) {
    return { sent: false, reason: 'RESEND_API_KEY not configured' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || 'KAIROS Atlas <onboarding@resend.dev>',
        to: [toEmail],
        subject,
        html: htmlBody
      })
    });
    return { sent: res.ok, reason: res.ok ? 'delivered' : `HTTP ${res.status}` };
  } catch (e) {
    return { sent: false, reason: 'Email upstream unavailable' };
  }
}

async function handleAuthRequest(request, env) {
  const url = new URL(request.url);
  const p = url.pathname;
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';

  if (!verifyCsrf(request)) {
    return authJson({ ok: false, error: 'Cross-site request rejected (CSRF origin mismatch)' }, 403);
  }

  if (!env || !env.DB) {
    return authJson({ ok: false, configured: false, error: 'D1 database binding (DB) not configured for accounts' }, 501);
  }

  // GET /api/auth/me
  if (p === '/api/auth/me' && request.method === 'GET') {
    const user = await getSessionUser(request, env);
    if (!user) return authJson({ ok: true, authenticated: false, user: null });
    const prefs = await env.DB.prepare('SELECT default_lang, default_currency, travel_prefs_json, photo_prefs_json, profile_visibility, public_slug FROM user_preferences WHERE user_id = ?')
      .bind(user.id)
      .first();
    return authJson({
      ok: true,
      authenticated: true,
      user: Object.assign({}, user, {
        preferences: prefs
          ? {
              defaultLang: prefs.default_lang,
              defaultCurrency: prefs.default_currency,
              travelPrefs: JSON.parse(prefs.travel_prefs_json || '{}'),
              photoPrefs: JSON.parse(prefs.photo_prefs_json || '{}'),
              profileVisibility: prefs.profile_visibility,
              publicSlug: prefs.public_slug
            }
          : null
      })
    });
  }

  // POST /api/auth/register
  if (p === '/api/auth/register' && request.method === 'POST') {
    if (!checkAuthRateLimit(ip, false)) {
      return authJson({ ok: false, error: 'Too many authentication attempts. Please try again later.' }, 429);
    }
    const body = await request.json().catch(() => null);
    const email = normalizeEmail(body && body.email);
    const password = String((body && body.password) || '');
    const displayName = String((body && body.displayName) || '').trim().slice(0, 60) || email.split('@')[0];

    if (!isValidEmail(email) || password.length < 8 || password.length > 128) {
      return authJson({ ok: false, error: 'Valid email and password (8-128 chars) required' }, 400);
    }

    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) {
      checkAuthRateLimit(ip, true);
      return authJson({ ok: false, error: 'Unable to register with this email address' }, 409);
    }

    const userId = 'usr_' + randomBytesHex(12);
    const salt = randomBytesHex(16);
    const pwdHash = await hashPassword(password, salt);
    const now = Date.now();

    await env.DB.prepare(
      'INSERT INTO users (id, email, email_verified, password_hash, password_salt, display_name, avatar_url, bio, role, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(userId, email, pwdHash, salt, displayName, '', '', 'user', now, now)
      .run();

    await env.DB.prepare(
      'INSERT INTO user_preferences (user_id, default_lang, default_currency, travel_prefs_json, photo_prefs_json, profile_visibility, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(userId, 'zh-CN', 'CNY', '{}', '{}', 'private', now)
      .run();

    // Create email verification token
    const verifyToken = randomBytesHex(24);
    const verifyHash = await sha256Hex(verifyToken);
    await env.DB.prepare('INSERT INTO verifications (id, identifier, token_hash, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('ver_' + randomBytesHex(8), email, verifyHash, 'email_verify', now + VERIFY_TTL_MS, now)
      .run();

    const verifyUrl = `${url.origin}/?verify_email=${encodeURIComponent(verifyToken)}`;
    const emailRes = await sendOptionalResendEmail(
      env,
      email,
      'Verify your KAIROS account',
      `<p>Welcome to KAIROS World Travel Atlas.</p><p><a href="${verifyUrl}">Click to verify your email</a></p>`
    );

    const { rawToken } = await createUserSession(env, userId, request);
    return authJson(
      {
        ok: true,
        user: { id: userId, email, emailVerified: false, displayName, role: 'user' },
        emailSent: emailRes.sent,
        emailNotice: emailRes.sent ? 'Verification email sent' : 'Email service not configured on this server; account created in unverified state'
      },
      201,
      { 'Set-Cookie': buildSessionCookie(rawToken, request.url, Math.floor(SESSION_TTL_MS / 1000)) }
    );
  }

  // POST /api/auth/login
  if (p === '/api/auth/login' && request.method === 'POST') {
    if (!checkAuthRateLimit(ip, false)) {
      return authJson({ ok: false, error: 'Too many failed login attempts. Please wait 15 minutes.' }, 429);
    }
    const body = await request.json().catch(() => null);
    const email = normalizeEmail(body && body.email);
    const password = String((body && body.password) || '');
    if (!email || !password) {
      return authJson({ ok: false, error: 'Invalid email or password' }, 400);
    }

    const row = await env.DB.prepare('SELECT id, email, email_verified, password_hash, password_salt, display_name, avatar_url, bio, role FROM users WHERE email = ?')
      .bind(email)
      .first();

    if (!row || !row.password_hash || !row.password_salt) {
      checkAuthRateLimit(ip, true);
      return authJson({ ok: false, error: 'Invalid email or password' }, 401);
    }

    const candidateHash = await hashPassword(password, row.password_salt);
    if (!constantTimeEqual(candidateHash, row.password_hash)) {
      checkAuthRateLimit(ip, true);
      return authJson({ ok: false, error: 'Invalid email or password' }, 401);
    }

    clearAuthFailures(ip);
    const { rawToken } = await createUserSession(env, row.id, request);
    return authJson(
      {
        ok: true,
        user: {
          id: row.id,
          email: row.email,
          emailVerified: Boolean(row.email_verified),
          displayName: row.display_name,
          avatarUrl: row.avatar_url,
          bio: row.bio,
          role: row.role
        }
      },
      200,
      { 'Set-Cookie': buildSessionCookie(rawToken, request.url, Math.floor(SESSION_TTL_MS / 1000)) }
    );
  }

  // POST /api/auth/logout
  if (p === '/api/auth/logout' && request.method === 'POST') {
    const user = await getSessionUser(request, env);
    if (user && user.sessionId) {
      await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(user.sessionId).run();
    }
    return authJson({ ok: true }, 200, {
      'Set-Cookie': buildSessionCookie('', request.url, 0)
    });
  }

  // POST /api/auth/verify-email
  if (p === '/api/auth/verify-email' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const token = String((body && body.token) || '').trim();
    if (!token) return authJson({ ok: false, error: 'Verification token required' }, 400);
    const tHash = await sha256Hex(token);
    const ver = await env.DB.prepare('SELECT id, identifier, expires_at FROM verifications WHERE token_hash = ? AND purpose = ?')
      .bind(tHash, 'email_verify')
      .first();
    if (!ver || Number(ver.expires_at) < Date.now()) {
      return authJson({ ok: false, error: 'Invalid or expired verification token' }, 400);
    }
    await env.DB.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE email = ?').bind(Date.now(), ver.identifier).run();
    await env.DB.prepare('DELETE FROM verifications WHERE id = ?').bind(ver.id).run();
    return authJson({ ok: true, verified: true });
  }

  // POST /api/auth/request-reset
  if (p === '/api/auth/request-reset' && request.method === 'POST') {
    if (!checkAuthRateLimit(ip, false)) {
      return authJson({ ok: false, error: 'Rate limit exceeded' }, 429);
    }
    const body = await request.json().catch(() => null);
    const email = normalizeEmail(body && body.email);
    const emailConfigured = Boolean(env.RESEND_API_KEY);
    if (!isValidEmail(email)) {
      return authJson({ ok: false, error: 'Valid email required' }, 400);
    }
    const userRow = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (userRow && emailConfigured) {
      const resetToken = randomBytesHex(24);
      const resetHash = await sha256Hex(resetToken);
      const now = Date.now();
      await env.DB.prepare('INSERT INTO verifications (id, identifier, token_hash, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind('rst_' + randomBytesHex(8), email, resetHash, 'password_reset', now + 3600 * 1000, now)
        .run();
      const resetUrl = `${url.origin}/?reset_token=${encodeURIComponent(resetToken)}`;
      await sendOptionalResendEmail(env, email, 'Reset your KAIROS password', `<p><a href="${resetUrl}">Click here to reset your password</a> (valid 1 hour).</p>`);
    }
    // Non-enumerating response; honest about email config
    return authJson({
      ok: true,
      emailSent: emailConfigured,
      notice: emailConfigured
        ? 'If that email exists, a password reset link has been dispatched.'
        : 'Email delivery service (RESEND_API_KEY) is not configured on this server.'
    }, emailConfigured ? 200 : 501);
  }

  // POST /api/auth/reset-password
  if (p === '/api/auth/reset-password' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const token = String((body && body.token) || '').trim();
    const newPass = String((body && body.newPassword) || '');
    if (!token || newPass.length < 8 || newPass.length > 128) {
      return authJson({ ok: false, error: 'Valid token and new password (8-128 chars) required' }, 400);
    }
    const tHash = await sha256Hex(token);
    const ver = await env.DB.prepare('SELECT id, identifier, expires_at FROM verifications WHERE token_hash = ? AND purpose = ?')
      .bind(tHash, 'password_reset')
      .first();
    if (!ver || Number(ver.expires_at) < Date.now()) {
      return authJson({ ok: false, error: 'Invalid or expired reset token' }, 400);
    }
    const salt = randomBytesHex(16);
    const pwdHash = await hashPassword(newPass, salt);
    await env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE email = ?')
      .bind(pwdHash, salt, Date.now(), ver.identifier)
      .run();
    await env.DB.prepare('DELETE FROM verifications WHERE id = ?').bind(ver.id).run();
    return authJson({ ok: true });
  }

  // GET /api/auth/google & /api/auth/google/callback
  if (p === '/api/auth/google') {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return authJson({ ok: false, configured: false, error: 'Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) not configured' }, 501);
    }
    const state = randomBytesHex(16);
    const redirectUri = `${url.origin}/api/auth/google/callback`;
    const gUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    gUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    gUrl.searchParams.set('redirect_uri', redirectUri);
    gUrl.searchParams.set('response_type', 'code');
    gUrl.searchParams.set('scope', 'openid email profile');
    gUrl.searchParams.set('state', state);
    return new Response(null, {
      status: 302,
      headers: {
        Location: gUrl.toString(),
        'Set-Cookie': `kairos_oauth_state=${state}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600`
      }
    });
  }

  if (p === '/api/auth/google/callback') {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return authJson({ ok: false, configured: false, error: 'Google OAuth not configured' }, 501);
    }
    const code = url.searchParams.get('code') || '';
    const state = url.searchParams.get('state') || '';
    const cookies = parseCookies(request.headers.get('Cookie'));
    if (!code || !state || state !== cookies.kairos_oauth_state) {
      return authJson({ ok: false, error: 'Invalid OAuth state' }, 400);
    }
    const tokRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${url.origin}/api/auth/google/callback`,
        grant_type: 'authorization_code'
      }).toString()
    });
    const tok = await tokRes.json().catch(() => null);
    if (!tokRes.ok || !tok || !tok.access_token) {
      return authJson({ ok: false, error: 'Google OAuth token exchange failed' }, 502);
    }
    const uiRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tok.access_token}` }
    });
    const gUser = await uiRes.json().catch(() => null);
    if (!uiRes.ok || !gUser || !gUser.email) {
      return authJson({ ok: false, error: 'Google userinfo fetch failed' }, 502);
    }
    const email = normalizeEmail(gUser.email);
    const now = Date.now();
    let existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    let userId = existing ? existing.id : 'usr_' + randomBytesHex(12);
    if (!existing) {
      await env.DB.prepare(
        'INSERT INTO users (id, email, email_verified, display_name, avatar_url, bio, role, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)'
      )
        .bind(userId, email, String(gUser.name || email.split('@')[0]).slice(0, 60), String(gUser.picture || ''), '', 'user', now, now)
        .run();
      await env.DB.prepare(
        'INSERT INTO user_preferences (user_id, default_lang, default_currency, travel_prefs_json, photo_prefs_json, profile_visibility, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(userId, 'zh-CN', 'CNY', '{}', '{}', 'private', now)
        .run();
    }
    await env.DB.prepare(
      'INSERT OR IGNORE INTO accounts (id, user_id, provider, provider_account_id, created_at) VALUES (?, ?, ?, ?, ?)'
    )
      .bind('acc_' + randomBytesHex(8), userId, 'google', String(gUser.id || email), now)
      .run();

    const { rawToken } = await createUserSession(env, userId, request);
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/?auth=ok',
        'Set-Cookie': buildSessionCookie(rawToken, request.url, Math.floor(SESSION_TTL_MS / 1000))
      }
    });
  }

  // Protected /api/account/* endpoints
  const user = await getSessionUser(request, env);
  if (!user) {
    return authJson({ ok: false, error: 'Authentication required' }, 401);
  }

  if (p === '/api/account/profile' && request.method === 'GET') {
    const prefs = await env.DB.prepare('SELECT * FROM user_preferences WHERE user_id = ?').bind(user.id).first();
    const [favs, wishes, trips, records] = await Promise.all([
      env.DB.prepare('SELECT dest_id, created_at FROM favorites WHERE user_id = ?').bind(user.id).all(),
      env.DB.prepare('SELECT * FROM wishlists WHERE user_id = ?').bind(user.id).all(),
      env.DB.prepare('SELECT id, title, access_mode, data_json, version, updated_at FROM trips WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 50').bind(user.id).all(),
      env.DB.prepare('SELECT * FROM travel_records WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100').bind(user.id).all()
    ]);
    return authJson({
      ok: true,
      user,
      preferences: prefs || null,
      favorites: (favs && favs.results) || [],
      wishlists: (wishes && wishes.results) || [],
      trips: (trips && trips.results) || [],
      travelRecords: (records && records.results) || []
    });
  }

  if (p === '/api/account/profile' && request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return authJson({ ok: false, error: 'Invalid JSON body' }, 400);
    const now = Date.now();
    const displayName = body.displayName !== undefined ? String(body.displayName).trim().slice(0, 60) : user.displayName;
    const bio = body.bio !== undefined ? String(body.bio).trim().slice(0, 280) : user.bio;
    const avatarUrl = body.avatarUrl !== undefined ? String(body.avatarUrl).slice(0, 2000) : user.avatarUrl;
    if (avatarUrl && !avatarUrl.startsWith('https://') && !avatarUrl.startsWith('data:image/')) {
      return authJson({ ok: false, error: 'Invalid avatar URL' }, 400);
    }

    await env.DB.prepare('UPDATE users SET display_name = ?, bio = ?, avatar_url = ?, updated_at = ? WHERE id = ?')
      .bind(displayName, bio, avatarUrl, now, user.id)
      .run();

    const pObj = body.preferences || {};
    const defLang = ['zh-CN', 'zh-TW', 'en'].includes(pObj.defaultLang) ? pObj.defaultLang : 'zh-CN';
    const defCur = String(pObj.defaultCurrency || 'CNY').slice(0, 8);
    const vis = pObj.profileVisibility === 'public' ? 'public' : 'private';
    const slug = pObj.publicSlug ? String(pObj.publicSlug).replace(/[^a-z0-9-_]/gi, '').slice(0, 40) : null;
    await env.DB.prepare(
      'INSERT INTO user_preferences (user_id, default_lang, default_currency, travel_prefs_json, photo_prefs_json, profile_visibility, public_slug, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET default_lang=excluded.default_lang, default_currency=excluded.default_currency, travel_prefs_json=excluded.travel_prefs_json, photo_prefs_json=excluded.photo_prefs_json, profile_visibility=excluded.profile_visibility, public_slug=excluded.public_slug, updated_at=excluded.updated_at'
    )
      .bind(
        user.id,
        defLang,
        defCur,
        JSON.stringify(pObj.travelPrefs || {}),
        JSON.stringify(pObj.photoPrefs || {}),
        vis,
        slug,
        now
      )
      .run();

    return authJson({ ok: true, updatedAt: now });
  }

  if (p === '/api/account/migrate-local' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return authJson({ ok: false, error: 'Invalid archive payload' }, 400);
    const now = Date.now();
    let importedCount = 0;

    if (Array.isArray(body.travelStatus)) {
      for (const st of body.travelStatus.slice(0, 1000)) {
        if (!st || !st.destId) continue;
        await env.DB.prepare(
          'INSERT INTO wishlists (user_id, dest_id, status, notes, rating, visited_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, dest_id) DO UPDATE SET status=CASE WHEN excluded.updated_at >= wishlists.updated_at THEN excluded.status ELSE wishlists.status END, notes=CASE WHEN excluded.updated_at >= wishlists.updated_at THEN excluded.notes ELSE wishlists.notes END, rating=CASE WHEN excluded.updated_at >= wishlists.updated_at THEN excluded.rating ELSE wishlists.rating END, updated_at=MAX(wishlists.updated_at, excluded.updated_at)'
        )
          .bind(user.id, String(st.destId), String(st.status || 'wishlist'), String(st.notes || ''), Number(st.rating) || 0, String(st.visitedAt || ''), Number(st.updatedAt) || now)
          .run();
        importedCount++;
      }
    }
    if (Array.isArray(body.trips)) {
      for (const tr of body.trips.slice(0, 100)) {
        if (!tr || !tr.id) continue;
        const tid = String(tr.id);
        const existingTrip = await env.DB.prepare('SELECT owner_id FROM trips WHERE id = ?').bind(tid).first();
        // NEVER overwrite another user's trip ID!
        const safeId = existingTrip && existingTrip.owner_id !== user.id ? `${tid}_${user.id.slice(4, 10)}` : tid;
        await env.DB.prepare(
          'INSERT INTO trips (id, owner_id, title, access_mode, data_json, version, updated_at, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, data_json=excluded.data_json, updated_at=MAX(trips.updated_at, excluded.updated_at)'
        )
          .bind(safeId, user.id, String(tr.name || 'Imported Trip').slice(0, 120), 'private', JSON.stringify(tr), Number(tr.updatedAt) || now, now)
          .run();
        await env.DB.prepare('INSERT OR IGNORE INTO trip_members (trip_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
          .bind(safeId, user.id, 'owner', now)
          .run();
        importedCount++;
      }
    }
    return authJson({ ok: true, importedCount });
  }

  if (p === '/api/account/export' && request.method === 'GET') {
    const [prefs, favs, wishes, trips, records, expenses] = await Promise.all([
      env.DB.prepare('SELECT * FROM user_preferences WHERE user_id = ?').bind(user.id).first(),
      env.DB.prepare('SELECT * FROM favorites WHERE user_id = ?').bind(user.id).all(),
      env.DB.prepare('SELECT * FROM wishlists WHERE user_id = ?').bind(user.id).all(),
      env.DB.prepare('SELECT * FROM trips WHERE owner_id = ?').bind(user.id).all(),
      env.DB.prepare('SELECT * FROM travel_records WHERE user_id = ?').bind(user.id).all(),
      env.DB.prepare('SELECT * FROM expenses WHERE user_id = ?').bind(user.id).all()
    ]);
    return authJson({
      ok: true,
      exportedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email, displayName: user.displayName, bio: user.bio, createdAt: user.createdAt },
      preferences: prefs || null,
      favorites: (favs && favs.results) || [],
      wishlists: (wishes && wishes.results) || [],
      trips: (trips && trips.results) || [],
      travelRecords: (records && records.results) || [],
      expenses: (expenses && expenses.results) || []
    });
  }

  if (p === '/api/account' && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
    return authJson({ ok: true, deleted: true }, 200, {
      'Set-Cookie': buildSessionCookie('', request.url, 0)
    });
  }

  return authJson({ ok: false, error: 'Account route not found' }, 404);
}

export { handleAuthRequest, getSessionUser, hashPassword, sha256Hex, randomBytesHex, authJson };

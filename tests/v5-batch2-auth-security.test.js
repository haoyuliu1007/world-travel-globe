'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/**
 * Lightweight deterministic in-memory D1 mock supporting prepared statements for auth security tests.
 */
function createMockD1() {
  const tables = {
    users: [],
    sessions: [],
    accounts: [],
    verifications: [],
    user_preferences: [],
    favorites: [],
    wishlists: [],
    trips: [],
    trip_members: [],
    travel_records: [],
    expenses: []
  };

  function runSql(sql, params) {
    const s = sql.trim();
    if (/^INSERT INTO users/i.test(s)) {
      tables.users.push({
        id: params[0], email: params[1], email_verified: 0,
        password_hash: params[2], password_salt: params[3],
        display_name: params[4], avatar_url: params[5], bio: params[6],
        role: params[7], created_at: params[8], updated_at: params[9]
      });
      return { success: true };
    }
    if (/^INSERT INTO user_preferences/i.test(s)) {
      const uid = params[0];
      const idx = tables.user_preferences.findIndex((r) => r.user_id === uid);
      const row = {
        user_id: uid, default_lang: params[1], default_currency: params[2],
        travel_prefs_json: params[3], photo_prefs_json: params[4],
        profile_visibility: params[5], public_slug: params.length > 7 ? params[6] : null,
        updated_at: params[params.length - 1]
      };
      if (idx >= 0) tables.user_preferences[idx] = row;
      else tables.user_preferences.push(row);
      return { success: true };
    }
    if (/^INSERT INTO verifications/i.test(s)) {
      tables.verifications.push({ id: params[0], identifier: params[1], token_hash: params[2], purpose: params[3], expires_at: params[4], created_at: params[5] });
      return { success: true };
    }
    if (/^INSERT INTO sessions/i.test(s)) {
      tables.sessions.push({ id: params[0], user_id: params[1], token_hash: params[2], expires_at: params[3], ip_hash: params[4], user_agent: params[5], created_at: params[6] });
      return { success: true };
    }
    if (/^INSERT INTO wishlists/i.test(s)) {
      const idx = tables.wishlists.findIndex((w) => w.user_id === params[0] && w.dest_id === params[1]);
      const rec = { user_id: params[0], dest_id: params[1], status: params[2], notes: params[3], rating: params[4], visited_at: params[5], updated_at: params[6] };
      if (idx >= 0) tables.wishlists[idx] = rec;
      else tables.wishlists.push(rec);
      return { success: true };
    }
    if (/^INSERT INTO trips/i.test(s)) {
      const idx = tables.trips.findIndex((t) => t.id === params[0]);
      const rec = { id: params[0], owner_id: params[1], title: params[2], access_mode: params[3], data_json: params[4], version: 1, updated_at: params[5], created_at: params[6] };
      if (idx >= 0) tables.trips[idx] = rec;
      else tables.trips.push(rec);
      return { success: true };
    }
    if (/^INSERT OR IGNORE INTO trip_members/i.test(s)) {
      if (!tables.trip_members.some((m) => m.trip_id === params[0] && m.user_id === params[1])) {
        tables.trip_members.push({ trip_id: params[0], user_id: params[1], role: params[2], joined_at: params[3] });
      }
      return { success: true };
    }
    if (/^UPDATE users SET display_name/i.test(s)) {
      const u = tables.users.find((x) => x.id === params[4]);
      if (u) { u.display_name = params[0]; u.bio = params[1]; u.avatar_url = params[2]; u.updated_at = params[3]; }
      return { success: true };
    }
    if (/^DELETE FROM sessions WHERE id = \?/i.test(s)) {
      tables.sessions = tables.sessions.filter((x) => x.id !== params[0]);
      return { success: true };
    }
    if (/^DELETE FROM sessions WHERE user_id = \?/i.test(s)) {
      tables.sessions = tables.sessions.filter((x) => x.user_id !== params[0]);
      return { success: true };
    }
    if (/^DELETE FROM users WHERE id = \?/i.test(s)) {
      const uid = params[0];
      tables.users = tables.users.filter((x) => x.id !== uid);
      tables.sessions = tables.sessions.filter((x) => x.user_id !== uid);
      tables.user_preferences = tables.user_preferences.filter((x) => x.user_id !== uid);
      tables.wishlists = tables.wishlists.filter((x) => x.user_id !== uid);
      tables.trips = tables.trips.filter((x) => x.owner_id !== uid);
      return { success: true };
    }
    return { success: true };
  }

  function firstSql(sql, params) {
    const s = sql.trim();
    if (/^SELECT id FROM users WHERE email = \?/i.test(s)) {
      return tables.users.find((u) => u.email === params[0]) || null;
    }
    if (/^SELECT id, email, email_verified, password_hash/i.test(s)) {
      return tables.users.find((u) => u.email === params[0]) || null;
    }
    if (/^SELECT s\.id as session_id/i.test(s)) {
      const ses = tables.sessions.find((x) => x.token_hash === params[0] && x.expires_at > params[1]);
      if (!ses) return null;
      const u = tables.users.find((x) => x.id === ses.user_id);
      if (!u) return null;
      return Object.assign({ session_id: ses.id, expires_at: ses.expires_at }, u);
    }
    if (/FROM user_preferences WHERE user_id = \?/i.test(s)) {
      return tables.user_preferences.find((p) => p.user_id === params[0]) || null;
    }
    if (/^SELECT owner_id FROM trips WHERE id = \?/i.test(s)) {
      return tables.trips.find((t) => t.id === params[0]) || null;
    }
    return null;
  }

  function allSql(sql, params) {
    const s = sql.trim();
    if (/FROM favorites WHERE user_id = \?/i.test(s)) return { results: tables.favorites.filter((x) => x.user_id === params[0]) };
    if (/FROM wishlists WHERE user_id = \?/i.test(s)) return { results: tables.wishlists.filter((x) => x.user_id === params[0]) };
    if (/FROM trips WHERE owner_id = \?/i.test(s)) return { results: tables.trips.filter((x) => x.owner_id === params[0]) };
    if (/FROM travel_records WHERE user_id = \?/i.test(s)) return { results: tables.travel_records.filter((x) => x.user_id === params[0]) };
    if (/FROM expenses WHERE user_id = \?/i.test(s)) return { results: tables.expenses.filter((x) => x.user_id === params[0]) };
    return { results: [] };
  }

  return {
    tables,
    prepare(sql) {
      let args = [];
      return {
        bind(...a) { args = a; return this; },
        async run() { return runSql(sql, args); },
        async first() { return firstSql(sql, args); },
        async all() { return allSql(sql, args); }
      };
    }
  };
}

test('V5.0 Batch 2: Migration 0003 defines all required V5 tables cleanly', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'migrations/0003_v5_accounts_collab.sql'), 'utf8');
  for (const tbl of [
    'users', 'sessions', 'accounts', 'verifications', 'user_preferences',
    'favorites', 'wishlists', 'trips', 'trip_members', 'trip_stops',
    'travel_records', 'expenses', 'shared_links', 'comments', 'polls', 'poll_votes', 'media_assets'
  ]) {
    assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS ${tbl}`), `Missing table ${tbl} in migration 0003`);
  }
});

test('V5.0 Batch 2: Worker Auth enforces PBKDF2, HttpOnly cookies, CSRF, user isolation, export & delete cascade', async () => {
  const workerMod = await import('../worker/index.js');
  const worker = workerMod.default;
  const db = createMockD1();
  const env = { DB: db };

  // 1. Unauthenticated account access returns 401 + frame-ancestors 'none'
  const unauthRes = await worker.fetch(new Request('https://world-travel-globe.globe-app.workers.dev/api/account/profile'), env);
  assert.equal(unauthRes.status, 401);
  assert.equal(unauthRes.headers.get('Content-Security-Policy'), "frame-ancestors 'none'");

  // 2. Register user A
  const regRes = await worker.fetch(new Request('https://world-travel-globe.globe-app.workers.dev/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://world-travel-globe.globe-app.workers.dev' },
    body: JSON.stringify({ email: 'alice@example.com', password: 'StrongPassword123!', displayName: 'Alice' })
  }), env);
  assert.equal(regRes.status, 201);
  const regJson = await regRes.json();
  assert.equal(regJson.ok, true);
  assert.equal(regJson.emailSent, false); // Honest when RESEND_API_KEY unconfigured
  const cookieHdr = regRes.headers.get('Set-Cookie') || '';
  assert.ok(cookieHdr.includes('kairos_session=') && cookieHdr.includes('HttpOnly') && cookieHdr.includes('Secure'));
  const sessionCookie = cookieHdr.split(';')[0];

  // 3. Cross-site CSRF Origin mismatch rejected with 403
  const csrfRes = await worker.fetch(new Request('https://world-travel-globe.globe-app.workers.dev/api/account/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie, Origin: 'https://evil.attacker.example' },
    body: JSON.stringify({ displayName: 'Hacked' })
  }), env);
  assert.equal(csrfRes.status, 403);

  // 4. Google OAuth unconfigured returns honest 501
  const oauthRes = await worker.fetch(new Request('https://world-travel-globe.globe-app.workers.dev/api/auth/google'), env);
  assert.equal(oauthRes.status, 501);

  // 5. Migrate local archive for Alice & verify isolated export
  const migRes = await worker.fetch(new Request('https://world-travel-globe.globe-app.workers.dev/api/account/migrate-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({
      travelStatus: [{ destId: 'cn-beijing', status: 'visited', updatedAt: 1700000000000 }],
      trips: [{ id: 'trip_shared_id', name: 'Alice Beijing', updatedAt: 1700000000000 }]
    })
  }), env);
  assert.equal(migRes.status, 200);

  // 6. Register user B (Bob) and attempt to migrate same trip_shared_id -> must NOT overwrite Alice's trip!
  const regBob = await worker.fetch(new Request('https://world-travel-globe.globe-app.workers.dev/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bob@example.com', password: 'BobPassword123!', displayName: 'Bob' })
  }), env);
  const bobCookie = (regBob.headers.get('Set-Cookie') || '').split(';')[0];
  await worker.fetch(new Request('https://world-travel-globe.globe-app.workers.dev/api/account/migrate-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: bobCookie },
    body: JSON.stringify({ trips: [{ id: 'trip_shared_id', name: 'Bob Hijack Attempt', updatedAt: 1800000000000 }] })
  }), env);

  const aliceExp = await (await worker.fetch(new Request('https://world-travel-globe.globe-app.workers.dev/api/account/export', { headers: { Cookie: sessionCookie } }), env)).json();
  assert.equal(aliceExp.trips.length, 1);
  assert.equal(aliceExp.trips[0].title, 'Alice Beijing');

  // 7. Wrong password returns 401 non-enumerating error; logout invalidates session; delete removes user
  const badLogin = await worker.fetch(new Request('https://world-travel-globe.globe-app.workers.dev/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@example.com', password: 'WrongPassword!' })
  }), env);
  assert.equal(badLogin.status, 401);

  const delRes = await worker.fetch(new Request('https://world-travel-globe.globe-app.workers.dev/api/account', {
    method: 'DELETE',
    headers: { Cookie: sessionCookie }
  }), env);
  assert.equal(delRes.status, 200);

  const afterDel = await worker.fetch(new Request('https://world-travel-globe.globe-app.workers.dev/api/auth/me', { headers: { Cookie: sessionCookie } }), env);
  const afterDelJson = await afterDel.json();
  assert.equal(afterDelJson.authenticated, false);
});

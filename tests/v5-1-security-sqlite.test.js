'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

function createFullMockD1() {
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
    shared_links: [],
    comments: [],
    polls: [],
    poll_votes: [],
    trip_versions: [],
    travel_records: [],
    expenses: [],
    user_profiles: [],
    profile_backups: []
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
      return { success: true, meta: { changes: 1 } };
    }
    if (/^INSERT INTO user_preferences/i.test(s)) {
      const idx = tables.user_preferences.findIndex((r) => r.user_id === params[0]);
      const row = { user_id: params[0], default_lang: params[1], default_currency: params[2], travel_prefs_json: params[3], photo_prefs_json: params[4], profile_visibility: params[5], updated_at: params[params.length - 1] };
      if (idx >= 0) tables.user_preferences[idx] = row;
      else tables.user_preferences.push(row);
      return { success: true, meta: { changes: 1 } };
    }
    if (/^INSERT INTO verifications/i.test(s)) {
      tables.verifications.push({ id: params[0], identifier: params[1], token_hash: params[2], purpose: params[3], expires_at: params[4], created_at: params[5] });
      return { success: true, meta: { changes: 1 } };
    }
    if (/^INSERT INTO sessions/i.test(s)) {
      tables.sessions.push({ id: params[0], user_id: params[1], token_hash: params[2], expires_at: params[3], ip_hash: params[4], user_agent: params[5], created_at: params[6] });
      return { success: true, meta: { changes: 1 } };
    }
    if (/^INSERT INTO trips/i.test(s)) {
      const idx = tables.trips.findIndex((t) => t.id === params[0]);
      const rec = { id: params[0], owner_id: params[1], title: params[2], access_mode: params[3], data_json: params[4], version: 1, updated_at: params[5], created_at: params[6] };
      if (idx >= 0) tables.trips[idx] = rec;
      else tables.trips.push(rec);
      return { success: true, meta: { changes: 1 } };
    }
    if (/^INSERT OR IGNORE INTO trip_members/i.test(s)) {
      if (!tables.trip_members.some((m) => m.trip_id === params[0] && m.user_id === params[1])) {
        tables.trip_members.push({ trip_id: params[0], user_id: params[1], role: params[2], joined_at: params[3] });
      }
      return { success: true, meta: { changes: 1 } };
    }
    if (/^INSERT INTO trip_versions/i.test(s)) {
      tables.trip_versions.push({ id: params[0], trip_id: params[1], version: params[2], author_id: params[3], data_json: params[4], created_at: params[5] });
      return { success: true, meta: { changes: 1 } };
    }
    if (/^UPDATE trips SET title/i.test(s)) {
      const tripId = s.includes('AND version = ?') ? params[params.length - 1] : params[params.length - 1];
      const expectedVer = s.includes('AND version = ?') ? params[params.length - 2] : null;
      const t = tables.trips.find((x) => x.id === tripId);
      if (!t || (expectedVer !== null && Number(t.version) !== Number(expectedVer))) {
        return { success: true, meta: { changes: 0 } };
      }
      t.title = params[0];
      t.access_mode = params[1];
      t.data_json = params[2];
      t.version = params[3];
      t.updated_at = params[4];
      return { success: true, meta: { changes: 1 } };
    }
    if (/^UPDATE users SET password_hash/i.test(s)) {
      const email = params[3];
      const u = tables.users.find((x) => x.email === email);
      if (u) {
        u.password_hash = params[0];
        u.password_salt = params[1];
        u.updated_at = params[2];
      }
      return { success: true, meta: { changes: u ? 1 : 0 } };
    }
    if (/^DELETE FROM sessions WHERE user_id = \?/i.test(s)) {
      const before = tables.sessions.length;
      tables.sessions = tables.sessions.filter((x) => x.user_id !== params[0]);
      return { success: true, meta: { changes: before - tables.sessions.length } };
    }
    if (/^DELETE FROM verifications WHERE id = \?/i.test(s)) {
      tables.verifications = tables.verifications.filter((x) => x.id !== params[0]);
      return { success: true, meta: { changes: 1 } };
    }
    if (/^DELETE FROM verifications WHERE identifier = \? AND purpose = \?/i.test(s)) {
      tables.verifications = tables.verifications.filter((x) => !(x.identifier === params[0] && x.purpose === params[1]));
      return { success: true, meta: { changes: 1 } };
    }
    if (/^DELETE FROM ([a-z_]+) WHERE ([a-z_]+) = \?/i.test(s)) {
      const m = s.match(/^DELETE FROM ([a-z_]+) WHERE ([a-z_]+) = \?/i);
      const tbl = m[1];
      const col = m[2];
      if (tables[tbl]) tables[tbl] = tables[tbl].filter((r) => r[col] !== params[0]);
      return { success: true, meta: { changes: 1 } };
    }
    return { success: true, meta: { changes: 1 } };
  }

  function firstSql(sql, params) {
    const s = sql.trim();
    if (/^SELECT id FROM users WHERE email = \?/i.test(s)) return tables.users.find((u) => u.email === params[0]) || null;
    if (/^SELECT id, email, email_verified, password_hash/i.test(s)) return tables.users.find((u) => u.email === params[0]) || null;
    if (/^SELECT s\.id as session_id/i.test(s)) {
      const ses = tables.sessions.find((x) => x.token_hash === params[0] && x.expires_at > params[1]);
      if (!ses) return null;
      const u = tables.users.find((x) => x.id === ses.user_id);
      return u ? Object.assign({ session_id: ses.id, expires_at: ses.expires_at }, u) : null;
    }
    if (/^SELECT id, identifier, expires_at FROM verifications WHERE token_hash = \? AND purpose = \?/i.test(s)) {
      return tables.verifications.find((v) => v.token_hash === params[0] && v.purpose === params[1]) || null;
    }
    if (/FROM user_preferences WHERE user_id = \?/i.test(s)) return tables.user_preferences.find((p) => p.user_id === params[0]) || null;
    if (/^SELECT \* FROM trips WHERE id = \?/i.test(s)) return tables.trips.find((t) => t.id === params[0]) || null;
    if (/^SELECT owner_id(?:,\s*access_mode)? FROM trips WHERE id = \?/i.test(s)) return tables.trips.find((t) => t.id === params[0]) || null;
    if (/^SELECT role FROM trip_members WHERE trip_id = \? AND user_id = \?/i.test(s)) return tables.trip_members.find((m) => m.trip_id === params[0] && m.user_id === params[1]) || null;
    return null;
  }

  function allSql(sql, params) {
    const s = sql.trim();
    if (/FROM trip_members/i.test(s)) {
      return {
        results: tables.trip_members
          .filter((m) => m.trip_id === params[0])
          .map((m) => {
            const u = tables.users.find((x) => x.id === m.user_id) || {};
            return { user_id: m.user_id, role: m.role, joined_at: m.joined_at, display_name: u.display_name || 'Member', email: u.email || 'secret@example.com' };
          })
      };
    }
    if (/FROM expenses WHERE trip_id = \?/i.test(s)) return { results: tables.expenses.filter((x) => x.trip_id === params[0]) };
    if (/FROM comments WHERE trip_id = \?/i.test(s)) return { results: tables.comments.filter((x) => x.trip_id === params[0]) };
    if (/FROM polls WHERE trip_id = \?/i.test(s)) return { results: tables.polls.filter((x) => x.trip_id === params[0]) };
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

test('V5.1 Security: /api/health 5.1.0, password reset revokes sessions, collab redaction, 409 OCC & SVG block', async () => {
  const worker = (await import('../worker/index.js')).default;
  const db = createFullMockD1();
  const env = { DB: db, ASSETS: { fetch: () => new Response('ok') } };

  const hRes = await worker.fetch(new Request('https://kairos.test/api/health'), env);
  const hJson = await hRes.json();
  assert.equal(hJson.version, '5.1.0');

  // Register Alice & create 2 active sessions
  const regA = await worker.fetch(new Request('https://kairos.test/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://kairos.test' },
    body: JSON.stringify({ email: 'alice@example.com', password: 'StrongPassword123', displayName: 'Alice' })
  }), env);
  assert.equal(regA.status, 201);
  const cookieA1 = regA.headers.get('Set-Cookie').split(';')[0];

  const loginA2 = await worker.fetch(new Request('https://kairos.test/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://kairos.test' },
    body: JSON.stringify({ email: 'alice@example.com', password: 'StrongPassword123' })
  }), env);
  assert.equal(loginA2.status, 200);
  const cookieA2 = loginA2.headers.get('Set-Cookie').split(';')[0];
  assert.equal(db.tables.sessions.length, 2);

  // Register Bob
  const regB = await worker.fetch(new Request('https://kairos.test/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://kairos.test' },
    body: JSON.stringify({ email: 'bob@example.com', password: 'BobPassword456', displayName: 'Bob' })
  }), env);
  const cookieB = regB.headers.get('Set-Cookie').split(';')[0];

  // Alice creates public trip with private email/expenses/comments
  const cTrip = await worker.fetch(new Request('https://kairos.test/api/collab/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieA1, Origin: 'https://kairos.test' },
    body: JSON.stringify({ trip: { id: 'trip_sec_1', name: 'Kyoto Secret', days: [] }, accessMode: 'public' })
  }), env);
  assert.equal(cTrip.status, 201);
  db.tables.expenses.push({ id: 'exp1', trip_id: 'trip_sec_1', title: 'Secret Hotel', amount: 5000 });
  db.tables.comments.push({ id: 'cm1', trip_id: 'trip_sec_1', body: 'Private comment' });

  // Bob cannot hijack trip_sec_1 via POST /api/collab/trips (403)
  const hijackRes = await worker.fetch(new Request('https://kairos.test/api/collab/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieB, Origin: 'https://kairos.test' },
    body: JSON.stringify({ trip: { id: 'trip_sec_1', name: 'Stolen!', days: [] }, accessMode: 'public' })
  }), env);
  assert.equal(hijackRes.status, 403);

  // Anonymous GET /api/collab/trips/trip_sec_1 must redact emails, expenses & comments
  const pubRes = await worker.fetch(new Request('https://kairos.test/api/collab/trips/trip_sec_1'), env);
  assert.equal(pubRes.status, 200);
  const pubJson = await pubRes.json();
  assert.equal(pubJson.expenses.length, 0);
  assert.equal(pubJson.comments.length, 0);
  assert.equal(pubJson.members[0].email, undefined);

  // Alice updates with wrong version -> 409 Conflict
  const stalePut = await worker.fetch(new Request('https://kairos.test/api/collab/trips/trip_sec_1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookieA1, Origin: 'https://kairos.test' },
    body: JSON.stringify({ version: 99, trip: { name: 'Stale', days: [] } })
  }), env);
  assert.equal(stalePut.status, 409);

  // Cross-origin CSRF blocked (403)
  const csrfBad = await worker.fetch(new Request('https://kairos.test/api/collab/trips/trip_sec_1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookieA1, Origin: 'https://evil.attacker' },
    body: JSON.stringify({ version: 1, trip: { name: 'CSRF', days: [] } })
  }), env);
  assert.equal(csrfBad.status, 403);

  // Password reset revokes ALL Alice sessions
  const codeHash = Array.from(new Uint8Array(await crypto.webcrypto.subtle.digest('SHA-256', new TextEncoder().encode('123456')))).map((b) => b.toString(16).padStart(2, '0')).join('');
  db.tables.verifications.push({
    id: 'v_rst_1',
    identifier: 'alice@example.com',
    token_hash: codeHash,
    purpose: 'password_reset',
    expires_at: Date.now() + 600000,
    created_at: Date.now()
  });
  const resetRes = await worker.fetch(new Request('https://kairos.test/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://kairos.test' },
    body: JSON.stringify({ token: '123456', newPassword: 'NewStrongPassword999' })
  }), env);
  assert.equal(resetRes.status, 200);
  const aliceSessionsLeft = db.tables.sessions.filter((s) => s.user_id === db.tables.users[0].id);
  assert.equal(aliceSessionsLeft.length, 0, 'Reset password must revoke all previous sessions');

  const oldSessCheck = await worker.fetch(new Request('https://kairos.test/api/auth/me', { headers: { Cookie: cookieA2 } }), env);
  assert.equal((await oldSessCheck.json()).authenticated, false);

  // /api/img blocks SVG upstream Content-Type (415) deterministically without network dependency
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<svg onload="alert(1)"/>', {
    status: 200,
    headers: { 'Content-Type': 'image/svg+xml' }
  });
  let svgStatus = 0;
  try {
    const svgRes = await worker.fetch(new Request('https://kairos.test/api/img?url=' + encodeURIComponent('https://upload.wikimedia.org/wikipedia/commons/test.png')), env);
    svgStatus = svgRes.status;
  } finally {
    globalThis.fetch = origFetch;
  }
  assert.ok(svgStatus === 415 || svgStatus === 400, `Expected SVG Content-Type rejection (415/400), got ${svgStatus}`);

  // /api/photos rejects unauthenticated GET without valid sync key
  const photoRes = await worker.fetch(new Request('https://kairos.test/api/photos'), { DB: db });
  assert.ok(photoRes.status === 401 || photoRes.status === 400 || photoRes.status === 501);
});

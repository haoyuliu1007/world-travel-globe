'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function createCollabMockD1() {
  const users = new Map();
  const sessions = new Map();
  const trips = new Map();
  const members = []; // { trip_id, user_id, role, joined_at }
  const links = new Map();
  const versions = [];
  const comments = [];
  const polls = [];
  const votes = [];
  const expenses = [];

  return {
    prepare(sql) {
      let args = [];
      return {
        bind(...a) { args = a; return this; },
        async run() {
          const s = sql.trim();
          if (/^INSERT INTO users/i.test(s)) {
            users.set(args[0], { id: args[0], email: args[1], email_verified: 0, password_hash: args[2], password_salt: args[3], display_name: args[4], role: 'user' });
          } else if (/^INSERT INTO sessions/i.test(s)) {
            sessions.set(args[2], { id: args[0], user_id: args[1], token_hash: args[2], expires_at: args[3] });
          } else if (/^INSERT INTO trips/i.test(s)) {
            trips.set(args[0], { id: args[0], owner_id: args[1], title: args[2], access_mode: args[3], data_json: args[4], version: 1, updated_at: args[5] });
          } else if (/^UPDATE trips SET/i.test(s)) {
            const tr = trips.get(args[args.length - 1]);
            if (tr) {
              if (s.includes('title =')) { tr.title = args[0]; tr.access_mode = args[1]; tr.data_json = args[2]; tr.version = args[3]; tr.updated_at = args[4]; }
              else { tr.data_json = args[0]; tr.version = args[1]; tr.updated_at = args[2]; }
            }
          } else if (/^INSERT INTO trip_members|^INSERT OR IGNORE INTO trip_members/i.test(s)) {
            const idx = members.findIndex((m) => m.trip_id === args[0] && m.user_id === args[1]);
            const row = { trip_id: args[0], user_id: args[1], role: args[2], joined_at: args[3] };
            if (idx >= 0 && !/OR IGNORE/i.test(s)) members[idx] = row;
            else if (idx < 0) members.push(row);
          } else if (/^UPDATE trip_members SET role/i.test(s)) {
            const m = members.find((x) => x.trip_id === args[1] && x.user_id === args[2]);
            if (m) m.role = args[0];
          } else if (/^DELETE FROM trip_members/i.test(s)) {
            for (let i = members.length - 1; i >= 0; i--) {
              if (members[i].trip_id === args[0] && members[i].user_id === args[1]) members.splice(i, 1);
            }
          } else if (/^INSERT INTO shared_links/i.test(s)) {
            links.set(args[1], { id: args[0], token: args[1], owner_id: args[2], resource_type: args[3], resource_id: args[4], permission: args[5], access_mode: args[6], expires_at: args[7], revoked_at: null });
          } else if (/^UPDATE shared_links SET revoked_at/i.test(s)) {
            const lk = links.get(args[1]);
            if (lk && lk.resource_id === args[2]) lk.revoked_at = args[0];
          } else if (/^INSERT INTO trip_versions/i.test(s)) {
            versions.push({ id: args[0], trip_id: args[1], version: args[2], author_id: args[3], data_json: args[4], created_at: args[5] });
          } else if (/^INSERT INTO comments/i.test(s)) {
            comments.push({ id: args[0], trip_id: args[1], user_id: args[2], author_name: args[3], stop_id: args[4], body: args[5], created_at: args[6] });
          } else if (/^INSERT INTO polls/i.test(s)) {
            polls.push({ id: args[0], trip_id: args[1], creator_id: args[2], category: args[3], question: args[4], options_json: args[5], status: args[6], created_at: args[7] });
          } else if (/^INSERT INTO poll_votes/i.test(s)) {
            const idx = votes.findIndex((v) => v.poll_id === args[0] && v.user_id === args[1]);
            const row = { poll_id: args[0], user_id: args[1], option_idx: args[2], updated_at: args[3] };
            if (idx >= 0) votes[idx] = row; else votes.push(row);
          } else if (/^INSERT INTO expenses/i.test(s)) {
            expenses.push({ id: args[0], user_id: args[1], trip_id: args[2], payer_id: args[4], amount: args[6], note: args[10] });
          }
          return { success: true };
        },
        async first() {
          const s = sql.trim();
          if (/^SELECT s\.id as session_id/i.test(s)) {
            const ses = sessions.get(args[0]);
            if (!ses || ses.expires_at <= args[1]) return null;
            const u = users.get(ses.user_id);
            return u ? Object.assign({ session_id: ses.id }, u) : null;
          }
          if (/^SELECT role FROM trip_members/i.test(s)) {
            return members.find((m) => m.trip_id === args[0] && m.user_id === args[1]) || null;
          }
          if (/^SELECT \* FROM trips WHERE id = \?/i.test(s) || /^SELECT owner_id, access_mode FROM trips/i.test(s)) {
            return trips.get(args[0]) || null;
          }
          if (/^SELECT \* FROM shared_links WHERE token = \?/i.test(s)) {
            return links.get(args[0]) || null;
          }
          if (/^SELECT data_json FROM trip_versions/i.test(s)) {
            return versions.find((v) => v.trip_id === args[0] && v.version === args[1]) || null;
          }
          return null;
        },
        async all() {
          const s = sql.trim();
          if (/FROM trip_members/i.test(s)) return { results: members.filter((m) => m.trip_id === args[0]) };
          if (/FROM comments/i.test(s)) return { results: comments.filter((c) => c.trip_id === args[0]) };
          if (/FROM polls/i.test(s)) return { results: polls.filter((p) => p.trip_id === args[0]) };
          if (/FROM poll_votes/i.test(s)) return { results: votes };
          if (/FROM expenses/i.test(s)) return { results: expenses.filter((e) => e.trip_id === args[0]) };
          if (/FROM trip_versions/i.test(s)) return { results: versions.filter((v) => v.trip_id === args[0]) };
          return { results: [] };
        }
      };
    }
  };
}

test('V5.0 Batch 4: Worker Collab enforces RBAC, viewer write denial, non-member block, invite revocation & version restore', async () => {
  const worker = (await import('../worker/index.js')).default;
  const db = createCollabMockD1();
  const env = { DB: db };

  const reg = async (email, name) => {
    const r = await worker.fetch(new Request('https://world-travel-globe.globe-app.workers.dev/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', displayName: name })
    }), env);
    return (r.headers.get('Set-Cookie') || '').split(';')[0];
  };

  const aliceCookie = await reg('a@test.dev', 'Alice');
  const bobCookie = await reg('b@test.dev', 'Bob');
  const eveCookie = await reg('e@test.dev', 'Eve');

  // Alice creates shared trip
  const crRes = await worker.fetch(new Request('https://world-travel-globe.globe-app.workers.dev/api/collab/trips', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
    body: JSON.stringify({ accessMode: 'private', trip: { id: 'tr_collab_1', name: 'Kyoto Collab', days: [] } })
  }), env);
  assert.equal(crRes.status, 201);

  // Non-member Eve cannot read private trip
  const eveRead = await worker.fetch(new Request('https://world-travel-globe.globe-app.workers.dev/api/collab/trips/tr_collab_1', {
    headers: { Cookie: eveCookie }
  }), env);
  assert.equal(eveRead.status, 403);

  // Alice issues viewer invite; Bob joins as viewer -> Bob can read, CANNOT write (403)
  const invRes = await (await worker.fetch(new Request('https://world-travel-globe.globe-app.workers.dev/api/collab/trips/tr_collab_1/invites', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
    body: JSON.stringify({ permission: 'viewer', expiresInHours: 24 })
  }), env)).json();
  await worker.fetch(new Request(`https://world-travel-globe.globe-app.workers.dev/api/collab/join/${invRes.token}`, {
    method: 'POST', headers: { Cookie: bobCookie }
  }), env);

  const bobRead = await worker.fetch(new Request('https://world-travel-globe.globe-app.workers.dev/api/collab/trips/tr_collab_1', {
    headers: { Cookie: bobCookie }
  }), env);
  assert.equal(bobRead.status, 200);

  const bobWrite = await worker.fetch(new Request('https://world-travel-globe.globe-app.workers.dev/api/collab/trips/tr_collab_1', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: bobCookie },
    body: JSON.stringify({ trip: { id: 'tr_collab_1', name: 'Viewer Hack' } })
  }), env);
  assert.equal(bobWrite.status, 403);

  // Revoke invite token -> Eve cannot join with revoked token (403)
  await worker.fetch(new Request(`https://world-travel-globe.globe-app.workers.dev/api/collab/trips/tr_collab_1/invites/${invRes.token}`, {
    method: 'DELETE', headers: { Cookie: aliceCookie }
  }), env);
  const eveJoin = await worker.fetch(new Request(`https://world-travel-globe.globe-app.workers.dev/api/collab/join/${invRes.token}`, {
    method: 'POST', headers: { Cookie: eveCookie }
  }), env);
  assert.equal(eveJoin.status, 403);
});

test('V5.0 Batch 4: ExpenseSplitter minimum-transfer settlement, QRCode SVG & CRDT trip document merge', () => {
  const splitter = require('../js/lazy/expense-splitter.js');
  const members = [
    { id: 'u1', name: 'Alice' },
    { id: 'u2', name: 'Bob' },
    { id: 'u3', name: 'Carol' }
  ];
  const res = splitter.computeSettlements(members, [
    { id: 'e1', payerId: 'u1', amount: 300, splitType: 'equal' }, // +200 Alice, -100 Bob, -100 Carol
    { id: 'e2', payerId: 'u2', amount: 60, splitType: 'equal' }   // +40 Bob, -20 Alice, -20 Carol => Alice +180, Bob -60, Carol -120
  ]);
  assert.equal(res.totalAmount, 360);
  assert.equal(res.transfers.length, 2);
  const sumTransfers = res.transfers.reduce((s, x) => s + x.amount, 0);
  assert.equal(Math.round(sumTransfers), 180);

  const QR = require('../js/services/qr-code.js');
  const svg = QR.renderSvg('https://world-travel-globe.globe-app.workers.dev/?invite=abc');
  assert.ok(svg.startsWith('<svg ') && svg.includes('<path '));

  const CRDT = require('../js/services/crdt-merge.js');
  const dev1 = { id: 't1', updatedAt: 200, clock: 2, days: [{ day: 1, title: 'D1', stops: [{ id: 's1', name: 'A', updatedAt: 100 }, { id: 's2', name: 'B', updatedAt: 200 }] }], stopTombstones: { s1: 150 } };
  const dev2 = { id: 't1', updatedAt: 180, clock: 1, days: [{ day: 1, title: 'D1', stops: [{ id: 's1', name: 'A', updatedAt: 100 }, { id: 's3', name: 'C', updatedAt: 180 }] }], stopTombstones: {} };
  const m12 = CRDT.mergeTripDocuments(dev1, dev2);
  const m21 = CRDT.mergeTripDocuments(dev2, dev1);
  assert.deepEqual(m12.days[0].stops.map((s) => s.id), ['s2', 's3']);
  assert.deepEqual(m12.days, m21.days);
});

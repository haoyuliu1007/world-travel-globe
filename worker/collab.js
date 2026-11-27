/* KAIROS V5.0 — Multi-User Collaborative Travel Worker API
 * Enforces strict server-side RBAC (owner / editor / viewer) on every read & write,
 * supports expiring/revocable invite links, comments, polls, expenses, and version snapshots.
 */

import { getSessionUser, randomBytesHex, authJson } from './auth.js';

function json(obj, status) {
  return authJson(obj, status);
}

async function getMemberRole(env, tripId, userId) {
  if (!userId) return null;
  const row = await env.DB.prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, userId)
    .first();
  if (row && row.role) return row.role;
  const trip = await env.DB.prepare('SELECT owner_id, access_mode FROM trips WHERE id = ?')
    .bind(tripId)
    .first();
  if (!trip) return null;
  if (trip.owner_id === userId) return 'owner';
  if (trip.access_mode === 'public') return 'viewer';
  return null;
}

async function handleCollabRequest(request, env) {
  const url = new URL(request.url);
  const p = url.pathname;

  if (!env || !env.DB) {
    return json({ ok: false, configured: false, error: 'D1 database binding (DB) required for cloud collaboration' }, 501);
  }

  const user = await getSessionUser(request, env);

  // Public/Invite read check or authenticated endpoints
  if (p === '/api/collab/trips' && request.method === 'POST') {
    if (!user) return json({ ok: false, error: 'Authentication required' }, 401);
    const body = await request.json().catch(() => null);
    if (!body || !body.trip || typeof body.trip !== 'object') {
      return json({ ok: false, error: 'Missing trip payload' }, 400);
    }
    const trip = body.trip;
    const tripId = String(trip.id || ('trip_' + randomBytesHex(8))).slice(0, 80);
    const title = String(trip.name || 'Shared Trip').slice(0, 120);
    const accessMode = ['private', 'invite', 'public'].includes(body.accessMode) ? body.accessMode : 'invite';
    const now = Date.now();
    const dataJson = JSON.stringify(trip);

    await env.DB.prepare(
      'INSERT INTO trips (id, owner_id, title, access_mode, data_json, version, updated_at, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, access_mode=excluded.access_mode, data_json=excluded.data_json, updated_at=excluded.updated_at'
    )
      .bind(tripId, user.id, title, accessMode, dataJson, now, now)
      .run();
    await env.DB.prepare('INSERT OR IGNORE INTO trip_members (trip_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .bind(tripId, user.id, 'owner', now)
      .run();
    await env.DB.prepare('INSERT INTO trip_versions (id, trip_id, version, author_id, data_json, created_at) VALUES (?, ?, 1, ?, ?, ?)')
      .bind('ver_' + randomBytesHex(8), tripId, user.id, dataJson, now)
      .run();
    return json({ ok: true, tripId, role: 'owner', version: 1 }, 201);
  }

  // POST /api/collab/join/:token
  const joinMatch = p.match(/^\/api\/collab\/join\/([A-Za-z0-9_-]+)$/);
  if (joinMatch && request.method === 'POST') {
    if (!user) return json({ ok: false, error: 'Sign in to join shared trip' }, 401);
    const token = joinMatch[1];
    const link = await env.DB.prepare('SELECT * FROM shared_links WHERE token = ?').bind(token).first();
    if (!link || link.resource_type !== 'trip') return json({ ok: false, error: 'Invite link not found' }, 404);
    if (link.revoked_at) return json({ ok: false, error: 'Invite link has been revoked' }, 403);
    if (Number(link.expires_at) > 0 && Number(link.expires_at) < Date.now()) {
      return json({ ok: false, error: 'Invite link expired' }, 403);
    }
    const role = link.permission === 'editor' ? 'editor' : 'viewer';
    await env.DB.prepare(
      'INSERT INTO trip_members (trip_id, user_id, role, joined_at) VALUES (?, ?, ?, ?) ON CONFLICT(trip_id, user_id) DO UPDATE SET role=excluded.role'
    )
      .bind(link.resource_id, user.id, role, Date.now())
      .run();
    return json({ ok: true, tripId: link.resource_id, role });
  }

  // Trip-scoped routes: /api/collab/trips/:tripId/...
  const tripMatch = p.match(/^\/api\/collab\/trips\/([A-Za-z0-9_-]+)(?:\/(.*))?$/);
  if (!tripMatch) return json({ ok: false, error: 'Collab route not found' }, 404);
  const tripId = tripMatch[1];
  const sub = tripMatch[2] || '';

  const tripRow = await env.DB.prepare('SELECT * FROM trips WHERE id = ?').bind(tripId).first();
  if (!tripRow) return json({ ok: false, error: 'Trip not found' }, 404);

  const role = user ? await getMemberRole(env, tripId, user.id) : (tripRow.access_mode === 'public' ? 'viewer' : null);
  if (!role) return json({ ok: false, error: 'Access denied (not a trip member)' }, 403);

  const canEdit = role === 'owner' || role === 'editor';
  const isOwner = role === 'owner';

  // GET /api/collab/trips/:id
  if (!sub && request.method === 'GET') {
    const [members, comments, polls, votes, expenses] = await Promise.all([
      env.DB.prepare('SELECT m.user_id, m.role, m.joined_at, u.display_name, u.email FROM trip_members m LEFT JOIN users u ON m.user_id = u.id WHERE m.trip_id = ?').bind(tripId).all(),
      env.DB.prepare('SELECT * FROM comments WHERE trip_id = ? ORDER BY created_at ASC').bind(tripId).all(),
      env.DB.prepare('SELECT * FROM polls WHERE trip_id = ? ORDER BY created_at DESC').bind(tripId).all(),
      env.DB.prepare('SELECT pv.* FROM poll_votes pv JOIN polls p ON pv.poll_id = p.id WHERE p.trip_id = ?').bind(tripId).all(),
      env.DB.prepare('SELECT * FROM expenses WHERE trip_id = ? ORDER BY created_at DESC').bind(tripId).all()
    ]);
    return json({
      ok: true,
      role,
      trip: JSON.parse(tripRow.data_json),
      version: tripRow.version,
      accessMode: tripRow.access_mode,
      members: (members && members.results) || [],
      comments: (comments && comments.results) || [],
      polls: (polls && polls.results) || [],
      votes: (votes && votes.results) || [],
      expenses: (expenses && expenses.results) || []
    });
  }

  // PUT /api/collab/trips/:id
  if (!sub && request.method === 'PUT') {
    if (!canEdit) return json({ ok: false, error: 'Viewer permission is read-only' }, 403);
    const body = await request.json().catch(() => null);
    if (!body || !body.trip) return json({ ok: false, error: 'Missing trip body' }, 400);
    const nextVer = Number(tripRow.version || 1) + 1;
    const now = Date.now();
    const dataJson = JSON.stringify(body.trip);
    const accessMode = isOwner && ['private', 'invite', 'public'].includes(body.accessMode) ? body.accessMode : tripRow.access_mode;

    await env.DB.prepare('UPDATE trips SET title = ?, access_mode = ?, data_json = ?, version = ?, updated_at = ? WHERE id = ?')
      .bind(String(body.trip.name || tripRow.title).slice(0, 120), accessMode, dataJson, nextVer, now, tripId)
      .run();
    await env.DB.prepare('INSERT INTO trip_versions (id, trip_id, version, author_id, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('ver_' + randomBytesHex(8), tripId, nextVer, user.id, dataJson, now)
      .run();
    return json({ ok: true, version: nextVer, updatedAt: now });
  }

  // Invites
  if (sub === 'invites' && request.method === 'POST') {
    if (!isOwner) return json({ ok: false, error: 'Only trip owner can issue invites' }, 403);
    const body = await request.json().catch(() => ({}));
    const token = randomBytesHex(16);
    const permission = body.permission === 'editor' ? 'editor' : 'viewer';
    const expiresInHours = Math.min(720, Math.max(1, Number(body.expiresInHours) || 168));
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO shared_links (id, token, owner_id, resource_type, resource_id, permission, access_mode, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind('lnk_' + randomBytesHex(8), token, user.id, 'trip', tripId, permission, 'invite', now + expiresInHours * 3600 * 1000, now)
      .run();
    return json({ ok: true, token, permission, expiresAt: now + expiresInHours * 3600 * 1000 }, 201);
  }

  const invDelMatch = sub.match(/^invites\/([A-Za-z0-9_-]+)$/);
  if (invDelMatch && request.method === 'DELETE') {
    if (!isOwner) return json({ ok: false, error: 'Only owner can revoke invites' }, 403);
    await env.DB.prepare('UPDATE shared_links SET revoked_at = ? WHERE token = ? AND resource_id = ?')
      .bind(Date.now(), invDelMatch[1], tripId)
      .run();
    return json({ ok: true, revoked: true });
  }

  // Members PATCH/DELETE
  const memMatch = sub.match(/^members\/([A-Za-z0-9_-]+)$/);
  if (memMatch) {
    const targetUid = memMatch[1];
    if (request.method === 'PATCH') {
      if (!isOwner) return json({ ok: false, error: 'Only owner can change roles' }, 403);
      const body = await request.json().catch(() => ({}));
      const nextRole = body.role === 'editor' ? 'editor' : 'viewer';
      await env.DB.prepare('UPDATE trip_members SET role = ? WHERE trip_id = ? AND user_id = ?')
        .bind(nextRole, tripId, targetUid)
        .run();
      return json({ ok: true, role: nextRole });
    }
    if (request.method === 'DELETE') {
      if (!isOwner && user.id !== targetUid) {
        return json({ ok: false, error: 'Permission denied' }, 403);
      }
      await env.DB.prepare('DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?')
        .bind(tripId, targetUid)
        .run();
      return json({ ok: true, removed: true });
    }
  }

  // Comments
  if (sub === 'comments' && request.method === 'POST') {
    if (!user) return json({ ok: false, error: 'Authentication required' }, 401);
    const body = await request.json().catch(() => null);
    const text = String((body && body.body) || '').trim().slice(0, 800);
    if (!text) return json({ ok: false, error: 'Comment text required' }, 400);
    const id = 'cmt_' + randomBytesHex(8);
    await env.DB.prepare('INSERT INTO comments (id, trip_id, user_id, author_name, stop_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, tripId, user.id, user.displayName || user.email, String((body && body.stopId) || ''), text, Date.now())
      .run();
    return json({ ok: true, id }, 201);
  }

  // Polls & Votes
  if (sub === 'polls' && request.method === 'POST') {
    if (!canEdit) return json({ ok: false, error: 'Editors only' }, 403);
    const body = await request.json().catch(() => null);
    const question = String((body && body.question) || '').trim().slice(0, 200);
    const options = Array.isArray(body && body.options) ? body.options.map((x) => String(x).slice(0, 100)).filter(Boolean) : [];
    if (!question || options.length < 2) return json({ ok: false, error: 'Question and >=2 options required' }, 400);
    const id = 'pol_' + randomBytesHex(8);
    await env.DB.prepare('INSERT INTO polls (id, trip_id, creator_id, category, question, options_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, tripId, user.id, String((body && body.category) || 'general'), question, JSON.stringify(options), 'open', Date.now())
      .run();
    return json({ ok: true, id }, 201);
  }

  const voteMatch = sub.match(/^polls\/([A-Za-z0-9_-]+)\/vote$/);
  if (voteMatch && request.method === 'POST') {
    if (!user) return json({ ok: false, error: 'Authentication required' }, 401);
    const body = await request.json().catch(() => null);
    const optIdx = Number(body && body.optionIdx);
    if (!Number.isInteger(optIdx) || optIdx < 0) return json({ ok: false, error: 'Invalid option index' }, 400);
    await env.DB.prepare(
      'INSERT INTO poll_votes (poll_id, user_id, option_idx, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(poll_id, user_id) DO UPDATE SET option_idx=excluded.option_idx, updated_at=excluded.updated_at'
    )
      .bind(voteMatch[1], user.id, optIdx, Date.now())
      .run();
    return json({ ok: true });
  }

  // Shared expenses
  if (sub === 'expenses' && request.method === 'POST') {
    if (!canEdit) return json({ ok: false, error: 'Editors only' }, 403);
    const body = await request.json().catch(() => null);
    const amount = Number(body && body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return json({ ok: false, error: 'Positive amount required' }, 400);
    const id = 'exp_' + randomBytesHex(8);
    await env.DB.prepare(
      'INSERT INTO expenses (id, user_id, trip_id, dest_id, payer_id, category, amount, currency, amount_cny, split_json, note, spent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(
        id, user.id, tripId, String((body && body.destId) || ''),
        String((body && body.payerId) || user.id), String((body && body.category) || 'other'),
        amount, String((body && body.currency) || 'CNY'), Number((body && body.amountCny) || amount),
        JSON.stringify((body && body.split) || {}), String((body && body.note) || '').slice(0, 200),
        String((body && body.spentAt) || new Date().toISOString().slice(0, 10)), Date.now()
      )
      .run();
    return json({ ok: true, id }, 201);
  }

  // Version history & restore
  if (sub === 'versions' && request.method === 'GET') {
    const res = await env.DB.prepare('SELECT id, version, author_id, created_at FROM trip_versions WHERE trip_id = ? ORDER BY version DESC LIMIT 20')
      .bind(tripId)
      .all();
    return json({ ok: true, versions: (res && res.results) || [] });
  }

  const restoreMatch = sub.match(/^versions\/(\d+)\/restore$/);
  if (restoreMatch && request.method === 'POST') {
    if (!canEdit) return json({ ok: false, error: 'Editors only' }, 403);
    const targetVer = Number(restoreMatch[1]);
    const verRow = await env.DB.prepare('SELECT data_json FROM trip_versions WHERE trip_id = ? AND version = ?')
      .bind(tripId, targetVer)
      .first();
    if (!verRow) return json({ ok: false, error: 'Version not found' }, 404);
    const nextVer = Number(tripRow.version || 1) + 1;
    await env.DB.prepare('UPDATE trips SET data_json = ?, version = ?, updated_at = ? WHERE id = ?')
      .bind(verRow.data_json, nextVer, Date.now(), tripId)
      .run();
    return json({ ok: true, version: nextVer, trip: JSON.parse(verRow.data_json) });
  }

  return json({ ok: false, error: 'Unsupported collab action' }, 404);
}

export { handleCollabRequest };

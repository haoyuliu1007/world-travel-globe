(function (global) {
  'use strict';

  const LOCAL_COLLAB_KEY = 'wtg_collab_spaces_v1';
  let activeSpace = null;
  let bc = null;
  let mountedCtx = null;

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function L(zh, en) {
    const lang = global.AppI18n && typeof global.AppI18n.getLang === 'function' ? global.AppI18n.getLang() : 'zh-CN';
    if (lang === 'en') return en;
    if (lang === 'zh-TW' && global.AppI18n && typeof global.AppI18n.toTraditional === 'function') {
      return global.AppI18n.toTraditional(zh);
    }
    return zh;
  }

  function loadLocalSpaces() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(LOCAL_COLLAB_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function ensureBroadcastListener() {
    if (typeof global.BroadcastChannel !== 'function' || bc) return;
    bc = new global.BroadcastChannel('kairos_collab');
    bc.onmessage = (ev) => {
      const msg = ev && ev.data;
      if (!msg || msg.type !== 'space_update' || !msg.tripId || !msg.space) return;
      try {
        const all = loadLocalSpaces();
        all[msg.tripId] = msg.space;
        if (global.localStorage) global.localStorage.setItem(LOCAL_COLLAB_KEY, JSON.stringify(all));
      } catch (e) {}
      if (mountedCtx && mountedCtx.trip && mountedCtx.trip.id === msg.tripId) {
        activeSpace = msg.space;
        renderSpace(mountedCtx.hostEl, mountedCtx.trip, mountedCtx.onRefresh, mountedCtx.useCloud, mountedCtx.cloudStatus);
      }
    };
  }

  function saveLocalSpace(space) {
    try {
      const all = loadLocalSpaces();
      all[space.tripId] = space;
      if (global.localStorage) global.localStorage.setItem(LOCAL_COLLAB_KEY, JSON.stringify(all));
      ensureBroadcastListener();
      if (bc) {
        bc.postMessage({ type: 'space_update', tripId: space.tripId, space });
      }
    } catch (e) {}
  }

  async function apiCollab(path, method, body) {
    const res = await fetch(path, {
      method: method || 'GET',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    return Object.assign({ status: res.status }, data);
  }

  function ensureLocalSpace(trip) {
    const all = loadLocalSpaces();
    if (all[trip.id]) return all[trip.id];
    const u = global.AuthService && global.AuthService.getCurrentUser();
    const selfId = (u && u.id) || 'owner_local';
    const selfName = (u && u.displayName) || L('发起人 (我)', 'Owner (Me)');
    const space = {
      tripId: trip.id,
      version: 1,
      accessMode: 'invite',
      inviteToken: `inv_${trip.id.slice(-6)}_${Math.random().toString(36).slice(2, 7)}`,
      inviteRevoked: false,
      members: [
        { id: selfId, name: selfName, role: 'owner', online: true },
        { id: 'peer_1', name: L('同行旅伴 A', 'Companion A'), role: 'editor', online: false }
      ],
      comments: [],
      polls: [],
      expenses: [],
      versions: [{ version: 1, at: Date.now(), trip: JSON.parse(JSON.stringify(trip)) }]
    };
    saveLocalSpace(space);
    return space;
  }

  async function syncFromCloud(trip) {
    let data = await apiCollab(`/api/collab/trips/${encodeURIComponent(trip.id)}`, 'GET');
    if (data.status === 404) {
      const created = await apiCollab('/api/collab/trips', 'POST', { trip, accessMode: 'invite' });
      if (!created.ok) return { ok: false, error: created.error };
      data = await apiCollab(`/api/collab/trips/${encodeURIComponent(trip.id)}`, 'GET');
    }
    if (!data.ok) return { ok: false, error: data.error };
    const cloudSpace = {
      tripId: trip.id,
      version: data.version || 1,
      accessMode: data.accessMode || 'invite',
      inviteToken: (activeSpace && activeSpace.inviteToken) || '',
      members: (data.members || []).map((m) => ({
        id: m.user_id,
        name: m.display_name || m.email || m.user_id,
        role: m.role || 'viewer',
        online: true
      })),
      comments: (data.comments || []).map((c) => ({
        id: c.id,
        author: c.author_name || 'Member',
        body: c.body,
        at: c.created_at
      })),
      polls: (data.polls || []).map((pl) => {
        const opts = JSON.parse(pl.options_json || '[]');
        const plVotes = (data.votes || []).filter((v) => v.poll_id === pl.id);
        return {
          id: pl.id,
          question: pl.question,
          consensus: pl.status === 'closed',
          options: opts.map((lbl, idx) => ({
            label: lbl,
            votes: plVotes.filter((v) => Number(v.option_idx) === idx).length
          }))
        };
      }),
      expenses: (data.expenses || []).map((ex) => ({
        id: ex.id,
        note: ex.note,
        amount: Number(ex.amount) || 0,
        currency: ex.currency || 'CNY',
        payerId: ex.payer_id,
        splitType: 'equal'
      }))
    };
    saveLocalSpace(cloudSpace);
    return { ok: true, space: cloudSpace };
  }

  async function mount(hostEl, trip, onRefresh) {
    if (!hostEl || !trip) return;
    ensureBroadcastListener();
    const u = global.AuthService && global.AuthService.getCurrentUser();
    const caps = global.ApiClient ? await global.ApiClient.detectWorkerCapabilities() : { available: false };
    let useCloud = Boolean(caps && caps.available && caps.features && caps.features.collab && u);
    let cloudStatus = useCloud ? 'connected' : 'local';

    activeSpace = ensureLocalSpace(trip);
    if (useCloud) {
      const synced = await syncFromCloud(trip);
      if (synced.ok && synced.space) {
        activeSpace = synced.space;
      } else {
        useCloud = false;
        cloudStatus = 'fallback';
      }
    }

    mountedCtx = { hostEl, trip, onRefresh, useCloud, cloudStatus };
    return renderSpace(hostEl, trip, onRefresh, useCloud, cloudStatus);
  }

  function renderSpace(hostEl, trip, onRefresh, useCloud, cloudStatus) {
    const u = global.AuthService && global.AuthService.getCurrentUser();
    const baseOrigin = global.location ? global.location.origin + global.location.pathname : 'https://world-travel-globe.globe-app.workers.dev/';
    const shareUrl = activeSpace.inviteToken
      ? `${baseOrigin}?invite=${encodeURIComponent(activeSpace.inviteToken)}&tripId=${encodeURIComponent(trip.id)}`
      : `${baseOrigin}?tripId=${encodeURIComponent(trip.id)}`;
    const qrSvg = global.QRCodeService ? global.QRCodeService.renderSvg(shareUrl, { size: 120 }) : '';

    const splitter = global.ExpenseSplitter
      ? global.ExpenseSplitter.computeSettlements(activeSpace.members, activeSpace.expenses)
      : { totalAmount: 0, balances: [], transfers: [], method: 'exact_optimal' };
    const settleTitle = splitter.method === 'exact_optimal'
      ? L(`多人 AA 分账与精确最少转账 (总计 ¥${splitter.totalAmount.toLocaleString()})`, `Group Expense Split & Optimal Min-Transfers (Total ¥${splitter.totalAmount.toLocaleString()})`)
      : L(`多人 AA 分账与简化结算 (总计 ¥${splitter.totalAmount.toLocaleString()})`, `Group Expense Split & Simplified Settlement (Total ¥${splitter.totalAmount.toLocaleString()})`);

    hostEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <div>
          <h3 style="margin:0;">${esc(L('多人协同空间与 AA 分账', 'Collaborative Trip Space & Expense Split'))}</h3>
          <div style="font-size:11px;color:var(--text-secondary);">
            ${esc(useCloud
              ? L(`已连接 Cloudflare D1 RBAC 云端同步 (v${activeSpace.version || 1})`, `Connected to D1 RBAC Server Sync (v${activeSpace.version || 1})`)
              : (cloudStatus === 'fallback'
                ? L('云端同步不可用，已降级为本地 BroadcastChannel 协同沙盒', 'Cloud sync unavailable; degraded to local BroadcastChannel sandbox')
                : L('本地协同沙盒模式 (支持跨标签页 BroadcastChannel 实时同步；登录后启用 D1 云同步)', 'Local Collab Mode (BroadcastChannel multi-tab sync; sign in on Workers for D1 sync)')))}
          </div>
        </div>
        <span class="source-tag ${useCloud ? 'live' : 'empirical'}">${esc(useCloud ? 'D1 Cloud RBAC' : 'Local Multi-Tab Sync')}</span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">
        <div class="panel-box" style="margin:0;">
          <strong style="font-size:12.5px;">${esc(L('邀请链接、二维码与权限管理', 'Invite Link, QR & Permissions'))}</strong>
          <div style="display:flex;gap:10px;align-items:center;margin:8px 0;">
            <div style="border-radius:8px;overflow:hidden;border:1px solid var(--border-hairline);flex-shrink:0;background:#fff;">${qrSvg}</div>
            <div style="font-size:11px;display:flex;flex-direction:column;gap:6px;min-width:0;flex:1;">
              <select id="col-access-mode" class="sim-input">
                <option value="private" ${activeSpace.accessMode === 'private' ? 'selected' : ''}>${esc(L('仅成员私密', 'Private'))}</option>
                <option value="invite" ${activeSpace.accessMode === 'invite' ? 'selected' : ''}>${esc(L('凭邀请链接加入', 'Invite Only'))}</option>
                <option value="public" ${activeSpace.accessMode === 'public' ? 'selected' : ''}>${esc(L('公开只读浏览', 'Public Read-Only'))}</option>
              </select>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="mini-action-pill" id="col-copy-invite" type="button">${esc(L('生成并复制邀请链接', 'Create & Copy Invite'))}</button>
                <button class="mini-action-pill" id="col-revoke-invite" type="button" style="color:#FB7185;">${esc(L('撤销并轮换链接', 'Revoke & Rotate'))}</button>
              </div>
              <div id="col-invite-msg" style="color:var(--accent-primary);"></div>
            </div>
          </div>
          <div style="font-size:11.5px;font-weight:600;margin-top:8px;">${esc(L(`成员列表 (${activeSpace.members.length})`, `Members (${activeSpace.members.length})`))}</div>
          ${activeSpace.members.map((m, idx) => `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--border-hairline);font-size:11.5px;">
              <span>${m.online ? '🟢' : '⚪'} ${esc(m.name)}</span>
              <div style="display:flex;gap:4px;align-items:center;">
                <select class="sim-input col-role-sel" data-idx="${idx}" style="height:24px;font-size:11px;" ${m.role === 'owner' ? 'disabled' : ''}>
                  <option value="owner" ${m.role === 'owner' ? 'selected' : ''}>Owner</option>
                  <option value="editor" ${m.role === 'editor' ? 'selected' : ''}>Editor</option>
                  <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                </select>
                ${m.role !== 'owner' ? `<button class="icon-btn col-rm-member" data-idx="${idx}" type="button">✕</button>` : ''}
              </div>
            </div>
          `).join('')}
          ${useCloud ? '' : `
          <div style="display:flex;gap:6px;margin-top:8px;">
            <input id="col-add-member-name" class="sim-input" placeholder="${esc(L('添加旅伴昵称…', 'Add companion name…'))}" />
            <button id="col-add-member-btn" class="secondary-btn" type="button" style="white-space:nowrap;flex-shrink:0;">${esc(L('添加', 'Add'))}</button>
          </div>`}
        </div>

        <div class="panel-box" style="margin:0;">
          <strong style="font-size:12.5px;">${esc(L('共同决策投票与讨论', 'Decision Polls & Comments'))}</strong>
          <div style="display:flex;gap:6px;margin-top:6px;">
            <input id="col-poll-q" class="sim-input" placeholder="${esc(L('发起投票：如 出行日期 / 交通方案…', 'Poll question: e.g. Dates / Transport…'))}" />
            <button id="col-poll-add" class="secondary-btn" type="button" style="white-space:nowrap;flex-shrink:0;">${esc(L('发起投票', 'Poll'))}</button>
          </div>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
            ${activeSpace.polls.map((pl, pIdx) => `
              <div style="padding:6px 8px;border-radius:8px;background:var(--bg-hover);font-size:11.5px;">
                <div style="font-weight:600;">${esc(pl.question)} ${pl.consensus ? '✅' : ''}</div>
                <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">
                  ${pl.options.map((op, oIdx) => `<button class="mini-action-pill col-vote-btn" data-pidx="${pIdx}" data-oidx="${oIdx}" type="button">${esc(op.label)} (${op.votes})</button>`).join('')}
                  ${useCloud ? '' : `<button class="mini-action-pill col-consensus-btn" data-pidx="${pIdx}" type="button">${esc(L('标为共识', 'Consensus'))}</button>`}
                </div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:10px;">
            <strong style="font-size:12px;">${esc(L('行程评论', 'Comments'))}</strong>
            <div style="max-height:110px;overflow-y:auto;margin:4px 0;font-size:11.5px;">
              ${activeSpace.comments.length ? activeSpace.comments.map((c) => `<div><strong>${esc(c.author)}:</strong> ${esc(c.body)}</div>`).join('') : `<span style="color:var(--text-muted);">${esc(L('暂无讨论记录', 'No comments yet'))}</span>`}
            </div>
            <div style="display:flex;gap:6px;">
              <input id="col-cmt-input" class="sim-input" placeholder="${esc(L('发表行程建议…', 'Add a comment…'))}" />
              <button id="col-cmt-btn" class="secondary-btn" type="button" style="white-space:nowrap;flex-shrink:0;">${esc(L('发送', 'Post'))}</button>
            </div>
          </div>
        </div>
      </div>

      <div class="panel-box" style="margin:12px 0 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <strong style="font-size:12.5px;">${esc(settleTitle)}</strong>
          <button id="col-exp-csv" class="mini-action-pill" type="button">${esc(L('导出结算单 CSV', 'Export Settlement CSV'))}</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 85px 95px 100px 76px;gap:6px;margin:8px 0;">
          <input id="col-exp-note" class="sim-input" placeholder="${esc(L('费用说明（如 酒店/租车）', 'Expense note'))}" />
          <input id="col-exp-amt" class="sim-input mono-num" type="number" placeholder="RMB" />
          <select id="col-exp-split-mode" class="sim-input">
            <option value="equal">${esc(L('均分 AA', 'Equal'))}</option>
            <option value="custom">${esc(L('自定义比例', 'Custom'))}</option>
          </select>
          <select id="col-exp-payer" class="sim-input">${activeSpace.members.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select>
          <button id="col-exp-add" class="primary-btn" type="button" style="white-space:nowrap;">${esc(L('记一笔', 'Add'))}</button>
        </div>
        <div id="col-custom-split-wrap" class="is-hidden" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:11px;">
          ${activeSpace.members.map((m) => `<label style="display:flex;align-items:center;gap:4px;"><span>${esc(m.name)}:</span><input class="sim-input mono-num col-custom-amt" data-uid="${esc(m.id)}" type="number" style="width:68px;" placeholder="0" /></label>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;font-size:11.5px;">
          <div>
            <strong>${esc(L('净应收 / 净应付', 'Net Balances'))}</strong>
            ${splitter.balances.map((b) => `<div>${esc(b.name)}: <span class="mono-num" style="color:${b.netBalance >= 0 ? '#34D399' : '#FB7185'};">${b.netBalance >= 0 ? '+' : ''}¥${b.netBalance}</span></div>`).join('')}
          </div>
          <div>
            <strong>${esc(L('结算方案（仅计算不涉及支付）', 'Settlement Plan (Calc Only)'))}</strong>
            ${splitter.transfers.length ? splitter.transfers.map((tr) => `<div>${esc(tr.fromName)} → ${esc(tr.toName)}: <strong class="mono-num">¥${tr.amount}</strong></div>`).join('') : `<div style="color:var(--text-muted);">${esc(L('已结清 / 暂无待转账', 'All settled'))}</div>`}
          </div>
        </div>
      </div>
    `;

    const splitSel = hostEl.querySelector('#col-exp-split-mode');
    const customWrap = hostEl.querySelector('#col-custom-split-wrap');
    if (splitSel && customWrap) {
      splitSel.addEventListener('change', () => {
        customWrap.classList.toggle('is-hidden', splitSel.value !== 'custom');
      });
    }

    hostEl.querySelector('#col-copy-invite').addEventListener('click', async () => {
      if (useCloud && !activeSpace.inviteToken) {
        const inv = await apiCollab(`/api/collab/trips/${encodeURIComponent(trip.id)}/invites`, 'POST', { permission: 'editor', expiresInHours: 168 });
        if (inv.ok && inv.token) {
          activeSpace.inviteToken = inv.token;
          saveLocalSpace(activeSpace);
        }
      }
      const nextUrl = `${baseOrigin}?invite=${encodeURIComponent(activeSpace.inviteToken || '')}&tripId=${encodeURIComponent(trip.id)}`;
      if (global.navigator && global.navigator.clipboard) await global.navigator.clipboard.writeText(nextUrl).catch(() => {});
      hostEl.querySelector('#col-invite-msg').textContent = L('邀请链接已复制！', 'Invite copied!');
    });

    hostEl.querySelector('#col-revoke-invite').addEventListener('click', async () => {
      if (useCloud && activeSpace.inviteToken) {
        await apiCollab(`/api/collab/trips/${encodeURIComponent(trip.id)}/invites/${encodeURIComponent(activeSpace.inviteToken)}`, 'DELETE');
        const inv = await apiCollab(`/api/collab/trips/${encodeURIComponent(trip.id)}/invites`, 'POST', { permission: 'editor', expiresInHours: 168 });
        activeSpace.inviteToken = inv.ok && inv.token ? inv.token : '';
      } else {
        activeSpace.inviteToken = `inv_${trip.id.slice(-6)}_${Math.random().toString(36).slice(2, 7)}`;
      }
      saveLocalSpace(activeSpace);
      renderSpace(hostEl, trip, onRefresh, useCloud, cloudStatus);
    });

    hostEl.querySelector('#col-access-mode').addEventListener('change', async (e) => {
      activeSpace.accessMode = e.target.value;
      if (useCloud) {
        const res = await apiCollab(`/api/collab/trips/${encodeURIComponent(trip.id)}`, 'PUT', {
          trip,
          baseVersion: activeSpace.version || 1,
          accessMode: activeSpace.accessMode
        });
        if (res.ok && res.version) activeSpace.version = res.version;
      }
      saveLocalSpace(activeSpace);
    });

    const addMemBtn = hostEl.querySelector('#col-add-member-btn');
    if (addMemBtn) {
      addMemBtn.addEventListener('click', () => {
        const nm = hostEl.querySelector('#col-add-member-name').value.trim();
        if (!nm) return;
        activeSpace.members.push({ id: `mem_${Date.now().toString(36)}`, name: nm, role: 'editor', online: false });
        saveLocalSpace(activeSpace);
        renderSpace(hostEl, trip, onRefresh, useCloud, cloudStatus);
      });
    }

    hostEl.querySelectorAll('.col-role-sel').forEach((sel) => sel.addEventListener('change', async (e) => {
      const m = activeSpace.members[Number(e.target.dataset.idx)];
      if (!m) return;
      m.role = e.target.value;
      if (useCloud) {
        await apiCollab(`/api/collab/trips/${encodeURIComponent(trip.id)}/members/${encodeURIComponent(m.id)}`, 'PATCH', { role: m.role });
      }
      saveLocalSpace(activeSpace);
    }));

    hostEl.querySelectorAll('.col-rm-member').forEach((btn) => btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.idx);
      const m = activeSpace.members[idx];
      if (useCloud && m) {
        await apiCollab(`/api/collab/trips/${encodeURIComponent(trip.id)}/members/${encodeURIComponent(m.id)}`, 'DELETE');
      }
      activeSpace.members.splice(idx, 1);
      saveLocalSpace(activeSpace);
      renderSpace(hostEl, trip, onRefresh, useCloud, cloudStatus);
    }));

    hostEl.querySelector('#col-poll-add').addEventListener('click', async () => {
      const q = hostEl.querySelector('#col-poll-q').value.trim();
      if (!q) return;
      const options = [L('赞成方案 A', 'Option A'), L('备选方案 B', 'Option B')];
      if (useCloud) {
        const res = await apiCollab(`/api/collab/trips/${encodeURIComponent(trip.id)}/polls`, 'POST', { question: q, options });
        if (res.ok) await syncFromCloud(trip).then((s) => { if (s.ok) activeSpace = s.space; });
      } else {
        activeSpace.polls.unshift({ question: q, consensus: false, options: options.map((lbl, i) => ({ label: lbl, votes: i === 0 ? 1 : 0 })) });
        saveLocalSpace(activeSpace);
      }
      renderSpace(hostEl, trip, onRefresh, useCloud, cloudStatus);
    });

    hostEl.querySelectorAll('.col-vote-btn').forEach((btn) => btn.addEventListener('click', async () => {
      const pl = activeSpace.polls[Number(btn.dataset.pidx)];
      const oIdx = Number(btn.dataset.oidx);
      if (useCloud && pl && pl.id) {
        await apiCollab(`/api/collab/trips/${encodeURIComponent(trip.id)}/polls/${encodeURIComponent(pl.id)}/vote`, 'POST', { optionIdx: oIdx });
        await syncFromCloud(trip).then((s) => { if (s.ok) activeSpace = s.space; });
      } else if (pl && pl.options[oIdx]) {
        pl.options[oIdx].votes++;
        saveLocalSpace(activeSpace);
      }
      renderSpace(hostEl, trip, onRefresh, useCloud, cloudStatus);
    }));

    hostEl.querySelectorAll('.col-consensus-btn').forEach((btn) => btn.addEventListener('click', () => {
      const pl = activeSpace.polls[Number(btn.dataset.pidx)];
      if (pl) pl.consensus = !pl.consensus;
      saveLocalSpace(activeSpace);
      renderSpace(hostEl, trip, onRefresh, useCloud, cloudStatus);
    }));

    hostEl.querySelector('#col-cmt-btn').addEventListener('click', async () => {
      const txt = hostEl.querySelector('#col-cmt-input').value.trim();
      if (!txt) return;
      if (useCloud) {
        const res = await apiCollab(`/api/collab/trips/${encodeURIComponent(trip.id)}/comments`, 'POST', { body: txt });
        if (res.ok) await syncFromCloud(trip).then((s) => { if (s.ok) activeSpace = s.space; });
      } else {
        activeSpace.comments.push({ author: (u && u.displayName) || L('我', 'Me'), body: txt, at: Date.now() });
        saveLocalSpace(activeSpace);
      }
      renderSpace(hostEl, trip, onRefresh, useCloud, cloudStatus);
    });

    hostEl.querySelector('#col-exp-add').addEventListener('click', async () => {
      const note = hostEl.querySelector('#col-exp-note').value.trim() || L('共同支出', 'Group Expense');
      const amount = Number(hostEl.querySelector('#col-exp-amt').value) || 0;
      const payerId = hostEl.querySelector('#col-exp-payer').value;
      const splitType = splitSel ? splitSel.value : 'equal';
      if (amount <= 0) return;
      const customShares = {};
      if (splitType === 'custom') {
        hostEl.querySelectorAll('.col-custom-amt').forEach((inp) => {
          customShares[inp.dataset.uid] = Math.max(0, Number(inp.value) || 0);
        });
      }
      if (useCloud) {
        const res = await apiCollab(`/api/collab/trips/${encodeURIComponent(trip.id)}/expenses`, 'POST', {
          note, amount, payerId, currency: trip.currency || 'CNY', split: { splitType, customShares }
        });
        if (res.ok) await syncFromCloud(trip).then((s) => { if (s.ok) activeSpace = s.space; });
      } else {
        activeSpace.expenses.push({ id: `ce_${Date.now().toString(36)}`, note, amount, payerId, splitType, customShares });
        saveLocalSpace(activeSpace);
      }
      renderSpace(hostEl, trip, onRefresh, useCloud, cloudStatus);
    });

    hostEl.querySelector('#col-exp-csv').addEventListener('click', () => {
      if (!global.ExpenseSplitter) return;
      const csv = global.ExpenseSplitter.settlementsToCsv(splitter, trip.currency || 'CNY');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `settlement-${trip.id}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    });
  }

  global.CollabSpace = { mount };
})(window);

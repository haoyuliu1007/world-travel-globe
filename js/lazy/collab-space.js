(function (global) {
  'use strict';

  const LOCAL_COLLAB_KEY = 'wtg_collab_spaces_v1';
  let activeSpace = null;
  let bc = null;

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

  function saveLocalSpace(space) {
    try {
      const all = loadLocalSpaces();
      all[space.tripId] = space;
      if (global.localStorage) global.localStorage.setItem(LOCAL_COLLAB_KEY, JSON.stringify(all));
      if (typeof global.BroadcastChannel === 'function') {
        if (!bc) bc = new global.BroadcastChannel('kairos_collab');
        bc.postMessage({ type: 'space_update', tripId: space.tripId, space });
      }
    } catch (e) {}
  }

  function ensureLocalSpace(trip) {
    const all = loadLocalSpaces();
    if (all[trip.id]) return all[trip.id];
    const u = global.AuthService && global.AuthService.getCurrentUser();
    const selfId = (u && u.id) || 'owner_local';
    const selfName = (u && u.displayName) || L('发起人 (我)', 'Owner (Me)');
    const space = {
      tripId: trip.id,
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

  async function mount(hostEl, trip, onRefresh) {
    if (!hostEl || !trip) return;
    const u = global.AuthService && global.AuthService.getCurrentUser();
    const caps = global.ApiClient ? await global.ApiClient.detectWorkerCapabilities() : { available: false };
    const useCloud = Boolean(caps && caps.available && caps.features && caps.features.collab && u);

    activeSpace = ensureLocalSpace(trip);
    const shareUrl = `${global.location ? global.location.origin + global.location.pathname : 'https://world-travel-globe.globe-app.workers.dev/'}?invite=${encodeURIComponent(activeSpace.inviteToken)}&tripId=${encodeURIComponent(trip.id)}`;
    const qrSvg = global.QRCodeService ? global.QRCodeService.renderSvg(shareUrl, { size: 120 }) : '';

    const splitter = global.ExpenseSplitter
      ? global.ExpenseSplitter.computeSettlements(activeSpace.members, activeSpace.expenses)
      : { totalAmount: 0, balances: [], transfers: [] };

    hostEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <div>
          <h3 style="margin:0;">${esc(L('多人协同空间与 AA 分账', 'Collaborative Trip Space & Expense Split'))}</h3>
          <div style="font-size:11px;color:var(--text-secondary);">
            ${esc(useCloud ? L('已连接 Cloudflare D1 服务端权限校验', 'Connected to D1 RBAC Server Sync') : L('本地协同沙盒模式 (BroadcastChannel 跨标签同步；登录后可开启 D1 跨设备协作)', 'Local Collab Mode (BroadcastChannel sync; sign in on Workers for D1 sync)'))}
          </div>
        </div>
        <span class="source-tag ${useCloud ? 'live' : 'empirical'}">${esc(useCloud ? 'D1 Cloud RBAC' : 'Local CRDT Sync')}</span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">
        <div class="panel-box" style="margin:0;">
          <strong style="font-size:12.5px;">${esc(L('邀请链接、二维码与权限管理', 'Invite Link, QR & Permissions'))}</strong>
          <div style="display:flex;gap:10px;align-items:center;margin:8px 0;">
            <div style="border-radius:8px;overflow:hidden;border:1px solid var(--border-hairline);flex-shrink:0;">${qrSvg}</div>
            <div style="font-size:11px;display:flex;flex-direction:column;gap:6px;min-width:0;flex:1;">
              <select id="col-access-mode" class="sim-input">
                <option value="private" ${activeSpace.accessMode === 'private' ? 'selected' : ''}>${esc(L('仅成员私密', 'Private'))}</option>
                <option value="invite" ${activeSpace.accessMode === 'invite' ? 'selected' : ''}>${esc(L('凭邀请链接加入', 'Invite Only'))}</option>
                <option value="public" ${activeSpace.accessMode === 'public' ? 'selected' : ''}>${esc(L('公开只读浏览', 'Public Read-Only'))}</option>
              </select>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="mini-action-pill" id="col-copy-invite" type="button">${esc(L('复制邀请链接', 'Copy Invite'))}</button>
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
          <div style="display:flex;gap:6px;margin-top:8px;">
            <input id="col-add-member-name" class="sim-input" placeholder="${esc(L('添加旅伴昵称…', 'Add companion name…'))}" />
            <button id="col-add-member-btn" class="secondary-btn" type="button">${esc(L('添加', 'Add'))}</button>
          </div>
        </div>

        <div class="panel-box" style="margin:0;">
          <strong style="font-size:12.5px;">${esc(L('共同决策投票与讨论', 'Decision Polls & Comments'))}</strong>
          <div style="display:flex;gap:6px;margin-top:6px;">
            <input id="col-poll-q" class="sim-input" placeholder="${esc(L('发起投票：如 出行日期 / 交通方案…', 'Poll question: e.g. Dates / Transport…'))}" />
            <button id="col-poll-add" class="secondary-btn" type="button">${esc(L('发起投票', 'Poll'))}</button>
          </div>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
            ${activeSpace.polls.map((pl, pIdx) => `
              <div style="padding:6px 8px;border-radius:8px;background:var(--bg-hover);font-size:11.5px;">
                <div style="font-weight:600;">${esc(pl.question)} ${pl.consensus ? '✅' : ''}</div>
                <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">
                  ${pl.options.map((op, oIdx) => `<button class="mini-action-pill col-vote-btn" data-pidx="${pIdx}" data-oidx="${oIdx}" type="button">${esc(op.label)} (${op.votes})</button>`).join('')}
                  <button class="mini-action-pill col-consensus-btn" data-pidx="${pIdx}" type="button">${esc(L('标为共识', 'Consensus'))}</button>
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
              <button id="col-cmt-btn" class="secondary-btn" type="button">${esc(L('发送', 'Post'))}</button>
            </div>
          </div>
        </div>
      </div>

      <div class="panel-box" style="margin:12px 0 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <strong style="font-size:12.5px;">${esc(L(`多人 AA 分账与最优结算 (总计 ¥${splitter.totalAmount.toLocaleString()})`, `Group Expense Split & Min Transfers (Total ¥${splitter.totalAmount.toLocaleString()})`))}</strong>
          <button id="col-exp-csv" class="mini-action-pill" type="button">${esc(L('导出结算单 CSV', 'Export Settlement CSV'))}</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 90px 110px 80px;gap:6px;margin:8px 0;">
          <input id="col-exp-note" class="sim-input" placeholder="${esc(L('费用说明（如 酒店/租车）', 'Expense note'))}" />
          <input id="col-exp-amt" class="sim-input mono-num" type="number" placeholder="RMB" />
          <select id="col-exp-payer" class="sim-input">${activeSpace.members.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select>
          <button id="col-exp-add" class="primary-btn" type="button">${esc(L('记一笔', 'Add'))}</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;font-size:11.5px;">
          <div>
            <strong>${esc(L('净应收 / 净应付', 'Net Balances'))}</strong>
            ${splitter.balances.map((b) => `<div>${esc(b.name)}: <span class="mono-num" style="color:${b.netBalance >= 0 ? '#34D399' : '#FB7185'};">${b.netBalance >= 0 ? '+' : ''}¥${b.netBalance}</span></div>`).join('')}
          </div>
          <div>
            <strong>${esc(L('最优转账结算方案（仅计算不涉及支付）', 'Minimum-Transfer Settlement (Calc Only)'))}</strong>
            ${splitter.transfers.length ? splitter.transfers.map((tr) => `<div>${esc(tr.fromName)} → ${esc(tr.toName)}: <strong class="mono-num">¥${tr.amount}</strong></div>`).join('') : `<div style="color:var(--text-muted);">${esc(L('已结清 / 暂无待转账', 'All settled'))}</div>`}
          </div>
        </div>
      </div>
    `;

    hostEl.querySelector('#col-copy-invite').addEventListener('click', async () => {
      if (global.navigator && global.navigator.clipboard) await global.navigator.clipboard.writeText(shareUrl).catch(() => {});
      hostEl.querySelector('#col-invite-msg').textContent = L('邀请链接已复制！', 'Invite copied!');
    });
    hostEl.querySelector('#col-revoke-invite').addEventListener('click', () => {
      activeSpace.inviteToken = `inv_${trip.id.slice(-6)}_${Math.random().toString(36).slice(2, 7)}`;
      saveLocalSpace(activeSpace);
      mount(hostEl, trip, onRefresh);
    });
    hostEl.querySelector('#col-access-mode').addEventListener('change', (e) => {
      activeSpace.accessMode = e.target.value;
      saveLocalSpace(activeSpace);
    });
    hostEl.querySelector('#col-add-member-btn').addEventListener('click', () => {
      const nm = hostEl.querySelector('#col-add-member-name').value.trim();
      if (!nm) return;
      activeSpace.members.push({ id: `mem_${Date.now().toString(36)}`, name: nm, role: 'editor', online: false });
      saveLocalSpace(activeSpace);
      mount(hostEl, trip, onRefresh);
    });
    hostEl.querySelectorAll('.col-role-sel').forEach((sel) => sel.addEventListener('change', (e) => {
      activeSpace.members[Number(e.target.dataset.idx)].role = e.target.value;
      saveLocalSpace(activeSpace);
    }));
    hostEl.querySelectorAll('.col-rm-member').forEach((btn) => btn.addEventListener('click', () => {
      activeSpace.members.splice(Number(btn.dataset.idx), 1);
      saveLocalSpace(activeSpace);
      mount(hostEl, trip, onRefresh);
    }));
    hostEl.querySelector('#col-poll-add').addEventListener('click', () => {
      const q = hostEl.querySelector('#col-poll-q').value.trim();
      if (!q) return;
      activeSpace.polls.unshift({ question: q, consensus: false, options: [{ label: L('赞成方案 A', 'Option A'), votes: 1 }, { label: L('备选方案 B', 'Option B'), votes: 0 }] });
      saveLocalSpace(activeSpace);
      mount(hostEl, trip, onRefresh);
    });
    hostEl.querySelectorAll('.col-vote-btn').forEach((btn) => btn.addEventListener('click', () => {
      const pl = activeSpace.polls[Number(btn.dataset.pidx)];
      if (pl && pl.options[Number(btn.dataset.oidx)]) pl.options[Number(btn.dataset.oidx)].votes++;
      saveLocalSpace(activeSpace);
      mount(hostEl, trip, onRefresh);
    }));
    hostEl.querySelectorAll('.col-consensus-btn').forEach((btn) => btn.addEventListener('click', () => {
      const pl = activeSpace.polls[Number(btn.dataset.pidx)];
      if (pl) pl.consensus = !pl.consensus;
      saveLocalSpace(activeSpace);
      mount(hostEl, trip, onRefresh);
    }));
    hostEl.querySelector('#col-cmt-btn').addEventListener('click', () => {
      const txt = hostEl.querySelector('#col-cmt-input').value.trim();
      if (!txt) return;
      activeSpace.comments.push({ author: (u && u.displayName) || L('我', 'Me'), body: txt, at: Date.now() });
      saveLocalSpace(activeSpace);
      mount(hostEl, trip, onRefresh);
    });
    hostEl.querySelector('#col-exp-add').addEventListener('click', () => {
      const note = hostEl.querySelector('#col-exp-note').value.trim() || L('共同支出', 'Group Expense');
      const amount = Number(hostEl.querySelector('#col-exp-amt').value) || 0;
      const payerId = hostEl.querySelector('#col-exp-payer').value;
      if (amount <= 0) return;
      activeSpace.expenses.push({ id: `ce_${Date.now().toString(36)}`, note, amount, payerId, splitType: 'equal' });
      saveLocalSpace(activeSpace);
      mount(hostEl, trip, onRefresh);
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

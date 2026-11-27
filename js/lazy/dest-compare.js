(function (global) {
  'use strict';

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function L(zh, en) {
    const lang = global.AppI18n && typeof global.AppI18n.getLang === 'function' ? global.AppI18n.getLang() : 'zh-CN';
    if (lang === 'en') return en;
    if (lang === 'zh-TW' && global.AppI18n && typeof global.AppI18n.toTraditional === 'function') {
      return global.AppI18n.toTraditional(zh);
    }
    return zh;
  }

  function tx(str) {
    return global.AppI18n && typeof global.AppI18n.tx === 'function' ? global.AppI18n.tx(str) : (str || '');
  }

  let selectedIds = [];
  let hubsCache = null;

  async function loadHubs() {
    if (hubsCache) return hubsCache;
    try {
      const res = await fetch('data/transport/hubs.json');
      if (res.ok) hubsCache = await res.json();
    } catch (e) {
      hubsCache = null;
    }
    return hubsCache;
  }

  function ensureModal() {
    let modal = document.getElementById('dest-compare-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'dest-compare-modal';
      modal.className = 'modal-backdrop is-hidden';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
    }
    return modal;
  }

  function sumBudget(dest, tier) {
    const items = dest && dest.budget && dest.budget[tier] && Array.isArray(dest.budget[tier].items)
      ? dest.budget[tier].items
      : [];
    const sum = items.reduce((acc, it) => acc + (Number(it && it.cost) || 0), 0);
    return sum > 0 ? Math.round(sum) : null;
  }

  async function render() {
    const modal = ensureModal();
    const all = global.TRAVEL_ATLAS && typeof global.TRAVEL_ATLAS.getAll === 'function' ? global.TRAVEL_ATLAS.getAll() : [];
    const byId = new Map(all.map((d) => [d.id, d]));
    const dests = selectedIds.map((id) => byId.get(id)).filter(Boolean).slice(0, 4);

    if (global.PhenologyEngine && typeof global.PhenologyEngine.loadEnrichment === 'function') {
      await global.PhenologyEngine.loadEnrichment();
    }
    const enrMap = global.PhenologyEngine && typeof global.PhenologyEngine.getEnrichmentMap === 'function'
      ? (global.PhenologyEngine.getEnrichmentMap() || {})
      : {};
    const hubs = await loadHubs();
    const hubById = (hubs && hubs.byId) || {};

    const sims = dests[0] && global.GeoIntelligence && typeof global.GeoIntelligence.findSimilarDestinations === 'function'
      ? global.GeoIntelligence.findSimilarDestinations(dests[0].id, all, { limit: 6, enrichmentMap: enrMap })
          .filter((s) => !selectedIds.includes(s.dest.id))
      : [];

    modal.innerHTML = `
      <div class="modal-card modal-card--wide" style="max-width:920px;max-height:88vh;overflow:auto;">
        <div class="modal-head" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <h3>⚖ ${esc(L('KAIROS 目的地横向决策对比', 'KAIROS Side-by-Side Destination Comparison'))}</h3>
          <button class="modal-close-btn" id="dc-close-btn" type="button" aria-label="Close">×</button>
        </div>
        <div class="modal-body" style="padding:12px 16px;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
            <span style="font-size:12px;color:var(--text-secondary);">${esc(L('已选（2–4 个最佳）：', 'Selected (2–4 optimal):'))}</span>
            ${dests.map((d) => `
              <span class="mini-action-pill active" style="gap:6px;">
                ${esc(tx(d.shortName || d.name))}
                ${dests.length > 1 ? `<button type="button" class="dc-rm-btn" data-id="${esc(d.id)}" style="background:none;border:0;color:inherit;cursor:pointer;">×</button>` : ''}
              </span>
            `).join('')}
            ${dests.length < 4 && sims.length ? `
              <select id="dc-add-select" class="sim-input" style="max-width:240px;height:30px;font-size:12px;">
                <option value="">+ ${esc(L('添加相似替代方案…', 'Add similar alternative…'))}</option>
                ${sims.map((s) => `<option value="${esc(s.dest.id)}">${esc(tx(s.dest.shortName || s.dest.name))} (${s.score}% · ${esc((s.reasons || []).slice(0, 1).join(''))})</option>`).join('')}
              </select>
            ` : ''}
          </div>
          ${dests.length ? `
            <div style="overflow-x:auto;">
              <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-hairline);text-align:left;">
                    <th style="padding:8px;min-width:110px;color:var(--text-muted);">${esc(L('评估维度', 'Dimension'))}</th>
                    ${dests.map((d) => `<th style="padding:8px;min-width:170px;"><strong>${esc(tx(d.shortName || d.name))}</strong><div style="font-weight:400;font-size:11px;color:var(--text-muted);">${esc(tx(d.country))}</div></th>`).join('')}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding:7px 8px;color:var(--text-secondary);">${esc(L('最佳月份', 'Best Months'))}</td>
                    ${dests.map((d) => {
                      const peaks = (d.months || []).filter((m) => m.score >= 4).map((m) => `${m.m}${L('月', 'M')}`).join(' · ') || L('全年', 'Year-round');
                      return `<td style="padding:7px 8px;">${esc(peaks)}</td>`;
                    }).join('')}
                  </tr>
                  <tr>
                    <td style="padding:7px 8px;color:var(--text-secondary);">${esc(L('海拔 / 建议天数', 'Elev / Days'))}</td>
                    ${dests.map((d) => `<td style="padding:7px 8px;">${esc(tx(d.elevation || '—'))} · ${esc(tx(d.suggestedDays || '3-5d'))}</td>`).join('')}
                  </tr>
                  <tr>
                    <td style="padding:7px 8px;color:var(--text-secondary);">${esc(L('舒适 / 奢华预算', 'Comfort / Luxury'))}</td>
                    ${dests.map((d) => {
                      const enr = enrMap[d.id];
                      const c = (enr && enr.comfortBudgetRmb) || sumBudget(d, 'comfort');
                      const l = (enr && enr.luxuryBudgetRmb) || sumBudget(d, 'luxury');
                      return `<td style="padding:7px 8px;" class="mono-num">${c ? `¥${c.toLocaleString()}` : '—'} / ${l ? `¥${l.toLocaleString()}` : '—'}</td>`;
                    }).join('')}
                  </tr>
                  <tr>
                    <td style="padding:7px 8px;color:var(--text-secondary);">${esc(L('科学物候等级', 'Phenology Tier'))}</td>
                    ${dests.map((d) => {
                      const ev = global.PhenologyEngine ? global.PhenologyEngine.evaluatePhenology(d, new Date().getMonth() + 1, { enrichment: enrMap[d.id] }) : null;
                      return `<td style="padding:7px 8px;">${ev ? `Tier ${esc(ev.tier)} (${ev.suitability}/100)` : 'Archive'}</td>`;
                    }).join('')}
                  </tr>
                  <tr>
                    <td style="padding:7px 8px;color:var(--text-secondary);">${esc(L('核心枢纽与地面交通', 'Gateway & Rail'))}</td>
                    ${dests.map((d) => {
                      const h = hubById[d.id];
                      const ap = h && h.airports && h.airports[0] ? `${h.airports[0].iata} (${h.airports[0].distKm}km)` : L('地面接驳', 'Surface');
                      const rail = h && h.hsrAvailable ? L('高铁/轨道可用', 'HSR/Rail') : L('公路/支线', 'Road/Regional');
                      return `<td style="padding:7px 8px;">✈ ${esc(ap)}<div style="font-size:11px;color:var(--text-muted);">${esc(rail)}</div></td>`;
                    }).join('')}
                  </tr>
                  <tr>
                    <td style="padding:7px 8px;color:var(--text-secondary);">${esc(L('代表摄影机位', 'Signature Spots'))}</td>
                    ${dests.map((d) => {
                      const sp = (d.spots || []).slice(0, 2).map((s) => tx(s.name)).join(' / ') || '—';
                      return `<td style="padding:7px 8px;">${esc(sp)}</td>`;
                    }).join('')}
                  </tr>
                  <tr>
                    <td style="padding:7px 8px;color:var(--text-secondary);">${esc(L('操作', 'Action'))}</td>
                    ${dests.map((d) => `<td style="padding:7px 8px;"><button class="mini-action-pill dc-focus-btn" data-id="${esc(d.id)}" type="button">${esc(L('查看详情', 'Inspect'))}</button></td>`).join('')}
                  </tr>
                </tbody>
              </table>
            </div>
          ` : `<div style="padding:16px;color:var(--text-muted);">${esc(L('请先选择一个目的地进行对比。', 'Select a destination to compare.'))}</div>`}
        </div>
      </div>
    `;

    modal.classList.remove('is-hidden');
    const closeBtn = modal.querySelector('#dc-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    }, { once: true });
    modal.querySelectorAll('.dc-rm-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedIds = selectedIds.filter((id) => id !== btn.dataset.id);
        render();
      });
    });
    const addSel = modal.querySelector('#dc-add-select');
    if (addSel) {
      addSel.addEventListener('change', () => {
        if (addSel.value && !selectedIds.includes(addSel.value)) {
          selectedIds.push(addSel.value);
          render();
        }
      });
    }
    modal.querySelectorAll('.dc-focus-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        close();
        if (typeof global.selectAtlasDestination === 'function') {
          global.selectAtlasDestination(btn.dataset.id);
        }
      });
    });
  }

  function open(ids) {
    selectedIds = Array.isArray(ids) ? [...new Set(ids)].filter(Boolean).slice(0, 4) : (ids ? [ids] : []);
    if (selectedIds.length === 1 && global.GeoIntelligence && global.TRAVEL_ATLAS) {
      const all = global.TRAVEL_ATLAS.getAll();
      const enrMap = global.PhenologyEngine ? global.PhenologyEngine.getEnrichmentMap() : null;
      const sims = global.GeoIntelligence.findSimilarDestinations(selectedIds[0], all, { limit: 2, enrichmentMap: enrMap });
      sims.forEach((s) => {
        if (selectedIds.length < 3 && !selectedIds.includes(s.dest.id)) selectedIds.push(s.dest.id);
      });
    }
    return render();
  }

  function close() {
    const modal = document.getElementById('dest-compare-modal');
    if (modal) modal.classList.add('is-hidden');
  }

  global.DestCompare = { open, close };
})(typeof window !== 'undefined' ? window : globalThis);

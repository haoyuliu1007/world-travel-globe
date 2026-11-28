(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.HelpCenter = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  const manualCache = {};
  let activeSlug = 'quick-start';
  let searchQuery = '';

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getLang() {
    const l = global.AppI18n && typeof global.AppI18n.getLang === 'function' ? global.AppI18n.getLang() : 'zh-CN';
    return (l === 'zh-TW' || l === 'en') ? l : 'zh-CN';
  }

  function L(zh, en) {
    const lang = getLang();
    if (lang === 'en') return en;
    if (lang === 'zh-TW' && global.AppI18n && typeof global.AppI18n.toTraditional === 'function') {
      return global.AppI18n.toTraditional(zh);
    }
    return zh;
  }

  async function loadManual(lang) {
    const k = (lang === 'zh-TW' || lang === 'en') ? lang : 'zh-CN';
    if (manualCache[k]) return manualCache[k];
    const res = await fetch(`data/docs/manual-${k}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    manualCache[k] = data;
    return data;
  }

  function ensureModal() {
    let modal = document.getElementById('help-center-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'help-center-modal';
      modal.className = 'modal-backdrop is-hidden';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
    }
    return modal;
  }

  async function render() {
    const modal = ensureModal();
    const lang = getLang();
    let doc;
    try {
      doc = await loadManual(lang);
    } catch (e) {
      modal.innerHTML = `<div class="modal-card"><div class="modal-body" style="padding:20px;">${esc(L('帮助手册加载失败，请检查离线缓存。', 'Unable to load user manual.'))} <button class="primary-btn" id="hc-close-btn" type="button">OK</button></div></div>`;
      modal.classList.remove('is-hidden');
      modal.querySelector('#hc-close-btn').addEventListener('click', close);
      return;
    }

    const allChapters = Array.isArray(doc.chapters) ? doc.chapters : [];
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? allChapters.filter((c) => `${c.title} ${c.group} ${c.purpose} ${(c.steps || []).join(' ')} ${c.issues} ${c.limits}`.toLowerCase().includes(q))
      : allChapters;
    const current = filtered.find((c) => c.slug === activeSlug) || filtered[0] || allChapters[0];
    if (current) activeSlug = current.slug;

    const issueTitle = encodeURIComponent(`[KAIROS V5 Feedback] Topic: ${current ? current.slug : 'general'}`);
    const issueBody = encodeURIComponent(`Locale: ${lang}\nViewport: ${typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'n/a'}\nNote: `);
    const ghIssueUrl = `https://github.com/haoyuliu1007/world-travel-globe/issues/new?title=${issueTitle}&body=${issueBody}`;

    modal.innerHTML = `
      <div class="modal-card modal-card--wide" style="max-width:960px;height:84vh;display:flex;flex-direction:column;">
        <div class="modal-head" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <h3 style="margin:0;">📖 ${esc(L(`KAIROS 用户手册与帮助中心 (${allChapters.length} 章)`, `KAIROS User Manual & Help (${allChapters.length} Chapters)`))}</h3>
            <div style="font-size:11px;color:var(--text-muted);">${esc(L('按 ? 随时呼出 · 仅展示当前功能真实能力与科学边界', 'Press ? anytime · Honest capabilities & scientific boundaries'))}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <input id="hc-search-input" class="sim-input" type="search" value="${esc(searchQuery)}" placeholder="${esc(L('搜索章节、快捷键、导出或算法…', 'Search 30 chapters…'))}" style="width:220px;height:32px;" />
            <button id="hc-close-btn" class="modal-close-btn" type="button" aria-label="Close">×</button>
          </div>
        </div>
        <div style="flex:1;min-height:0;display:grid;grid-template-columns:260px 1fr;overflow:hidden;">
          <nav style="border-right:1px solid var(--border-hairline);overflow-y:auto;padding:10px;" aria-label="Manual Chapters">
            ${filtered.map((c) => `
              <button class="tp-suggestion-item hc-toc-btn ${current && c.slug === current.slug ? 'active' : ''}" data-slug="${esc(c.slug)}" type="button" style="width:100%;text-align:left;padding:7px 8px;margin-bottom:3px;border-radius:6px;">
                <div style="font-size:10px;color:var(--text-muted);">${c.id}. ${esc(c.group)}</div>
                <div style="font-size:12px;font-weight:${current && c.slug === current.slug ? '700' : '500'};">${esc(c.title)}</div>
              </button>
            `).join('') || `<div style="padding:12px;font-size:12px;color:var(--text-muted);">${esc(L('未匹配到章节', 'No matching chapters'))}</div>`}
          </nav>
          <article style="overflow-y:auto;padding:18px 22px;font-size:13px;line-height:1.65;">
            ${current ? `
              <div style="font-size:11px;color:var(--accent-primary);font-weight:600;margin-bottom:4px;">${esc(L(`第 ${current.id} 章`, `Chapter ${current.id}`))} · ${esc(current.group)}</div>
              <h2 style="margin:0 0 10px;">${esc(current.title)}</h2>
              <p><strong>${esc(L('核心用途：', 'Purpose: '))}</strong>${esc(current.purpose)}</p>
              <p><strong>${esc(L('入口位置：', 'Where to find: '))}</strong>${esc(current.entry)}</p>
              <div style="margin:10px 0;">
                <strong>${esc(L('操作步骤：', 'Steps:'))}</strong>
                <ol style="margin:6px 0 0 18px;">${(current.steps || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
              </div>
              <div style="padding:10px 12px;border-radius:8px;background:var(--bg-hover);margin:10px 0;">
                <strong>${esc(L('典型示例：', 'Example: '))}</strong>${esc(current.example)}
              </div>
              <p><strong>${esc(L('常见问题与排查：', 'Troubleshooting: '))}</strong>${esc(current.issues)}</p>
              <p style="color:var(--text-secondary);"><strong>${esc(L('真实边界与限制：', 'Known Limitations: '))}</strong>${esc(current.limits)}</p>
              <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border-hairline);display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-size:11px;color:var(--text-muted);">${esc(L('反馈跳转完全可选且不包含账号密码或本地照片。', 'Optional feedback link contains zero private tokens or photos.'))}</span>
                <a class="secondary-btn" href="${esc(ghIssueUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;font-size:11.5px;">GitHub Issue Feedback ↗</a>
              </div>
            ` : ''}
          </article>
        </div>
      </div>
    `;

    modal.classList.remove('is-hidden');
    modal.querySelector('#hc-close-btn').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); }, { once: true });
    const searchEl = modal.querySelector('#hc-search-input');
    if (searchEl) {
      searchEl.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        render();
        setTimeout(() => {
          const el = document.getElementById('hc-search-input');
          if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
        }, 0);
      });
    }
    modal.querySelectorAll('.hc-toc-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeSlug = btn.dataset.slug;
        render();
      });
    });
  }

  function open(slug) {
    if (slug) activeSlug = slug;
    return render();
  }

  function openTopic(slug) {
    return open(slug);
  }

  function close() {
    const modal = document.getElementById('help-center-modal');
    if (modal) {
      modal.classList.add('is-hidden');
      modal.innerHTML = '';
    }
  }

  return { open, openTopic, close };
});

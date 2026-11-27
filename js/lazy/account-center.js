(function (global) {
  'use strict';

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getLang() {
    return global.AppI18n && typeof global.AppI18n.getLang === 'function' ? global.AppI18n.getLang() : 'zh-CN';
  }

  function L(zh, en) {
    const lang = getLang();
    if (lang === 'en') return en;
    if (lang === 'zh-TW' && global.AppI18n && typeof global.AppI18n.toTraditional === 'function') {
      return global.AppI18n.toTraditional(zh);
    }
    return zh;
  }

  function ensureModalEl() {
    let el = document.getElementById('account-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'account-modal';
      el.className = 'diag-modal is-hidden';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', L('KAIROS 个人账号中心', 'KAIROS Account Center'));
      document.body.appendChild(el);
    }
    return el;
  }

  function close() {
    const el = document.getElementById('account-modal');
    if (el) {
      el.classList.add('is-hidden');
      el.innerHTML = '';
    }
  }

  async function open() {
    const modal = ensureModalEl();
    modal.classList.remove('is-hidden');
    modal.onclick = (e) => {
      if (e.target === modal) close();
    };
    const state = global.AuthService
      ? await global.AuthService.refreshSession()
      : { available: false, authenticated: false, user: null, caps: { features: {} } };
    const feats = (state.caps && state.caps.features) || {};
    const stats = global.StorageDB ? await global.StorageDB.getStorageStats() : null;
    const hasLocalArchive = Boolean(stats && (stats.statusCount > 0 || stats.tripCount > 0 || stats.expCount > 0));

    if (!state.available) {
      modal.innerHTML = `
        <div class="epic-dialog" style="max-width:480px;">
          <div class="epic-head">
            <strong>KAIROS · ${esc(L('账号与云端档案', 'Account & Cloud Profile'))}</strong>
            <button id="acc-close-btn" class="icon-btn" type="button">✕</button>
          </div>
          <div class="panel-box" style="margin:0;">
            <p style="font-size:12.5px;color:var(--text-secondary);line-height:1.6;">
              ${esc(L(
                '当前访问环境为纯静态浏览模式（如 GitHub Pages 或未绑定 Cloudflare D1）。您无需注册即可继续完整使用地球仪、行程规划与本地 IndexedDB 旅行档案；如需跨设备账号登录与多人实时协同，请访问 Cloudflare Workers 生产站点并配置 D1。',
                'Running in static/guest mode (GitHub Pages or D1 unbound). All core 3D globe, trip planner, and local IndexedDB archive features remain available without login. Use the Cloudflare Workers origin with D1 bound for cloud accounts.'
              ))}
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
              <a class="primary-btn" href="https://world-travel-globe.globe-app.workers.dev/" target="_blank" rel="noopener" style="text-decoration:none;">
                ${esc(L('前往 Workers 站点', 'Open Workers Site'))} ↗
              </a>
              <button class="secondary-btn" id="acc-guest-continue" type="button">${esc(L('继续游客本地模式', 'Continue as Guest'))}</button>
            </div>
          </div>
        </div>
      `;
      modal.querySelector('#acc-close-btn').addEventListener('click', close);
      modal.querySelector('#acc-guest-continue').addEventListener('click', close);
      return;
    }

    if (!state.authenticated) {
      modal.innerHTML = `
        <div class="epic-dialog" style="max-width:480px;">
          <div class="epic-head">
            <strong>KAIROS · ${esc(L('账号登录与注册', 'Sign In / Create Account'))}</strong>
            <button id="acc-close-btn" class="icon-btn" type="button">✕</button>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:11px;">
            <span class="source-tag live">D1 Auth Ready</span>
            <span class="source-tag ${feats.emailDelivery ? 'live' : 'empirical'}">${esc(feats.emailDelivery ? L('邮箱验证已配置', 'Email Configured') : L('邮件服务未配置', 'Email Unconfigured'))}</span>
            <span class="source-tag ${feats.oauthGoogle ? 'live' : 'empirical'}">${esc(feats.oauthGoogle ? 'Google OAuth Ready' : 'Google OAuth Unconfigured')}</span>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="mini-action-pill active" id="acc-tab-login" type="button">${esc(L('登录', 'Login'))}</button>
            <button class="mini-action-pill" id="acc-tab-reg" type="button">${esc(L('注册新账号', 'Register'))}</button>
          </div>
          <div id="acc-form-body" style="display:flex;flex-direction:column;gap:8px;">
            <label class="form-field"><span>${esc(L('电子邮箱', 'Email'))}</span><input id="acc-email" class="sim-input" type="email" autocomplete="email" placeholder="you@example.com" /></label>
            <label class="form-field is-hidden" id="acc-name-wrap"><span>${esc(L('昵称', 'Display Name'))}</span><input id="acc-name" class="sim-input" type="text" placeholder="KAIROS Traveler" /></label>
            <label class="form-field"><span>${esc(L('密码（至少 8 位）', 'Password (min 8 chars)'))}</span><input id="acc-password" class="sim-input" type="password" autocomplete="current-password" /></label>
            <div id="acc-msg" style="font-size:11.5px;color:var(--accent-primary);min-height:16px;"></div>
            <button id="acc-submit-btn" class="primary-btn" type="button">${esc(L('登录账号', 'Sign In'))}</button>
            ${feats.oauthGoogle ? `<a href="/api/auth/google" class="secondary-btn" style="text-decoration:none;justify-content:center;">${esc(L('使用 Google 账号登录', 'Continue with Google'))}</a>` : ''}
          </div>
        </div>
      `;
      let mode = 'login';
      const tabLogin = modal.querySelector('#acc-tab-login');
      const tabReg = modal.querySelector('#acc-tab-reg');
      const nameWrap = modal.querySelector('#acc-name-wrap');
      const submitBtn = modal.querySelector('#acc-submit-btn');
      const msgEl = modal.querySelector('#acc-msg');
      tabLogin.addEventListener('click', () => {
        mode = 'login';
        tabLogin.classList.add('active');
        tabReg.classList.remove('active');
        nameWrap.classList.add('is-hidden');
        submitBtn.textContent = L('登录账号', 'Sign In');
      });
      tabReg.addEventListener('click', () => {
        mode = 'register';
        tabReg.classList.add('active');
        tabLogin.classList.remove('active');
        nameWrap.classList.remove('is-hidden');
        submitBtn.textContent = L('创建账号', 'Create Account');
      });
      modal.querySelector('#acc-close-btn').addEventListener('click', close);
      submitBtn.addEventListener('click', async () => {
        const email = modal.querySelector('#acc-email').value.trim();
        const password = modal.querySelector('#acc-password').value;
        const displayName = modal.querySelector('#acc-name').value.trim();
        msgEl.textContent = L('正在验证…', 'Authenticating…');
        const res = mode === 'login'
          ? await global.AuthService.login(email, password)
          : await global.AuthService.register(email, password, displayName);
        if (res.ok) {
          if (typeof global.syncAccountBadgeUI === 'function') global.syncAccountBadgeUI();
          open();
        } else {
          msgEl.style.color = '#FB7185';
          msgEl.textContent = res.error || L('认证失败', 'Authentication failed');
        }
      });
      return;
    }

    const u = state.user;
    const prefs = u.preferences || {};
    modal.innerHTML = `
      <div class="epic-dialog" style="max-width:560px;">
        <div class="epic-head">
          <div>
            <strong>${esc(u.displayName || u.email)}</strong>
            <div style="font-size:11px;color:var(--text-secondary);">${esc(u.email)} · ${esc(u.emailVerified ? L('已验证', 'Verified') : L('未验证邮箱', 'Unverified Email'))}</div>
          </div>
          <button id="acc-close-btn" class="icon-btn" type="button">✕</button>
        </div>

        ${hasLocalArchive ? `
          <div class="panel-box" style="margin:0;border-color:rgba(232,163,61,0.45);">
            <div style="font-size:12.5px;font-weight:600;">${esc(L('检测到本地旅行档案数据', 'Local Travel Archive Detected'))}</div>
            <div style="font-size:11.5px;color:var(--text-secondary);margin:4px 0 8px;">
              ${esc(L(`当前设备有 ${stats.statusCount} 条足迹与 ${stats.tripCount} 份行程。迁移前将自动创建本地备份快照，避免覆盖。`, `Found ${stats.statusCount} footprints & ${stats.tripCount} trips locally. Auto-backup runs before cloud import.`))}
            </div>
            <button id="acc-migrate-btn" class="primary-btn" type="button" style="height:30px;font-size:11.5px;">${esc(L('备份并导入至当前账号', 'Backup & Import to Account'))}</button>
          </div>
        ` : ''}

        <div class="panel-box" style="margin:0;display:flex;flex-direction:column;gap:8px;">
          <h3 style="margin:0;">${esc(L('个人资料与偏好', 'Profile & Preferences'))}</h3>
          <div class="form-grid-2">
            <label class="form-field"><span>${esc(L('昵称', 'Display Name'))}</span><input id="acc-prof-name" class="sim-input" value="${esc(u.displayName || '')}" /></label>
            <label class="form-field"><span>${esc(L('默认货币', 'Default Currency'))}</span>
              <select id="acc-prof-cur" class="sim-input">
                ${['CNY', 'USD', 'EUR', 'JPY', 'GBP', 'HKD', 'TWD'].map((c) => `<option value="${c}" ${prefs.defaultCurrency === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </label>
          </div>
          <label class="form-field"><span>${esc(L('个人简介', 'Bio'))}</span><input id="acc-prof-bio" class="sim-input" value="${esc(u.bio || '')}" /></label>
          <div class="form-grid-2">
            <label class="form-field"><span>${esc(L('主页可见性', 'Profile Visibility'))}</span>
              <select id="acc-prof-vis" class="sim-input">
                <option value="private" ${prefs.profileVisibility !== 'public' ? 'selected' : ''}>${esc(L('仅自己可见（默认）', 'Private (Default)'))}</option>
                <option value="public" ${prefs.profileVisibility === 'public' ? 'selected' : ''}>${esc(L('公开主页', 'Public Profile'))}</option>
              </select>
            </label>
            <label class="form-field"><span>${esc(L('默认语言', 'Default Language'))}</span>
              <select id="acc-prof-lang" class="sim-input">
                <option value="zh-CN" ${prefs.defaultLang === 'zh-CN' ? 'selected' : ''}>简体中文</option>
                <option value="zh-TW" ${prefs.defaultLang === 'zh-TW' ? 'selected' : ''}>繁體中文</option>
                <option value="en" ${prefs.defaultLang === 'en' ? 'selected' : ''}>English</option>
              </select>
            </label>
          </div>
          <div id="acc-prof-msg" style="font-size:11.5px;color:var(--accent-primary);min-height:16px;"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button id="acc-save-prof-btn" class="primary-btn" type="button">${esc(L('保存资料', 'Save Profile'))}</button>
            <button id="acc-export-btn" class="secondary-btn" type="button">${esc(L('导出账号数据 (JSON)', 'Export Data'))}</button>
            <button id="acc-logout-btn" class="secondary-btn" type="button">${esc(L('退出登录', 'Sign Out'))}</button>
            <button id="acc-delete-btn" class="secondary-btn" type="button" style="color:#FB7185;border-color:rgba(251,113,133,0.4);">${esc(L('注销账号', 'Delete Account'))}</button>
          </div>
        </div>
      </div>
    `;

    modal.querySelector('#acc-close-btn').addEventListener('click', close);
    const profMsg = modal.querySelector('#acc-prof-msg');
    const migBtn = modal.querySelector('#acc-migrate-btn');
    if (migBtn) {
      migBtn.addEventListener('click', async () => {
        const res = await global.AuthService.migrateLocalArchive();
        profMsg.textContent = res.ok
          ? L(`已成功安全导入 ${res.importedCount || 0} 项本地数据！`, `Safely imported ${res.importedCount || 0} items!`)
          : (res.error || 'Migration failed');
      });
    }
    modal.querySelector('#acc-save-prof-btn').addEventListener('click', async () => {
      const res = await global.AuthService.updateProfile({
        displayName: modal.querySelector('#acc-prof-name').value.trim(),
        bio: modal.querySelector('#acc-prof-bio').value.trim(),
        preferences: {
          defaultCurrency: modal.querySelector('#acc-prof-cur').value,
          defaultLang: modal.querySelector('#acc-prof-lang').value,
          profileVisibility: modal.querySelector('#acc-prof-vis').value
        }
      });
      profMsg.textContent = res.ok ? L('资料已更新。', 'Profile updated.') : (res.error || 'Error');
    });
    modal.querySelector('#acc-export-btn').addEventListener('click', async () => {
      const data = await global.AuthService.exportAccountData();
      if (!data) return;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const uUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = uUrl;
      a.download = `kairos-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(uUrl);
    });
    modal.querySelector('#acc-logout-btn').addEventListener('click', async () => {
      await global.AuthService.logout({ wipeAccountLocal: false });
      if (typeof global.syncAccountBadgeUI === 'function') global.syncAccountBadgeUI();
      close();
    });
    modal.querySelector('#acc-delete-btn').addEventListener('click', async () => {
      if (!global.confirm(L('确认永久注销 KAIROS 账号并清除所有云端个人数据？此操作不可撤销。', 'Permanently delete your KAIROS account and all cloud data? This cannot be undone.'))) {
        return;
      }
      const res = await global.AuthService.deleteAccount();
      if (res.ok) {
        if (typeof global.syncAccountBadgeUI === 'function') global.syncAccountBadgeUI();
        close();
      }
    });
  }

  global.AccountCenter = { open, close };
})(window);

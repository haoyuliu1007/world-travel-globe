(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.ShareCenter = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  const SHARE_TYPES = [
    { id: 'destination', labelZh: '目的地主页', labelEn: 'Destination' },
    { id: 'spot', labelZh: '单个摄影机位', labelEn: 'Photo Spot' },
    { id: 'photo_window', labelZh: '黄金拍摄窗口', labelEn: 'Photo Window' },
    { id: 'phenology', labelZh: '物候预测卡', labelEn: 'Phenology Card' },
    { id: 'trip', labelZh: '多天行程路线', labelEn: 'Trip Itinerary' },
    { id: 'collab_invite', labelZh: '好友协作邀请', labelEn: 'Collab Invite' },
    { id: 'expense_split', labelZh: '团队 AA 结算单', labelEn: 'Expense Split' },
    { id: 'footprint', labelZh: '全球足迹地图', labelEn: 'Travel Footprint' },
    { id: 'annual_report', labelZh: '年度旅行报告', labelEn: 'Annual Report' },
    { id: 'compare', labelZh: '城市对比分析表', labelEn: 'Comparison Sheet' },
    { id: 'timemachine', labelZh: '地球时光机视图', labelEn: 'Time Machine View' },
    { id: 'embed', labelZh: '网页嵌入组件', labelEn: 'Embed Widget' }
  ];

  const POSTER_RATIOS = {
    '1:1': { id: '1:1', w: 1080, h: 1080, label: '1:1 Square (1080×1080)' },
    '3:4': { id: '3:4', w: 1080, h: 1440, label: '3:4 Portrait (1080×1440)' },
    '4:5': { id: '4:5', w: 1080, h: 1350, label: '4:5 Editorial (1080×1350)' },
    '9:16': { id: '9:16', w: 1080, h: 1920, label: '9:16 Story / Poster (1080×1920)' },
    '16:9': { id: '16:9', w: 1920, h: 1080, label: '16:9 Widescreen (1920×1080)' },
    '1200x630': { id: '1200x630', w: 1200, h: 630, label: 'OG Card (1200×630)' }
  };

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

  function buildDeepLink(ctx) {
    const origin = (global.location && global.location.origin && global.location.origin !== 'null')
      ? global.location.origin
      : 'https://world-travel-globe.globe-app.workers.dev';
    const url = new URL(origin + '/');
    const c = ctx || {};
    if (c.dest && c.dest.id) url.searchParams.set('focus', c.dest.id);
    if (c.spotIdx >= 0) url.searchParams.set('spot', String(c.spotIdx));
    if (c.state && Number.isFinite(Number(c.state.cameraAzimuth))) url.searchParams.set('cam', String(Math.round(c.state.cameraAzimuth)));
    if (c.state && c.state.dateStr) url.searchParams.set('date', c.state.dateStr);
    if (c.layers && Array.isArray(c.layers) && c.layers.length) url.searchParams.set('layers', c.layers.join(','));
    const lang = global.AppI18n && typeof global.AppI18n.getLang === 'function' ? global.AppI18n.getLang() : 'zh-CN';
    if (lang) url.searchParams.set('lang', lang);
    return url.toString();
  }

  function buildSocialIntents(title, shareUrl) {
    const tEnc = encodeURIComponent(title || 'KAIROS World Travel Atlas');
    const uEnc = encodeURIComponent(shareUrl);
    return [
      { id: 'x', label: 'X / Twitter', url: `https://twitter.com/intent/tweet?text=${tEnc}&url=${uEnc}` },
      { id: 'reddit', label: 'Reddit', url: `https://www.reddit.com/submit?title=${tEnc}&url=${uEnc}` },
      { id: 'whatsapp', label: 'WhatsApp', url: `https://api.whatsapp.com/send?text=${tEnc}%20${uEnc}` },
      { id: 'telegram', label: 'Telegram', url: `https://t.me/share/url?url=${uEnc}&text=${tEnc}` },
      { id: 'email', label: 'Email', url: `mailto:?subject=${tEnc}&body=${uEnc}` }
    ];
  }

  function ensureModal() {
    let modal = document.getElementById('share-center-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'share-center-modal';
      modal.className = 'modal-backdrop is-hidden';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
    }
    return modal;
  }

  async function render(ctx) {
    const modal = ensureModal();
    const shareType = (ctx && ctx.type) || 'destination';
    const ratioKey = (ctx && ctx.ratio && POSTER_RATIOS[ctx.ratio]) ? ctx.ratio : '3:4';
    const shareUrl = (ctx && ctx.shareUrl) || buildDeepLink(ctx);
    const title = (ctx && ctx.title) || (ctx && ctx.dest ? (ctx.dest.shortName || ctx.dest.name) : 'KAIROS. — World Travel Atlas');
    const caption = (ctx && ctx.caption) || `${title} · KAIROS. World Travel Atlas\n${shareUrl}`;
    const qrSvg = (global.QRCodeService && typeof global.QRCodeService.renderSvg === 'function')
      ? global.QRCodeService.renderSvg(shareUrl, 136)
      : (global.KairosQR && typeof global.KairosQR.toSvg === 'function' ? global.KairosQR.toSvg(shareUrl, 136) : '');

    const intents = buildSocialIntents(title, shareUrl);
    const isSignedIn = Boolean(global.AuthService && typeof global.AuthService.getCurrentUser === 'function' && global.AuthService.getCurrentUser());

    modal.innerHTML = `
      <div class="modal-card modal-card--wide" style="max-width:780px;max-height:90vh;overflow:auto;">
        <div class="modal-head" style="display:flex;justify-content:space-between;align-items:center;">
          <h3>↗ ${esc(L('KAIROS 全球统一分享中心', 'KAIROS Global Share Center'))}</h3>
          <button id="sc-close-btn" class="modal-close-btn" type="button" aria-label="Close">×</button>
        </div>
        <div class="modal-body" style="padding:14px 16px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
            <label class="form-field">
              <span>${esc(L('分享对象类型 (12类)', 'Share Content Type'))}</span>
              <select id="sc-type-sel" class="sim-input">
                ${SHARE_TYPES.map((st) => `<option value="${st.id}" ${shareType === st.id ? 'selected' : ''}>${esc(L(st.labelZh, st.labelEn))}</option>`).join('')}
              </select>
            </label>
            <label class="form-field">
              <span>${esc(L('海报画幅比例 (6种)', 'Poster Aspect Ratio'))}</span>
              <select id="sc-ratio-sel" class="sim-input">
                ${Object.values(POSTER_RATIOS).map((r) => `<option value="${r.id}" ${ratioKey === r.id ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}
              </select>
            </label>
          </div>

          <div style="display:grid;grid-template-columns:1fr 164px;gap:12px;align-items:center;padding:10px;border-radius:10px;background:var(--bg-hover);margin-bottom:12px;">
            <div>
              <div style="font-size:12px;font-weight:600;margin-bottom:4px;">${esc(L('精确深度链接（支持恢复机位/方位角/日期/语言）', 'Deep Link (Restores spot, azimuth, date & locale)'))}</div>
              <input id="sc-url-input" class="sim-input mono-num" type="text" readonly value="${esc(shareUrl)}" style="font-size:11px;margin-bottom:6px;" />
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="primary-btn" id="sc-copy-link-btn" type="button">${esc(L('复制链接', 'Copy Link'))}</button>
                <button class="secondary-btn" id="sc-copy-caption-btn" type="button">${esc(L('复制分享文案', 'Copy Caption'))}</button>
                <button class="secondary-btn" id="sc-native-share-btn" type="button">${esc(L('系统原生分享', 'Web Share'))}</button>
                <button class="secondary-btn" id="sc-gen-poster-btn" type="button">${esc(L('生成该比例海报 PNG', 'Render Poster PNG'))}</button>
              </div>
              <div id="sc-status-msg" style="font-size:11px;color:var(--accent-primary);margin-top:6px;"></div>
            </div>
            <div style="text-align:center;background:#fff;padding:8px;border-radius:8px;">
              ${qrSvg || `<div style="font-size:11px;color:#16283F;">QR Local</div>`}
              <div style="font-size:10px;color:#16283F;margin-top:2px;">100% Local QR</div>
            </div>
          </div>

          <div style="margin-bottom:12px;">
            <div style="font-size:12px;font-weight:600;margin-bottom:6px;">${esc(L('官方 Web Intent 直达转发（无虚假 SDK 假宣称）', 'Official Web Share Intents'))}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${intents.map((it) => `<a class="mini-action-pill" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">${esc(it.label)} ↗</a>`).join('')}
            </div>
            <p style="font-size:11px;color:var(--text-muted);margin-top:6px;">
              ${esc(L('微信 / 朋友圈 / QQ / 小红书 / 抖音 / Instagram 请点击上方「生成该比例海报 PNG」并配合「复制分享文案」与本地二维码分享。', 'For WeChat, Xiaohongshu, Douyin & Instagram, use Poster PNG + Copy Caption + Local QR Code.'))}
              ${isSignedIn ? esc(L(' 已登录账号的协同私密链接可在团队设置中随时撤销失效。', ' Signed-in private share links can be revoked anytime in Collab Space.')) : ''}
            </p>
          </div>
        </div>
      </div>
    `;

    modal.classList.remove('is-hidden');
    modal.querySelector('#sc-close-btn').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); }, { once: true });

    const statusEl = modal.querySelector('#sc-status-msg');
    modal.querySelector('#sc-copy-link-btn').addEventListener('click', async () => {
      if (global.navigator && global.navigator.clipboard) {
        await global.navigator.clipboard.writeText(shareUrl).catch(() => {});
      }
      if (statusEl) statusEl.textContent = L('深度链接已复制。', 'Deep link copied.');
    });
    modal.querySelector('#sc-copy-caption-btn').addEventListener('click', async () => {
      if (global.navigator && global.navigator.clipboard) {
        await global.navigator.clipboard.writeText(caption).catch(() => {});
      }
      if (statusEl) statusEl.textContent = L('配图文案与链接已复制。', 'Caption and link copied.');
    });
    modal.querySelector('#sc-native-share-btn').addEventListener('click', async () => {
      if (global.navigator && typeof global.navigator.share === 'function') {
        try {
          await global.navigator.share({ title, text: caption, url: shareUrl });
          return;
        } catch (e) { /* cancelled or fallback */ }
      }
      if (statusEl) statusEl.textContent = L('当前环境不支持 Web Share API，请使用复制链接或下方 Intent。', 'Web Share API unavailable here; copy link or use web intent below.');
    });
    modal.querySelector('#sc-ratio-sel').addEventListener('change', (e) => {
      render(Object.assign({}, ctx, { ratio: e.target.value, type: modal.querySelector('#sc-type-sel').value }));
    });
    modal.querySelector('#sc-gen-poster-btn').addEventListener('click', async () => {
      const ratioSpec = POSTER_RATIOS[modal.querySelector('#sc-ratio-sel').value] || POSTER_RATIOS['3:4'];
      if (global.PosterShare && typeof global.PosterShare.renderPosterCanvas === 'function') {
        const dest = (ctx && ctx.dest) || (global.TRAVEL_ATLAS && global.TRAVEL_ATLAS.getAll()[0]);
        const poster = await global.PosterShare.renderPosterCanvas({
          width: ratioSpec.w,
          height: ratioSpec.h,
          kicker: `KAIROS. · ${shareType.toUpperCase()}`,
          title,
          subtitle: shareUrl.slice(0, 72),
          coords: dest && dest.coords,
          bullets: [
            { label: 'SHARE MODE', value: shareType },
            { label: 'FORMAT', value: ratioSpec.label }
          ],
          shareUrl,
          filename: `kairos-${shareType}-${ratioSpec.id.replace(':', 'x')}.png`,
          text: caption
        });
        if (poster) {
          close();
          global.PosterShare.openPosterModal(poster);
        }
      }
    });
  }

  function open(ctx) {
    return render(ctx || {});
  }

  function close() {
    const modal = document.getElementById('share-center-modal');
    if (modal) modal.classList.add('is-hidden');
  }

  return {
    SHARE_TYPES,
    POSTER_RATIOS,
    buildDeepLink,
    buildSocialIntents,
    open,
    close
  };
});

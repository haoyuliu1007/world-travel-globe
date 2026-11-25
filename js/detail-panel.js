(function (global) {
  'use strict';

  const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  const CONTINENT_LABELS = {
    asia: '亚洲',
    europe: '欧洲',
    oceania: '大洋洲',
    south_america: '南美洲',
    north_america: '北美洲',
    africa_antarctica: '非洲 / 南极'
  };

  const CAT_META = {
    '自然美景': { icon: '🏔️', cls: 'spot-cat-nature' },
    '现代建筑': { icon: '🏙️', cls: 'spot-cat-modern' },
    '古建遗存': { icon: '🏯', cls: 'spot-cat-ancient' },
    '花海物候': { icon: '🌸', cls: 'spot-cat-bloom' },
    '人文街区': { icon: '🏘️', cls: 'spot-cat-street' }
  };

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatCoords(coords, decimals) {
    if (!Array.isArray(coords) || coords.length < 2) return '';
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    const d = typeof decimals === 'number' ? decimals : 4;
    const latDir = lat >= 0 ? '°N' : '°S';
    const lngDir = lng >= 0 ? '°E' : '°W';
    return `${Math.abs(lat).toFixed(d)}${latDir}, ${Math.abs(lng).toFixed(d)}${lngDir}`;
  }

  function linkifyHtml(str) {
    if (str === null || str === undefined) return '';
    const text = String(str);
    const urlRe = /https?:\/\/[^\s<>'"），。；、）】\]]+/g;
    let out = '';
    let lastIdx = 0;
    let match;
    while ((match = urlRe.exec(text)) !== null) {
      let rawUrl = match[0];
      let trailing = '';
      while (rawUrl.length > 0 && /[.,;:!?\)\]]$/.test(rawUrl)) {
        if (rawUrl.endsWith(')') && (rawUrl.match(/\(/g) || []).length >= (rawUrl.match(/\)/g) || []).length) {
          break;
        }
        trailing = rawUrl.slice(-1) + trailing;
        rawUrl = rawUrl.slice(0, -1);
      }
      out += escapeHtml(text.slice(lastIdx, match.index));
      let host = rawUrl.replace(/^https?:\/\//i, '').split(/[/?#]/)[0].replace(/^www\./i, '');
      if (!host) host = '参考链接';
      const safeUrl = escapeHtml(rawUrl);
      out += `<a class="inline-ref-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="${safeUrl}">🔗 ${escapeHtml(host)}</a>${escapeHtml(trailing)}`;
      lastIdx = match.index + match[0].length;
    }
    out += escapeHtml(text.slice(lastIdx));
    return out;
  }

  function formatRmb(num) {
    return '¥ ' + Number(num || 0).toLocaleString('zh-CN');
  }

  function renderStars(score) {
    const s = Math.max(1, Math.min(5, Number(score) || 3));
    return '★'.repeat(s) + '☆'.repeat(5 - s);
  }

  const DetailPanel = {
    currentDest: null,
    activeTab: 'spots',
    selectedMonth: null,
    highlightedSpotIndex: null,

    open: function (dest, preferredMonth) {
      if (!dest) return;
      this.currentDest = dest;
      this.highlightedSpotIndex = null;

      // Pick default month: user's global month filter, or peak score month
      if (preferredMonth && preferredMonth !== 'all') {
        this.selectedMonth = Number(preferredMonth);
      } else {
        const best = (dest.months || []).reduce(
          (acc, cur) => (cur.score > acc.score ? cur : acc),
          { m: 10, score: 0 }
        );
        this.selectedMonth = best.m || 10;
      }

      this.renderHeader(dest);
      this.renderBody();
      document.getElementById('detail-drawer').classList.remove('hidden');
    },

    close: function () {
      document.getElementById('detail-drawer').classList.add('hidden');
      this.currentDest = null;
      this.highlightedSpotIndex = null;
    },

    setTab: function (tabName) {
      this.activeTab = tabName;
      document.querySelectorAll('#drawer-tabs .tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
      });
      this.renderBody();
    },

    highlightSpot: function (idx) {
      this.highlightedSpotIndex = idx;
      if (this.activeTab !== 'spots') {
        this.setTab('spots');
      } else {
        this.renderBody();
      }
      const card = document.querySelector(`.spot-card[data-spot-idx="${idx}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },

    renderHeader: function (dest) {
      const contLabel = CONTINENT_LABELS[dest.continent] || '全球';
      document.getElementById('drawer-breadcrumb').textContent =
        `${contLabel} › ${dest.country} › ${dest.region} › ${dest.province}`;
      document.getElementById('drawer-title').textContent = dest.name;
      document.getElementById('drawer-subtitle').textContent = dest.subtitle;

      const badgeEl = document.getElementById('drawer-allweather-badge');
      if (dest.allWeather) {
        badgeEl.className = 'type-badge all-weather';
        badgeEl.textContent = '🌟 四季晴雨雪全天候封神';
      } else {
        badgeEl.className = 'type-badge seasonal';
        badgeEl.textContent = '🎯 季节 / 气象限定巅峰';
      }

      const metaStrip = document.getElementById('drawer-meta-strip');
      const badgesHtml = (dest.badges || [])
        .map((b) => `<span class="meta-chip honor">🏆 ${escapeHtml(b)}</span>`)
        .join('');
      metaStrip.innerHTML = `
        <span class="meta-chip">⛰️ 海拔 ${escapeHtml(dest.elevation)}</span>
        <span class="meta-chip">⏱️ 建议 ${escapeHtml(dest.suggestedDays)}</span>
        <span class="meta-chip">🧭 ${formatCoords(dest.coords, 3)}</span>
        ${badgesHtml}
      `;

      document.getElementById('drawer-hero-summary').textContent = dest.heroSummary;
      document.getElementById('tab-spots-count').textContent = (dest.spots || []).length;

      document.querySelectorAll('#drawer-tabs .tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === this.activeTab);
      });
    },

    renderBody: function () {
      const dest = this.currentDest;
      if (!dest) return;
      const body = document.getElementById('detail-body');

      if (this.activeTab === 'spots') {
        body.innerHTML = this.buildSpotsHtml(dest);
        const bindLocateClick = (el) => {
          el.addEventListener('click', () => {
            const idx = Number(el.dataset.idx);
            this.highlightedSpotIndex = idx;
            body.querySelectorAll('.spot-card').forEach((c) => {
              c.classList.toggle('highlighted', Number(c.dataset.spotIdx) === idx);
            });
            body.querySelectorAll('.spot-chip').forEach((c) => {
              c.classList.toggle('active', Number(c.dataset.idx) === idx);
            });
            if (typeof global.flyToSubSpot === 'function') {
              global.flyToSubSpot(idx);
            }
          });
        };
        body.querySelectorAll('.spot-locate-btn').forEach(bindLocateClick);
        body.querySelectorAll('.spot-chip').forEach(bindLocateClick);
      } else if (this.activeTab === 'months') {
        body.innerHTML = this.buildMonthsHtml(dest);
        body.querySelectorAll('.month-cell').forEach((cell) => {
          cell.addEventListener('click', () => {
            this.selectedMonth = Number(cell.dataset.month);
            this.renderBody();
          });
        });
      } else if (this.activeTab === 'weather') {
        body.innerHTML = this.buildWeatherHtml(dest);
      } else if (this.activeTab === 'budget') {
        body.innerHTML = this.buildBudgetHtml(dest);
      } else if (this.activeTab === 'itinerary') {
        body.innerHTML = this.buildItineraryHtml(dest);
      }
      body.scrollTop = 0;
    },

    buildSpotsHtml: function (dest) {
      const spots = dest.spots || [];
      const quickBar = `
        <div class="spot-quickbar">
          ${spots
            .map((sp, i) => {
              const shortLabel = sp.name.split(/[·（(&]/)[0].trim();
              const activeCls = this.highlightedSpotIndex === i ? 'active' : '';
              return `<button class="spot-chip ${activeCls}" data-idx="${i}"><span>${i + 1}</span> ${escapeHtml(shortLabel)}</button>`;
            })
            .join('')}
        </div>
      `;
      const cardsHtml = spots
        .map((sp, i) => {
          const isHL = this.highlightedSpotIndex === i ? 'highlighted' : '';
          const catInfo = CAT_META[sp.category] || { icon: '📍', cls: 'spot-cat-nature' };
          const catBadge = sp.category
            ? `<span class="spot-cat-badge ${catInfo.cls}">${catInfo.icon} ${escapeHtml(sp.category)}</span>`
            : '';
          return `
            <article class="spot-card ${isHL}" data-spot-idx="${i}">
              <div class="spot-head">
                <div class="spot-title-wrap">
                  <span class="spot-index">${i + 1}</span>
                  <div>
                    <h4 class="spot-name">${escapeHtml(sp.name)}</h4>
                    ${catBadge}
                  </div>
                </div>
                <button class="spot-locate-btn" data-idx="${i}">🎯 地球仪定位</button>
              </div>
              <div class="spot-coords-row">
                <span>📍 ${formatCoords(sp.coords, 4)}</span>
                <span>⛰️ 海拔 ${escapeHtml(sp.elevation)}</span>
                <span>🚗 ${linkifyHtml(sp.access)}</span>
              </div>
              <div class="spot-field"><strong>⏰ 黄金时段：</strong>${escapeHtml(sp.bestTime)}</div>
              <div class="spot-field"><strong>👁️ 实景画面：</strong>${escapeHtml(sp.scene)}</div>
              <div class="spot-tips"><strong>💡 机位与避坑实操：</strong>${linkifyHtml(sp.tips)}</div>
            </article>
          `;
        })
        .join('');
      return quickBar + cardsHtml;
    },

    buildMonthsHtml: function (dest) {
      const months = dest.months || [];
      const cells = months
        .map((mo) => {
          const active = mo.m === this.selectedMonth ? 'active' : '';
          const cls = mo.score >= 5 ? 'm-score-5' : mo.score === 4 ? 'm-score-4' : mo.score === 3 ? 'm-score-3' : '';
          return `
            <button class="month-cell ${cls} ${active}" data-month="${mo.m}">
              <div class="month-name">${MONTH_NAMES[mo.m - 1]}</div>
              <div class="month-stars">${renderStars(mo.score)}</div>
              <div class="month-temp">${escapeHtml(mo.temp)}</div>
            </button>
          `;
        })
        .join('');

      const cur = months.find((x) => x.m === this.selectedMonth) || months[0];
      const detailBox = cur
        ? `
          <div class="month-detail-box">
            <div class="month-detail-head">
              <h4>📅 ${MONTH_NAMES[cur.m - 1]}实景档案</h4>
              <span class="weather-rating">推荐度 ${renderStars(cur.score)}</span>
            </div>
            <div class="month-kv-row">
              <div class="month-kv"><span>🌡️ 日均气温区间</span><strong>${escapeHtml(cur.temp)}</strong></div>
              <div class="month-kv"><span>🌦️ 晴雨气候特征</span><strong>${escapeHtml(cur.rain)}</strong></div>
            </div>
            <div class="spot-field"><strong>✨ 当月实景亮点：</strong>${escapeHtml(cur.highlight)}</div>
          </div>
        `
        : '';

      return `<div class="month-grid">${cells}</div>${detailBox}`;
    },

    buildWeatherHtml: function (dest) {
      const w = dest.weather || {};
      const cards = [
        { key: 'sunny', icon: '☀️ 晴天美学', data: w.sunny },
        { key: 'rainy', icon: '🌧️ 雨天 & 雨后初晴', data: w.rainy },
        { key: 'snowy', icon: '❄️ 雪天 & 冬季限定', data: w.snowy },
        { key: 'special', icon: '🌌 极限气象奇观', data: w.special }
      ];
      return cards
        .map((c) => {
          const d = c.data || {};
          const triggerHtml = d.trigger
            ? `<div class="weather-trigger"><strong>⚡ 气象触发条件：</strong>${linkifyHtml(d.trigger)}</div>`
            : '';
          const gearHtml = d.gear
            ? `<div class="weather-gear"><strong>🎒 穿搭与装备建议：</strong>${linkifyHtml(d.gear)}</div>`
            : '';
          return `
            <article class="weather-card">
              <div class="weather-card-head">
                <div class="weather-card-title">${c.icon} · ${escapeHtml(d.title || '')}</div>
                <span class="weather-rating">${escapeHtml(d.rating || '')}</span>
              </div>
              <p class="weather-desc">${linkifyHtml(d.desc || '')}</p>
              ${triggerHtml}
              ${gearHtml}
            </article>
          `;
        })
        .join('');
    },

    buildBudgetHtml: function (dest) {
      const b = dest.budget || {};
      const tiers = [
        { key: 'luxury', cls: 'luxury', icon: '💎 顶奢不差钱档', data: b.luxury },
        { key: 'comfort', cls: 'comfort', icon: '🎒 舒适深度档', data: b.comfort }
      ];
      return tiers
        .map((t) => {
          const td = t.data || { unitLabel: '', items: [], note: '' };
          const total = (td.items || []).reduce((sum, it) => sum + (Number(it.cost) || 0), 0);
          const usdApprox = Math.round(total / 7.2);
          const rows = (td.items || [])
            .map(
              (it) => `
                <div class="budget-row">
                  <div class="budget-row-left">
                    <span class="budget-cat">[${escapeHtml(it.category)}]</span>
                    <span class="budget-detail">${linkifyHtml(it.detail)}</span>
                  </div>
                  <div class="budget-cost">${formatRmb(it.cost)}</div>
                </div>
              `
            )
            .join('');
          return `
            <section class="budget-tier-card ${t.cls}">
              <div class="budget-tier-head">
                <div>
                  <div class="budget-tier-title">${t.icon}</div>
                  <div class="budget-tier-sub">${escapeHtml(td.unitLabel)}</div>
                </div>
                <div class="budget-total">
                  <div class="budget-total-rmb">${formatRmb(total)}</div>
                  <div class="budget-total-usd">约 ${usdApprox.toLocaleString('en-US')} USD</div>
                </div>
              </div>
              <div class="budget-rows">${rows}</div>
              <div class="budget-note">📌 ${linkifyHtml(td.note || '')}</div>
            </section>
          `;
        })
        .join('');
    },

    buildItineraryHtml: function (dest) {
      const steps = dest.itinerary || [];
      return `
        <div class="timeline">
          ${steps
            .map(
              (st) => `
                <div class="timeline-item">
                  <div class="timeline-day">${escapeHtml(st.day)}</div>
                  <h4 class="timeline-title">${escapeHtml(st.title)}</h4>
                  <p class="timeline-plan">${linkifyHtml(st.plan)}</p>
                </div>
              `
            )
            .join('')}
        </div>
      `;
    }
  };

  global.DetailPanel = DetailPanel;
})(window);

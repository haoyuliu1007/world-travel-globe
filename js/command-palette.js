(function (global) {
  'use strict';

  let isOpen = false;
  let selectedIdx = 0;
  let currentEntries = [];
  let onSelectCallback = null;
  let onRelaxCallback = null;
  let searchIndexRef = [];
  let fuseInstance = null;
  let fuseLen = 0;

  function ensureFuse() {
    if (!global.Fuse || !searchIndexRef.length) return null;
    if (fuseInstance && fuseLen === searchIndexRef.length) return fuseInstance;
    const records = searchIndexRef.map((e) => {
      const d = e.dest;
      return {
        entry: e,
        id: d.id || '',
        shortName: `${d.shortName || ''} ${tx(d.shortName || '')}`,
        name: `${d.name || ''} ${tx(d.name || '')}`,
        country: `${d.country || ''} ${tx(d.country || '')}`,
        province: `${d.province || ''} ${tx(d.province || '')}`,
        region: `${d.region || ''} ${tx(d.region || '')}`,
        subtitle: `${d.subtitle || ''} ${tx(d.subtitle || '')}`,
        spotNames: (d.spotNames || (d.spots ? d.spots.map((s) => s.name) : [])).join(' ')
      };
    });
    fuseInstance = new global.Fuse(records, {
      includeScore: true,
      threshold: 0.36,
      ignoreLocation: true,
      minMatchCharLength: 2,
      keys: [
        { name: 'shortName', weight: 2.5 },
        { name: 'name', weight: 2.0 },
        { name: 'country', weight: 1.8 },
        { name: 'id', weight: 1.6 },
        { name: 'province', weight: 1.2 },
        { name: 'spotNames', weight: 1.1 },
        { name: 'subtitle', weight: 0.7 }
      ]
    });
    fuseLen = searchIndexRef.length;
    return fuseInstance;
  }

  function icon(name, size) {
    return global.AppIcons ? global.AppIcons.svg(name, size || 14) : '';
  }

  function t(key, vars) {
    return global.AppI18n ? global.AppI18n.t(key, vars) : key;
  }

  function tx(str) {
    return global.AppI18n ? global.AppI18n.tx(str) : (str || '');
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function highlightMatch(text, query) {
    const safe = escapeHtml(text);
    if (!query) return safe;
    const q = query.trim();
    if (!q) return safe;
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
    return safe.replace(re, '<mark>$1</mark>');
  }

  function ensureHaystack(entry) {
    if (entry.haystack) return entry.haystack;
    const d = entry.dest;
    const spotStr = d.spots
      ? d.spots.map((s) => `${s.name} ${tx(s.name)} ${s.category || ''} ${tx(s.category || '')} ${s.scene || ''}`).join(' ')
      : (d.spotNames || []).map((n) => `${n} ${tx(n)}`).join(' ');
    entry.haystack = [
      d.id || '',
      d.country || '',
      tx(d.country || ''),
      d.name || '',
      tx(d.name || ''),
      d.shortName || '',
      tx(d.shortName || ''),
      d.subtitle || '',
      tx(d.subtitle || ''),
      d.province || '',
      tx(d.province || ''),
      d.region || '',
      tx(d.region || ''),
      d.heroSummary || '',
      tx(d.heroSummary || ''),
      (d.badges || []).map((b) => `${b} ${tx(b)}`).join(' '),
      spotStr
    ]
      .join(' ')
      .toLowerCase();
    return entry.haystack;
  }

  function scoreDestination(entry, qLower, tokens) {
    const d = entry.dest;
    const hay = ensureHaystack(entry);
    const nameL = `${d.name || ''} ${tx(d.name || '')}`.toLowerCase();
    const shortL = `${d.shortName || ''} ${tx(d.shortName || '')}`.toLowerCase();
    const countryL = `${d.country || ''} ${tx(d.country || '')}`.toLowerCase();
    const idL = (d.id || '').toLowerCase();
    const subL = `${d.subtitle || ''} ${tx(d.subtitle || '')}`.toLowerCase();
    const provL = `${d.province || ''} ${tx(d.province || '')}`.toLowerCase();
    const regL = `${d.region || ''} ${tx(d.region || '')}`.toLowerCase();

    // Every token must exist somewhere in haystack
    for (let i = 0; i < tokens.length; i++) {
      if (!hay.includes(tokens[i])) return 0;
    }

    let score = 10;
    if (shortL === qLower || (d.name || '').toLowerCase() === qLower || tx(d.shortName || '').toLowerCase() === qLower || tx(d.name || '').toLowerCase() === qLower || idL === qLower) score += 200;
    else if (shortL.startsWith(qLower) || nameL.startsWith(qLower)) score += 120;
    else if (nameL.includes(qLower) || shortL.includes(qLower)) score += 80;

    if (countryL === qLower) score += 110;
    else if (countryL.includes(qLower)) score += 60;

    if (idL.includes(qLower)) score += 55;
    if (provL.includes(qLower) || regL.includes(qLower)) score += 35;
    if (subL.includes(qLower)) score += 25;
    if (d.priority === 1) score += 8;

    // Find best matching spot if any
    let matchedSpot = null;
    let matchedSpotIdx = -1;
    if (d.spots && d.spots.length) {
      for (let i = 0; i < d.spots.length; i++) {
        const sp = d.spots[i];
        const spName = (sp.name || '').toLowerCase();
        if (spName.includes(qLower)) {
          score += 45;
          matchedSpot = sp;
          matchedSpotIdx = i;
          break;
        }
        if (!matchedSpot && ((sp.scene || '').toLowerCase().includes(qLower) || (sp.category || '').toLowerCase().includes(qLower))) {
          matchedSpot = sp;
          matchedSpotIdx = i;
        }
      }
    } else if (d.spotNames && d.spotNames.length) {
      for (let i = 0; i < d.spotNames.length; i++) {
        if ((d.spotNames[i] || '').toLowerCase().includes(qLower)) {
          score += 45;
          matchedSpot = { name: d.spotNames[i] };
          matchedSpotIdx = i;
          break;
        }
      }
    }

    return { score, matchedSpot, matchedSpotIdx };
  }

  function renderResults(rawQuery) {
    const container = document.getElementById('palette-results');
    const statsEl = document.getElementById('palette-stats');
    if (!container) return;

    const q = (rawQuery || '').trim();
    const qLower = q.toLowerCase();

    if (!qLower) {
      // Show curated flagship recommendations + active filtered top items
      const featured = searchIndexRef
        .filter((e) => e.dest.priority === 1)
        .slice(0, 12);
      currentEntries = featured.map((e) => ({ dest: e.dest, matchedSpot: null, matchedSpotIdx: -1 }));
      selectedIdx = 0;

      if (statsEl) statsEl.textContent = t('paletteAllCount', { n: searchIndexRef.length });

      container.innerHTML = `
        <div class="palette-section-title">${t('paletteAllCount', { n: searchIndexRef.length })}</div>
        ${currentEntries.map((item, i) => buildItemHtml(item, '', i)).join('')}
      `;
      bindResultClicks(container);
      return;
    }

    const tokens = qLower.split(/\s+/).filter(Boolean);
    const hits = [];
    for (let i = 0; i < searchIndexRef.length; i++) {
      const res = scoreDestination(searchIndexRef[i], qLower, tokens);
      if (res && res.score > 0) {
        hits.push({
          dest: searchIndexRef[i].dest,
          score: res.score,
          matchedSpot: res.matchedSpot,
          matchedSpotIdx: res.matchedSpotIdx
        });
      }
    }

    hits.sort((a, b) => b.score - a.score);

    // Fuse.js fuzzy fallback/augmentation for typos & bilingual queries
    if (hits.length < 18) {
      const fuse = ensureFuse();
      if (fuse) {
        const seenIds = new Set(hits.map((h) => h.dest.id));
        const fuzzyHits = fuse.search(q, { limit: 20 });
        for (let i = 0; i < fuzzyHits.length; i++) {
          const item = fuzzyHits[i].item;
          if (!item || !item.entry || seenIds.has(item.entry.dest.id)) continue;
          seenIds.add(item.entry.dest.id);
          hits.push({
            dest: item.entry.dest,
            score: Math.round((1 - (fuzzyHits[i].score || 0.5)) * 40),
            matchedSpot: null,
            matchedSpotIdx: -1
          });
        }
      }
    }

    currentEntries = hits.slice(0, 28);
    selectedIdx = 0;

    if (statsEl) statsEl.textContent = t('paletteHitsCount', { n: hits.length });

    if (!currentEntries.length) {
      container.innerHTML = `
        <div class="palette-empty">
          <div>${t('paletteEmptyTitle')}</div>
          <div class="palette-empty-actions">
            <button class="mini-btn" id="palette-clear-query-btn" type="button">${t('paletteClearQuery')}</button>
            <button class="mini-btn" id="palette-relax-filters-btn" type="button">${t('paletteRelaxFilters')}</button>
          </div>
        </div>
      `;
      const cq = document.getElementById('palette-clear-query-btn');
      if (cq) {
        cq.addEventListener('click', () => {
          const inp = document.getElementById('palette-input');
          if (inp) {
            inp.value = '';
            inp.focus();
            renderResults('');
          }
        });
      }
      const rf = document.getElementById('palette-relax-filters-btn');
      if (rf) {
        rf.addEventListener('click', () => {
          if (typeof onRelaxCallback === 'function') onRelaxCallback();
          close();
        });
      }
      return;
    }

    container.innerHTML = `
      <div class="palette-section-title">${t('paletteHitsCount', { n: hits.length })}</div>
      ${currentEntries.map((item, i) => buildItemHtml(item, q, i)).join('')}
    `;
    bindResultClicks(container);
  }

  function buildItemHtml(item, q, idx) {
    const d = item.dest;
    const spotHint = item.matchedSpot
      ? ` · ${tx(item.matchedSpot.name)}`
      : '';
    const subText = `${tx(d.country)} · ${tx(d.province || d.region)}${spotHint}`;
    const activeCls = idx === selectedIdx ? 'is-selected' : '';
    const dotCls = d.allWeather ? 'dot-gold' : 'dot-ice';
    return `
      <button class="palette-item ${activeCls}" data-idx="${idx}" type="button" role="option" aria-selected="${idx === selectedIdx ? 'true' : 'false'}">
        <span class="dot ${dotCls}"></span>
        <div class="palette-item-main">
          <div class="palette-item-title">${highlightMatch(tx(d.name), q)}</div>
          <div class="palette-item-sub">${highlightMatch(subText, q)}</div>
        </div>
        <div class="palette-item-meta mono-num">
          <span>${t('spotsCountFmt', { n: d.spotCount || (d.spots ? d.spots.length : 0) })}</span>
          ${icon('arrowUpRight', 13)}
        </div>
      </button>
    `;
  }

  function bindResultClicks(container) {
    container.querySelectorAll('.palette-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        chooseIndex(idx);
      });
    });
  }

  function updateSelectedHighlight() {
    const items = document.querySelectorAll('#palette-results .palette-item');
    items.forEach((el, i) => {
      const sel = i === selectedIdx;
      el.classList.toggle('is-selected', sel);
      el.setAttribute('aria-selected', sel ? 'true' : 'false');
      if (sel) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function chooseIndex(idx) {
    const item = currentEntries[idx];
    if (!item) return;
    close();
    if (typeof onSelectCallback === 'function') {
      onSelectCallback(item.dest.id, item.matchedSpotIdx);
    }
  }

  function open(initialQuery) {
    const backdrop = document.getElementById('command-palette');
    const input = document.getElementById('palette-input');
    const clearBtn = document.getElementById('palette-clear-btn');
    if (!backdrop || !input) return;

    isOpen = true;
    backdrop.classList.remove('is-hidden');
    if (typeof initialQuery === 'string') {
      input.value = initialQuery;
    }
    if (clearBtn) clearBtn.classList.toggle('is-hidden', !input.value);
    renderResults(input.value);
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  function close() {
    const backdrop = document.getElementById('command-palette');
    if (!backdrop) return;
    isOpen = false;
    backdrop.classList.add('is-hidden');
  }

  function init(opts) {
    searchIndexRef = opts.searchIndex || [];
    onSelectCallback = opts.onSelect;
    onRelaxCallback = opts.onRelax;

    const backdrop = document.getElementById('command-palette');
    const input = document.getElementById('palette-input');
    const clearBtn = document.getElementById('palette-clear-btn');
    const openBtn = document.getElementById('open-palette-btn');

    if (openBtn) {
      openBtn.addEventListener('click', () => open());
    }

    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
      });
    }

    if (clearBtn && input) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.classList.add('is-hidden');
        renderResults('');
        input.focus();
      });
    }

    if (input) {
      input.addEventListener('input', () => {
        if (clearBtn) clearBtn.classList.toggle('is-hidden', !input.value);
        renderResults(input.value);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (currentEntries.length) {
            selectedIdx = (selectedIdx + 1) % currentEntries.length;
            updateSelectedHighlight();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (currentEntries.length) {
            selectedIdx = (selectedIdx - 1 + currentEntries.length) % currentEntries.length;
            updateSelectedHighlight();
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          chooseIndex(selectedIdx);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          close();
        }
      });
    }
  }

  global.CommandPalette = {
    init,
    open,
    close,
    isOpen: () => isOpen
  };
})(window);

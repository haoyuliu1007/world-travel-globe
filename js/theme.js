(function (global) {
  'use strict';

  const MODE_KEY = 'wtg_appearance_v2';
  const ACCENT_KEY = 'wtg_accent_v1';

  const SWATCHES = [
    { id: 'champagne', name: '香槟金', dark: '#E2C07D', light: '#8C5E12' },
    { id: 'glacier', name: '天青蓝', dark: '#60A5FA', light: '#1D4ED8' },
    { id: 'emerald', name: '翡翠绿', dark: '#34D399', light: '#047857' },
    { id: 'terracotta', name: '珊瑚橘', dark: '#FB923C', light: '#B45309' },
    { id: 'rose', name: '蔷薇粉', dark: '#F472B6', light: '#BE185D' },
    { id: 'iris', name: '暮光紫', dark: '#A78BFA', light: '#6D28D9' },
    { id: 'teal', name: '松石青', dark: '#2DD4BF', light: '#0F766E' },
    { id: 'mono', name: '极简黑白', dark: '#F5F5F7', light: '#18181B' }
  ];

  let mode = 'light'; // 'dark' | 'light'
  let accentHex = '#8C5E12';
  let activeSwatchId = 'champagne';
  let onChangeListeners = [];

  function hexToRgb(hex) {
    const clean = String(hex || '').replace('#', '').trim();
    if (clean.length === 3) {
      return [
        parseInt(clean[0] + clean[0], 16),
        parseInt(clean[1] + clean[1], 16),
        parseInt(clean[2] + clean[2], 16)
      ];
    }
    if (clean.length !== 6) return [226, 192, 125];
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16)
    ];
  }

  function contrastForeground(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 0.179 ? '#09090B' : '#FFFFFF';
  }

  function applyTokens() {
    const root = document.documentElement;
    if (!root) return;
    root.setAttribute('data-theme', mode);

    const [r, g, b] = hexToRgb(accentHex);
    const fg = contrastForeground(accentHex);

    root.style.setProperty('--accent-gold', accentHex);
    root.style.setProperty('--accent-primary', accentHex);
    root.style.setProperty('--accent-primary-soft', `rgba(${r}, ${g}, ${b}, ${mode === 'light' ? 0.14 : 0.16})`);
    root.style.setProperty('--accent-primary-border', `rgba(${r}, ${g}, ${b}, ${mode === 'light' ? 0.36 : 0.44})`);
    root.style.setProperty('--accent-primary-fg', fg);

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', mode === 'light' ? '#F2F4F8' : '#09090B');

    const dot = document.getElementById('appearance-accent-dot');
    if (dot) dot.style.background = accentHex;

    const iconWrap = document.getElementById('appearance-mode-icon');
    if (iconWrap && global.AppIcons) {
      iconWrap.innerHTML = global.AppIcons.svg(mode === 'light' ? 'sun' : 'moon', 15);
    }

    const customInput = document.getElementById('custom-accent-input');
    const hexLabel = document.getElementById('custom-accent-hex');
    if (customInput) customInput.value = accentHex;
    if (hexLabel) hexLabel.textContent = accentHex.toUpperCase();

    // Update active states in studio popover
    const seg = document.getElementById('theme-mode-switch');
    if (seg) seg.setAttribute('data-active', mode);
    document.querySelectorAll('#theme-mode-switch [data-mode-val]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.modeVal === mode);
    });
    document.querySelectorAll('#accent-swatch-grid .swatch-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.swatch === activeSwatchId);
    });
  }

  function notify() {
    onChangeListeners.forEach((fn) => {
      try {
        fn({ mode, accentHex });
      } catch (e) {
        // ignore listener errors
      }
    });
  }

  function setMode(nextMode) {
    if (nextMode !== 'dark' && nextMode !== 'light') return;
    mode = nextMode;
    // If user is on a named swatch, smoothly pick that swatch's tuned day/night shade
    const sw = SWATCHES.find((s) => s.id === activeSwatchId);
    if (sw) {
      accentHex = mode === 'light' ? sw.light : sw.dark;
    }
    try {
      global.localStorage.setItem(MODE_KEY, mode);
      global.localStorage.setItem(ACCENT_KEY, JSON.stringify({ id: activeSwatchId, hex: accentHex }));
    } catch (e) {
      // ignore
    }
    applyTokens();
    notify();
  }

  function setSwatch(swatchId) {
    const sw = SWATCHES.find((s) => s.id === swatchId);
    if (!sw) return;
    activeSwatchId = swatchId;
    accentHex = mode === 'light' ? sw.light : sw.dark;
    try {
      global.localStorage.setItem(ACCENT_KEY, JSON.stringify({ id: activeSwatchId, hex: accentHex }));
    } catch (e) {
      // ignore
    }
    applyTokens();
    notify();
  }

  function setCustomColor(hex) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    activeSwatchId = 'custom';
    accentHex = hex;
    try {
      global.localStorage.setItem(ACCENT_KEY, JSON.stringify({ id: 'custom', hex }));
    } catch (e) {
      // ignore
    }
    applyTokens();
    notify();
  }

  function loadInitial() {
    try {
      const m = global.localStorage.getItem(MODE_KEY);
      if (m === 'light' || m === 'dark') mode = m;
      const rawA = global.localStorage.getItem(ACCENT_KEY);
      if (rawA) {
        const parsed = JSON.parse(rawA);
        if (parsed && parsed.hex) {
          activeSwatchId = parsed.id || 'custom';
          const sw = SWATCHES.find((s) => s.id === activeSwatchId);
          accentHex = sw ? (mode === 'light' ? sw.light : sw.dark) : parsed.hex;
        }
      }
    } catch (e) {
      // ignore
    }
    applyTokens();
  }

  function renderStudioUI() {
    const grid = document.getElementById('accent-swatch-grid');
    if (grid) {
      grid.innerHTML = SWATCHES.map((sw) => {
        const col = mode === 'light' ? sw.light : sw.dark;
        const active = sw.id === activeSwatchId ? 'active' : '';
        return `<button class="swatch-btn ${active}" data-swatch="${sw.id}" type="button" title="${sw.name}" aria-label="${sw.name}"><span class="swatch-fill" style="background:${col}"></span></button>`;
      }).join('');

      grid.querySelectorAll('.swatch-btn').forEach((btn) => {
        btn.addEventListener('click', () => setSwatch(btn.dataset.swatch));
      });
    }
    applyTokens();
  }

  function init(onChange) {
    if (typeof onChange === 'function') onChangeListeners.push(onChange);
    loadInitial();
    renderStudioUI();

    document.querySelectorAll('#theme-mode-switch [data-mode-val]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setMode(btn.dataset.modeVal);
        renderStudioUI();
      });
    });

    const customInput = document.getElementById('custom-accent-input');
    if (customInput) {
      customInput.addEventListener('input', (e) => {
        setCustomColor(e.target.value);
      });
    }
  }

  global.AppTheme = {
    SWATCHES,
    init,
    setMode,
    setSwatch,
    setCustomColor,
    getState: () => ({ mode, accentHex, activeSwatchId })
  };
})(window);

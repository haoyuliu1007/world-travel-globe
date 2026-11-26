(function (global) {
  'use strict';

  const pending = new Map();

  function loadScript(src) {
    if (pending.has(src)) return pending.get(src);
    const p = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-lazy-src="${src}"]`);
      if (existing && existing.dataset.loaded === '1') {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.setAttribute('data-lazy-src', src);
      s.onload = () => {
        s.dataset.loaded = '1';
        resolve();
      };
      s.onerror = () => {
        pending.delete(src);
        reject(new Error(`Failed to load script: ${src}`));
      };
      document.head.appendChild(s);
    });
    pending.set(src, p);
    return p;
  }

  function loadStyle(href) {
    const key = `css:${href}`;
    if (pending.has(key)) return pending.get(key);
    const p = new Promise((resolve, reject) => {
      if (document.querySelector(`link[data-lazy-href="${href}"]`)) {
        resolve();
        return;
      }
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.setAttribute('data-lazy-href', href);
      l.onload = () => resolve();
      l.onerror = () => {
        pending.delete(key);
        reject(new Error(`Failed to load stylesheet: ${href}`));
      };
      document.head.appendChild(l);
    });
    pending.set(key, p);
    return p;
  }

  function ensureECharts() {
    if (global.echarts) return Promise.resolve(global.echarts);
    return loadScript('vendor/echarts.min.js').then(() => {
      if (!global.echarts) throw new Error('ECharts global missing');
      return global.echarts;
    });
  }

  function ensureMapillary() {
    if (global.mapillary && global.mapillary.Viewer) return Promise.resolve(global.mapillary);
    return Promise.all([
      loadStyle('https://unpkg.com/mapillary-js@4.1.2/dist/mapillary.css'),
      loadScript('https://unpkg.com/mapillary-js@4.1.2/dist/mapillary.min.js')
    ]).then(() => {
      if (!global.mapillary || !global.mapillary.Viewer) {
        throw new Error('MapillaryJS unavailable');
      }
      return global.mapillary;
    });
  }

  global.LazyLoader = {
    loadScript,
    loadStyle,
    ensureECharts,
    ensureMapillary
  };
})(window);

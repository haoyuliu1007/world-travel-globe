/**
 * Local ISO/IEC 18004 QR Matrix & SVG Generator (KAIROS V5.1)
 * Powered by vendored MIT `qrcode-generator` (Versions 1..40, UTF-8 byte mode, 4-module quiet zone).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.QRCodeService = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  function getQrFactory() {
    if (typeof global.qrcode === 'function') return global.qrcode;
    if (typeof require === 'function') {
      try {
        const mod = require('../../vendor/qrcode-generator.min.js');
        if (typeof mod === 'function') return mod;
      } catch (e) { /* ignore */ }
    }
    throw new Error('qrcode-generator library not loaded');
  }

  function encodeMatrix(text, ecLevel) {
    const str = String(text || 'https://world-travel-globe.globe-app.workers.dev/');
    const utf8Len = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(str).length : str.length;
    if (utf8Len > 2953) {
      throw new Error(`QR payload (${utf8Len} bytes) exceeds ISO/IEC 18004 max byte capacity (2953 bytes)`);
    }
    const qrcode = getQrFactory();
    const level = ecLevel || (utf8Len > 1200 ? 'L' : 'M');
    let qr;
    try {
      qr = qrcode(0, level);
      qr.addData(str, 'Byte');
      qr.make();
    } catch (e) {
      if (level !== 'L') {
        qr = qrcode(0, 'L');
        qr.addData(str, 'Byte');
        qr.make();
      } else {
        throw e;
      }
    }
    const n = qr.getModuleCount();
    const mat = Array.from({ length: n }, (_, r) => {
      const row = new Int8Array(n);
      for (let c = 0; c < n; c++) row[c] = qr.isDark(r, c) ? 1 : 0;
      return row;
    });
    return mat;
  }

  function renderSvg(text, opts) {
    const optObj = typeof opts === 'number' ? { size: opts } : (opts || {});
    const sizePx = Number(optObj.size) > 0 ? Number(optObj.size) : 180;
    const fg = optObj.fg || '#16283F';
    const bg = optObj.bg || '#FAF8F4';
    const quiet = Number.isFinite(Number(optObj.quiet)) ? Math.max(4, Number(optObj.quiet)) : 4;

    let mat;
    try {
      mat = encodeMatrix(text, optObj.ecLevel);
    } catch (e) {
      return '';
    }
    const n = mat.length;
    const total = n + quiet * 2;
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (mat[r][c] === 1) {
          d += `M${c + quiet},${r + quiet}h1v1h-1z`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${bg}"/><path fill="${fg}" d="${d}"/></svg>`;
  }

  return { encodeMatrix, renderSvg };
});

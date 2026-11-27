/**
 * Pure-JS Local QR Matrix / SVG Generator (KAIROS V5.0)
 * Zero external network calls — renders crisp scannable SVG QR codes for share links & invites.
 * Based on standard byte-mode QR Version 2..6 deterministic matrix generator (Reed-Solomon GF(256)).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QRCodeService = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // GF(256) with primitive polynomial 0x11d (285)
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function rsGenerator(deg) {
    let poly = [1];
    for (let i = 0; i < deg; i++) {
      const next = new Array(poly.length + 1).fill(0);
      const factor = EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecCount) {
    const gen = rsGenerator(ecCount);
    const res = new Uint8Array(data.length + ecCount);
    res.set(data);
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          res[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return res.slice(data.length);
  }

  // Version table (Error Correction Level L): [version, size, totalDataCodewords, ecPerBlock, numBlocks]
  const VERSIONS = [
    [1, 21, 19, 7, 1],
    [2, 25, 34, 10, 1],
    [3, 29, 55, 15, 1],
    [4, 33, 80, 20, 1],
    [5, 37, 108, 26, 1],
    [6, 41, 136, 18, 2],
    [8, 49, 194, 24, 2],
    [10, 57, 274, 18, 4]
  ];

  function encodeMatrix(text) {
    const bytes = new TextEncoder().encode(String(text || 'https://world-travel-globe.globe-app.workers.dev/'));
    let verCfg = VERSIONS[VERSIONS.length - 1];
    for (const v of VERSIONS) {
      if (bytes.length + 3 <= v[2]) {
        verCfg = v;
        break;
      }
    }
    const [ver, size, dataCap, ecLen, blocks] = verCfg;
    const clipped = bytes.slice(0, Math.max(1, dataCap - 3));

    const bits = [];
    const pushBits = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    pushBits(0b0100, 4); // byte mode
    pushBits(clipped.length, ver >= 10 ? 16 : 8);
    for (const b of clipped) pushBits(b, 8);
    pushBits(0, Math.min(4, dataCap * 8 - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);

    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      codewords.push(byte);
    }
    let padIdx = 0;
    while (codewords.length < dataCap) {
      codewords.push(padIdx % 2 === 0 ? 0xec : 0x11);
      padIdx++;
    }

    const blkSize = Math.floor(dataCap / blocks);
    const dataBlocks = [];
    const ecBlocks = [];
    let pos = 0;
    for (let b = 0; b < blocks; b++) {
      const len = blkSize + (b >= blocks - (dataCap % blocks) ? 1 : 0);
      const slice = new Uint8Array(codewords.slice(pos, pos + len));
      pos += len;
      dataBlocks.push(slice);
      ecBlocks.push(rsEncode(slice, ecLen));
    }

    const finalBytes = [];
    const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
    for (let i = 0; i < maxDataLen; i++) {
      for (const db of dataBlocks) if (i < db.length) finalBytes.push(db[i]);
    }
    for (let i = 0; i < ecLen; i++) {
      for (const eb of ecBlocks) finalBytes.push(eb[i]);
    }

    const mat = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
    const fixed = Array.from({ length: size }, () => new Uint8Array(size));

    const setMod = (r, c, val, isFixed) => {
      if (r < 0 || c < 0 || r >= size || c >= size) return;
      mat[r][c] = val ? 1 : 0;
      if (isFixed) fixed[r][c] = 1;
    };

    const drawFinder = (r0, c0) => {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = r0 + dr, c = c0 + dc;
          if (r < 0 || c < 0 || r >= size || c >= size) continue;
          const on = (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) &&
            (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
          setMod(r, c, on ? 1 : 0, true);
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    for (let i = 8; i < size - 8; i++) {
      setMod(6, i, i % 2 === 0 ? 1 : 0, true);
      setMod(i, 6, i % 2 === 0 ? 1 : 0, true);
    }
    setMod(size - 8, 8, 1, true);

    if (ver >= 2) {
      const pos2 = size - 7;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          setMod(pos2 + dr, pos2 + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0, true);
        }
      }
    }

    // Reserve format info
    for (let i = 0; i < 9; i++) {
      if (i !== 6) { fixed[8][i] = 1; fixed[i][8] = 1; }
    }
    for (let i = size - 8; i < size; i++) { fixed[8][i] = 1; fixed[i][8] = 1; }

    // Fill data bits (mask 0: (r+c)%2 === 0)
    const bitStream = [];
    for (const byte of finalBytes) {
      for (let i = 7; i >= 0; i--) bitStream.push((byte >> i) & 1);
    }
    let bIdx = 0;
    let up = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (let rowOff = 0; rowOff < size; rowOff++) {
        const r = up ? size - 1 - rowOff : rowOff;
        for (let dc = 0; dc < 2; dc++) {
          const c = col - dc;
          if (fixed[r][c]) continue;
          const bit = bIdx < bitStream.length ? bitStream[bIdx++] : 0;
          mat[r][c] = bit ^ ((r + c) % 2 === 0 ? 1 : 0);
        }
      }
      up = !up;
    }

    // Write Format Info for EC Level L (01) + Mask 0 (000) -> 0x77c4 (with 0x5412 mask -> 111011111000100)
    const fmt = 0x77c4;
    for (let i = 0; i < 15; i++) {
      const bit = (fmt >> (14 - i)) & 1;
      if (i < 6) mat[8][i] = bit;
      else if (i === 6) mat[8][7] = bit;
      else if (i === 7) mat[8][8] = bit;
      else if (i === 8) mat[7][8] = bit;
      else mat[14 - i][8] = bit;

      if (i < 8) mat[size - 1 - i][8] = bit;
      else mat[8][size - 15 + i] = bit;
    }
    return mat;
  }

  function renderSvg(text, opts) {
    const sizePx = (opts && opts.size) || 180;
    const fg = (opts && opts.fg) || '#16283F';
    const bg = (opts && opts.bg) || '#FAF8F4';
    const mat = encodeMatrix(text);
    const n = mat.length;
    const quiet = 2;
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

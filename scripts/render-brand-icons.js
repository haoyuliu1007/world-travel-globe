'use strict';

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const ROOT = path.resolve(__dirname, '..');
const SVG_DIR = path.join(ROOT, 'assets', 'brand', 'svg');
const ICONS_DIR = path.join(ROOT, 'assets', 'brand', 'icons');
const SOCIAL_DIR = path.join(ROOT, 'assets', 'brand', 'social');

fs.mkdirSync(ICONS_DIR, { recursive: true });
fs.mkdirSync(SOCIAL_DIR, { recursive: true });

function renderSvgToPng(svgStr, widthPx) {
  const resvg = new Resvg(svgStr, {
    fitTo: { mode: 'width', value: widthPx }
  });
  return resvg.render().asPng();
}

function buildIcoFromPngs(entries) {
  // entries: [{ size, pngBuffer }]
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  let offset = 6 + count * 16;
  for (const e of entries) {
    const dir = Buffer.alloc(16);
    dir[0] = e.size >= 256 ? 0 : e.size;
    dir[1] = e.size >= 256 ? 0 : e.size;
    dir[2] = 0; // palette
    dir[3] = 0; // reserved
    dir.writeUInt16LE(1, 4); // planes
    dir.writeUInt16LE(32, 6); // bpp
    dir.writeUInt32LE(e.pngBuffer.length, 8);
    dir.writeUInt32LE(offset, 12);
    dirEntries.push(dir);
    offset += e.pngBuffer.length;
  }
  return Buffer.concat([header, ...dirEntries, ...entries.map((e) => e.pngBuffer)]);
}

function main() {
  const iconInnerSvg = fs.readFileSync(path.join(SVG_DIR, 'kairos-icon.svg'), 'utf8');
  const faviconSvg = fs.readFileSync(path.join(ICONS_DIR, 'favicon.svg'), 'utf8');
  const horizDarkSvg = fs.readFileSync(path.join(SVG_DIR, 'kairos-horizontal-dark.svg'), 'utf8');

  // Extract inner <g id="kairos-app-icon">...</g> from kairos-icon.svg for clean icon variants
  const innerMatch = iconInnerSvg.match(/<g id="kairos-app-icon">[\s\S]*?<\/g>/);
  if (!innerMatch) throw new Error('Missing kairos-app-icon group');
  const iconGroup = innerMatch[0];

  // Apple touch icon: Cream #FAF8F4 background, full bleed square (iOS applies squircle mask)
  const appleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" fill="none">
    <rect width="512" height="512" fill="#FAF8F4"/>
    ${iconGroup}
  </svg>`;

  // Standard rounded square icon (Cream #FAF8F4 bg, Navy + Gold)
  const appIconCreamSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" fill="none">
    <rect width="512" height="512" rx="112" fill="#FAF8F4"/>
    ${iconGroup}
  </svg>`;

  // Maskable 512 icon: Navy #16283F bg, Cream + Gold scaled to 72% inside safe zone
  const creamGroup = iconGroup.replace(/#16283F/g, '#FAF8F4');
  const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" fill="none">
    <rect width="512" height="512" fill="#16283F"/>
    <g transform="translate(71.68, 71.68) scale(0.72)">
      ${creamGroup}
    </g>
  </svg>`;

  const f16 = renderSvgToPng(faviconSvg, 16);
  const f32 = renderSvgToPng(faviconSvg, 32);
  const f48 = renderSvgToPng(faviconSvg, 48);
  const f64 = renderSvgToPng(faviconSvg, 64);
  const apple180 = renderSvgToPng(appleSvg, 180);
  const icon192 = renderSvgToPng(appIconCreamSvg, 192);
  const icon512 = renderSvgToPng(appIconCreamSvg, 512);
  const mask512 = renderSvgToPng(maskableSvg, 512);
  const icoBuf = buildIcoFromPngs([
    { size: 16, pngBuffer: f16 },
    { size: 32, pngBuffer: f32 },
    { size: 48, pngBuffer: f48 }
  ]);

  fs.writeFileSync(path.join(ICONS_DIR, 'favicon-16.png'), f16);
  fs.writeFileSync(path.join(ICONS_DIR, 'favicon-32.png'), f32);
  fs.writeFileSync(path.join(ICONS_DIR, 'favicon-48.png'), f48);
  fs.writeFileSync(path.join(ICONS_DIR, 'favicon.ico'), icoBuf);
  fs.writeFileSync(path.join(ICONS_DIR, 'icon-64.png'), f64);
  fs.writeFileSync(path.join(ICONS_DIR, 'apple-touch-icon.png'), apple180);
  fs.writeFileSync(path.join(ICONS_DIR, 'icon-192.png'), icon192);
  fs.writeFileSync(path.join(ICONS_DIR, 'icon-512.png'), icon512);
  fs.writeFileSync(path.join(ICONS_DIR, 'icon-maskable-512.png'), mask512);

  // Build 1200x630 OG Cover using the master horizontal dark vector SVG
  const vbMatch = horizDarkSvg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const hw = vbMatch ? Number(vbMatch[1]) : 960;
  const hh = vbMatch ? Number(vbMatch[2]) : 260;
  const horizInner = horizDarkSvg.match(/<g id="kairos-horizontal-mark">[\s\S]*?<\/g>/)[0];
  const targetLogoW = 860;
  const logoScale = targetLogoW / hw;
  const logoH = hh * logoScale;
  const logoX = (1200 - targetLogoW) / 2;
  const logoY = 175;

  const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" fill="none">
    <rect width="1200" height="630" fill="#16283F"/>
    <circle cx="980" cy="140" r="280" fill="#1D3452" opacity="0.55"/>
    <circle cx="210" cy="510" r="240" fill="#0F1D2E" opacity="0.65"/>
    <rect x="28" y="28" width="1144" height="574" rx="26" stroke="#E8A33D" stroke-opacity="0.32" stroke-width="2"/>
    <g transform="translate(${logoX.toFixed(2)}, ${logoY.toFixed(2)}) scale(${logoScale.toFixed(5)})">
      ${horizInner}
    </g>
    <text x="600" y="${Math.round(logoY + logoH + 68)}" text-anchor="middle" fill="#FAF8F4" fill-opacity="0.82" font-size="22" font-family="sans-serif" letter-spacing="2">137 COUNTRIES · 722 DESTINATIONS · 5,414 SUN-TRACKED SPOTS</text>
    <text x="600" y="564" text-anchor="middle" fill="#E8A33D" font-size="16" font-family="monospace">Travel with Astronomical Precision · world-travel-globe.globe-app.workers.dev</text>
  </svg>`;

  const ogFontOpts = fs.existsSync('C:/Windows/Fonts/msyh.ttc')
    ? { fontFiles: ['C:/Windows/Fonts/msyh.ttc'], loadSystemFonts: false, defaultFontFamily: 'Microsoft YaHei' }
    : { loadSystemFonts: true };
  const ogResvg = new Resvg(ogSvg, { fitTo: { mode: 'width', value: 1200 }, font: ogFontOpts });
  const ogPng = ogResvg.render().asPng();
  fs.writeFileSync(path.join(SOCIAL_DIR, 'og-cover.png'), ogPng);

  // Also write a preview PNG of primary & horizontal SVGs for visual QA check
  const priSvg = fs.readFileSync(path.join(SVG_DIR, 'kairos-primary.svg'), 'utf8');
  const priPreview = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 780" width="640" height="780"><rect width="640" height="780" fill="#FAF8F4"/>${priSvg.match(/<g id="kairos-primary-mark">[\s\S]*?<\/g>/)[0]}</svg>`;
  fs.writeFileSync(path.join(SOCIAL_DIR, 'preview-primary.png'), renderSvgToPng(priPreview, 640));

  console.log('Rendered all KAIROS icons and og-cover.png successfully.');
}

main();

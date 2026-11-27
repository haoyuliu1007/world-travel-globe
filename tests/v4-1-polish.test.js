'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const MediaService = require(path.join(rootDir, 'js', 'services', 'media-wikidata.js'));

test('CSS layout invariants prevent drawer-topbar overlap and popover overflow', () => {
  const stylesCss = fs.readFileSync(path.join(rootDir, 'css', 'styles.css'), 'utf8');
  const upgradesCss = fs.readFileSync(path.join(rootDir, 'css', 'upgrades.css'), 'utf8');

  // Desktop .detail-drawer must clear the 16px+44px top-dock
  const drawerBlock = stylesCss.match(/\.detail-drawer\s*\{[\s\S]*?\}/);
  assert.ok(drawerBlock, 'Expected desktop .detail-drawer rule');
  const topMatch = drawerBlock[0].match(/top:\s*(\d+)px;/);
  assert.ok(topMatch && Number(topMatch[1]) >= 68, `Expected desktop .detail-drawer top >= 68px, got ${topMatch && topMatch[1]}`);

  // Mobile .detail-drawer must sit above .top-dock (z-index: 30)
  const mobileDrawerMatches = [...stylesCss.matchAll(/\.detail-drawer\s*\{[^}]*height:\s*92dvh;[^}]*\}/g)];
  assert.ok(mobileDrawerMatches.length >= 1, 'Expected mobile .detail-drawer rule');
  const zMatch = mobileDrawerMatches[0][0].match(/z-index:\s*(\d+);/);
  assert.ok(zMatch && Number(zMatch[1]) > 30, `Expected mobile .detail-drawer z-index > 30, got ${zMatch && zMatch[1]}`);

  // .layers-popover must scroll cleanly on short screens
  const layersBlock = upgradesCss.match(/\.layers-popover\s*\{[\s\S]*?\}/);
  assert.ok(layersBlock && layersBlock[0].includes('max-height:') && layersBlock[0].includes('overflow-y: auto'));

  // Aurora status pill must hide during viewfinder & fullscreen
  assert.ok(upgradesCss.includes('body.viewfinder-active .aurora-status-pill'));
});

test('MediaWikidataService filters food/logo photos and prioritizes landmark scenery', () => {
  const candidates = [
    {
      title: 'Kaeng hang le Chiang Mai',
      description: 'Northern Thai pork curry dish in a bowl',
      width: 1200,
      height: 900,
      isPano: false,
      thumbUrl: 'https://example.com/curry.jpg'
    },
    {
      title: 'Chiang Mai official seal logo',
      description: 'Emblem of Chiang Mai Province',
      width: 800,
      height: 800,
      isPano: false,
      thumbUrl: 'https://example.com/logo.png'
    },
    {
      title: 'Wat Phra That Doi Suthep Golden Pagoda Chiang Mai',
      description: 'Panoramic sunset view over Chiang Mai temple and mountain',
      width: 1600,
      height: 1000,
      isPano: false,
      thumbUrl: 'https://example.com/temple.jpg'
    }
  ];

  const curryScore = MediaService.scoreTravelPhoto(candidates[0], '清迈 Chiang Mai');
  const templeScore = MediaService.scoreTravelPhoto(candidates[2], '清迈 Chiang Mai');
  assert.equal(curryScore.isIrrelevant, true);
  assert.equal(templeScore.isIrrelevant, false);
  assert.ok(templeScore.score > curryScore.score + 80);

  const ranked = MediaService.rankAndFilterTravelPhotos(candidates, 'Chiang Mai', 6);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].thumbUrl, 'https://example.com/temple.jpg');
});

test('StreetView WebGL cleanup and Viewfinder3D RAF drag throttling are properly wired', () => {
  const svSrc = fs.readFileSync(path.join(rootDir, 'js', 'modules', 'streetview.js'), 'utf8');
  assert.ok(svSrc.includes("global.removeEventListener('mousemove', onMouseMove)"), 'Expected mousemove cleanup in remove()');
  assert.ok(svSrc.includes('WEBGL_lose_context'), 'Expected explicit WebGL context release');

  const vfSrc = fs.readFileSync(path.join(rootDir, 'js', 'modules', 'viewfinder-3d.js'), 'utf8');
  assert.ok(vfSrc.includes('moveRafId = requestAnimationFrame'), 'Expected RAF throttling on map move handler');
  assert.ok(vfSrc.includes('cachedSimKey'), 'Expected solar simulation caching across camera drags');
});

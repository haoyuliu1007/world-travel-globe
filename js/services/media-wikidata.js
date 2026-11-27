(function (global) {
  'use strict';

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const DIRECT_BREAK_MS = 5 * 60 * 1000;

  let directFailCount = 0;
  let directBlockedUntil = 0;

  function isDirectCircuitOpen() {
    return Date.now() < directBlockedUntil;
  }

  function recordDirectResult(ok) {
    if (ok) {
      directFailCount = 0;
      directBlockedUntil = 0;
    } else {
      directFailCount++;
      if (directFailCount >= 2) {
        directBlockedUntil = Date.now() + DIRECT_BREAK_MS;
      }
    }
  }

  function rewriteImageUrl(rawUrl, caps) {
    if (
      caps &&
      caps.available &&
      caps.features &&
      caps.features.img &&
      typeof rawUrl === 'string' &&
      rawUrl.startsWith('https://upload.wikimedia.org/')
    ) {
      return `/api/img?url=${encodeURIComponent(rawUrl)}`;
    }
    return rawUrl;
  }

  function haversineKm(a, b) {
    const r = Math.PI / 180;
    const dLat = (b[1] - a[1]) * r;
    const dLng = (b[0] - a[0]) * r;
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function stripHtml(html) {
    if (!html) return '';
    return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function cleanQueryName(name) {
    return String(name || '')
      .split(/[·•（(/]/)[0]
      .replace(/[《》「」]/g, '')
      .trim();
  }

  function parseCommonsPages(pagesObj, caps) {
    if (!pagesObj || typeof pagesObj !== 'object') return [];
    const list = [];
    for (const k of Object.keys(pagesObj)) {
      const p = pagesObj[k];
      const info = p && Array.isArray(p.imageinfo) ? p.imageinfo[0] : null;
      if (!info || !info.thumburl) continue;
      const mime = String(info.mime || '');
      if (mime && !mime.startsWith('image/')) continue;
      if (mime.includes('svg') || mime.includes('tiff')) continue;
      if (info.width && info.height && (info.width < 320 || info.height < 200)) continue;

      const meta = info.extmetadata || {};
      const author = stripHtml((meta.Artist && meta.Artist.value) || (meta.Credit && meta.Credit.value) || 'Wikimedia Commons Contributor');
      const license = stripHtml((meta.LicenseShortName && meta.LicenseShortName.value) || 'Wikimedia Commons License');
      const licenseUrl = (meta.LicenseUrl && meta.LicenseUrl.value) || '';
      const desc = stripHtml((meta.ImageDescription && meta.ImageDescription.value) || p.title || '');
      const titleClean = String(p.title || '').replace(/^File:/i, '').replace(/\.[^.]+$/, '');
      const aspect = info.width && info.height ? info.width / info.height : 1.5;

      list.push({
        pageid: p.pageid,
        title: titleClean,
        description: desc.slice(0, 180),
        thumbUrl: rewriteImageUrl(info.thumburl, caps),
        fullUrl: rewriteImageUrl(info.url || info.thumburl, caps),
        sourceUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title || '')}`,
        author: author.slice(0, 80),
        license: license.slice(0, 50),
        licenseUrl,
        width: info.width || 0,
        height: info.height || 0,
        isPano: aspect >= 2.2,
        provider: 'Wikimedia Commons'
      });
    }
    return list;
  }

  async function fetchWithDirectCircuit(url, cacheKey, ttlMs, source, useProxy) {
    const Api = global.ApiClient;
    if (!useProxy && isDirectCircuitOpen()) {
      throw new Error('Wikimedia direct circuit open');
    }
    try {
      let data;
      if (Api) {
        data = await Api.fetchJson(url, {
          cacheKey,
          ttlMs,
          source,
          timeoutMs: useProxy ? 9000 : 4200,
          retries: useProxy ? 1 : 0
        });
      } else {
        const res = await fetch(url);
        data = await res.json();
      }
      if (!useProxy) recordDirectResult(true);
      return data;
    } catch (err) {
      if (!useProxy) recordDirectResult(false);
      throw err;
    }
  }

  async function queryCommonsApi(params) {
    const Api = global.ApiClient;
    const caps = Api ? await Api.detectWorkerCapabilities() : { available: false };
    const useProxy = Boolean(caps && caps.available && caps.features && caps.features.commons);
    const qs = new URLSearchParams(Object.assign({ format: 'json', origin: '*' }, params)).toString();
    const url = useProxy ? `/api/commons?${qs}` : `https://commons.wikimedia.org/w/api.php?${qs}`;
    return fetchWithDirectCircuit(url, `commons:${qs}`, SEVEN_DAYS_MS, 'Wikimedia Commons', useProxy);
  }

  async function queryWikipediaSummarySearch(query, lang) {
    const Api = global.ApiClient;
    const caps = Api ? await Api.detectWorkerCapabilities() : { available: false };
    const useProxy = Boolean(caps && caps.available && caps.features && caps.features.wikipedia);
    const hostLang = lang === 'zh' ? 'zh' : 'en';
    const qs = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      generator: 'search',
      gsrsearch: query,
      gsrlimit: '3',
      prop: 'pageimages|coordinates|pageprops',
      pithumbsize: '960',
      piprop: 'thumbnail|name'
    }).toString();
    const url = useProxy
      ? `/api/wikipedia?lang=${hostLang}&${qs}`
      : `https://${hostLang}.wikipedia.org/w/api.php?${qs}`;
    return fetchWithDirectCircuit(url, `wp:${hostLang}:${query}`, SEVEN_DAYS_MS, `Wikipedia (${hostLang})`, useProxy);
  }

  const IRRELEVANT_PHOTO_RE =
    /(?:\b(?:curry|food|dish|meal|soup|noodle|rice|salad|vegetable|fruit|dessert|menu|plate|bowl|restaurant|cuisine|cooking|eating|breakfast|lunch|dinner|snack|beverage|drink|cocktail|logo|flag|state flag|coat of arms|emblem|seal of|map of|locator|diagram|chart|graph|portrait|selfie|headshot|ticket|stamp|coin|banknote|qr code|screenshot|signpost|gravestone|tombstone|kaeng|khao soi|pad thai|som tam)\b|flag_of|coat_of_arms|seal_of|locator_map|blank_map|emblem_of|us_state)/i;

  const SCENERY_PHOTO_RE =
    /\b(temple|wat|mountain|peak|lake|sunset|sunrise|view|panorama|skyline|bridge|palace|cathedral|church|castle|fjord|glacier|coast|beach|valley|old town|night|aerial|landscape|river|forest|park|garden|pagoda|shrine|monastery|harbor|bay|canyon|waterfall|cliff|summit|island|arch|square|plaza|cityscape|hall|chapel|library)\b/i;

  const US_STATE_NAMES_RE =
    /\b(arizona|texas|california|florida|ohio|nevada|utah|wyoming|alabama|alaska|indiana|kentucky|maryland|michigan|minnesota|missouri|nebraska|oregon|tennessee|vermont|wisconsin)\b/i;

  /**
   * Score Wikimedia Commons photo relevance for travel scenery & landmarks,
   * heavily penalizing food, logos, locator maps, state flags, portraits, and tickets.
   */
  function scoreTravelPhoto(photo, placeName, country) {
    if (!photo || typeof photo !== 'object') return { score: -999, isIrrelevant: true };
    const text = `${photo.title || ''} ${photo.description || ''}`;
    let score = 0;
    let isIrrelevant = false;

    if (IRRELEVANT_PHOTO_RE.test(text)) {
      score -= 80;
      isIrrelevant = true;
    }

    const countryStr = String(country || '');
    const placeStr = String(placeName || '');
    const isAsianOrNonUs = Boolean(countryStr) && !/美国|united states|usa|america/i.test(countryStr);
    if (isAsianOrNonUs && US_STATE_NAMES_RE.test(text) && !US_STATE_NAMES_RE.test(placeStr)) {
      score -= 120;
      isIrrelevant = true;
    }

    const w = Number(photo.width) || 0;
    const h = Number(photo.height) || 0;
    const aspect = w > 0 && h > 0 ? w / h : 1.5;

    if (aspect >= 1.2 && aspect <= 2.4) score += 20;
    else if (photo.isPano || aspect > 2.4) score += 12;
    else if (aspect < 0.75) score -= 12;

    if (w >= 1000) score += 10;
    if (SCENERY_PHOTO_RE.test(text)) score += 18;

    const cleanPlace = cleanQueryName(placeName || '').toLowerCase();
    if (cleanPlace && cleanPlace.length >= 2 && text.toLowerCase().includes(cleanPlace)) {
      score += 14;
    }

    return { score, isIrrelevant };
  }

  function rankAndFilterTravelPhotos(photos, placeName, limit, country) {
    if (!Array.isArray(photos) || !photos.length) return [];
    const scored = photos.map((p) => {
      const r = scoreTravelPhoto(p, placeName, country);
      return { photo: p, score: r.score, isIrrelevant: r.isIrrelevant };
    });
    scored.sort((a, b) => b.score - a.score);
    const clean = scored.filter((x) => !x.isIrrelevant).map((x) => x.photo);
    const pool = clean.length ? clean : scored.map((x) => x.photo);
    return pool.slice(0, limit || 6);
  }

  async function fetchPlacePhotos(opts) {
    const o = opts || {};
    const lat = Number(o.lat);
    const lng = Number(o.lng);
    const limit = o.limit || 6;
    const radiusM = Math.min(10000, o.radiusM || 3500);
    const Api = global.ApiClient;
    const caps = Api ? await Api.detectWorkerCapabilities() : { available: false };
    const cachePrefix = caps && caps.available && caps.features && caps.features.img ? 'photos:v4p' : 'photos:v4';
    const cacheKey = `${cachePrefix}:${o.id || ''}:${lat.toFixed(3)},${lng.toFixed(3)}:${cleanQueryName(o.name)}:${limit}`;

    if (global.StorageDB) {
      const hit = await global.StorageDB.getCache(cacheKey);
      if (hit && Array.isArray(hit.data)) return hit.data;
    }

    let photos = [];
    try {
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const geoRes = await queryCommonsApi({
          action: 'query',
          generator: 'geosearch',
          ggsprimary: 'all',
          ggsnamespace: '6',
          ggscoord: `${lat}|${lng}`,
          ggsradius: String(radiusM),
          ggslimit: String(Math.min(24, limit * 3)),
          prop: 'imageinfo',
          iiprop: 'url|extmetadata|size|mime',
          iiurlwidth: '960'
        });
        photos = parseCommonsPages(geoRes && geoRes.query && geoRes.query.pages, caps);
      }
    } catch (e) {
      // fall through to text search
    }

    const cleanCount = photos.filter((p) => !scoreTravelPhoto(p, o.name, o.country).isIrrelevant).length;
    if (cleanCount < 2 && o.name) {
      try {
        const q = `${cleanQueryName(o.name)} ${cleanQueryName(o.country || '')}`.trim();
        const searchRes = await queryCommonsApi({
          action: 'query',
          generator: 'search',
          gsrsearch: `${q} filetype:bitmap`,
          gsrnamespace: '6',
          gsrlimit: String(Math.min(20, limit * 2 + 4)),
          prop: 'imageinfo',
          iiprop: 'url|extmetadata|size|mime',
          iiurlwidth: '960'
        });
        const more = parseCommonsPages(searchRes && searchRes.query && searchRes.query.pages, caps);
        const seen = new Set(photos.map((p) => p.thumbUrl));
        for (const m of more) {
          if (!seen.has(m.thumbUrl)) {
            seen.add(m.thumbUrl);
            photos.push(m);
          }
        }
      } catch (e) {
        // fallback to Wikipedia pageimages
      }
    }

    if (photos.length === 0 && o.name) {
      try {
        const wpRes = await queryWikipediaSummarySearch(cleanQueryName(o.name), /[\u4e00-\u9fa5]/.test(o.name) ? 'zh' : 'en');
        const pages = wpRes && wpRes.query && wpRes.query.pages ? Object.values(wpRes.query.pages) : [];
        for (const p of pages) {
          if (p && p.thumbnail && p.thumbnail.source) {
            const proxied = rewriteImageUrl(p.thumbnail.source, caps);
            photos.push({
              pageid: p.pageid,
              title: p.title,
              description: p.title,
              thumbUrl: proxied,
              fullUrl: proxied,
              sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(p.pageimage || '')}`,
              author: 'Wikimedia / Wikipedia',
              license: 'Wikimedia License',
              licenseUrl: '',
              width: p.thumbnail.width || 0,
              height: p.thumbnail.height || 0,
              isPano: false,
              provider: 'Wikipedia PageImage'
            });
          }
        }
      } catch (e) {
        // graceful empty
      }
    }

    const result = rankAndFilterTravelPhotos(photos, o.name, limit, o.country);
    if (global.StorageDB && result.length) {
      await global.StorageDB.setCache(cacheKey, result, SEVEN_DAYS_MS, 'Wikimedia Commons');
    }
    return result;
  }

  function extractClaimCoord(claims) {
    const c = claims && claims.P625 && claims.P625[0] && claims.P625[0].mainsnak && claims.P625[0].mainsnak.datavalue;
    if (!c || !c.value) return null;
    return [Number(c.value.longitude), Number(c.value.latitude)];
  }

  function extractClaimQuantity(claims, prop) {
    const q = claims && claims[prop] && claims[prop][0] && claims[prop][0].mainsnak && claims[prop][0].mainsnak.datavalue;
    if (!q || !q.value || q.value.amount === undefined) return null;
    return Number(String(q.value.amount).replace('+', ''));
  }

  function extractClaimEntityIds(claims, prop) {
    const arr = claims && claims[prop];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => x && x.mainsnak && x.mainsnak.datavalue && x.mainsnak.datavalue.value && x.mainsnak.datavalue.value.id)
      .filter(Boolean)
      .slice(0, 3);
  }

  async function queryWikidataApi(params) {
    const Api = global.ApiClient;
    const caps = Api ? await Api.detectWorkerCapabilities() : { available: false };
    const useProxy = Boolean(caps && caps.available && caps.features && caps.features.wikidata);
    const qs = new URLSearchParams(Object.assign({ format: 'json', origin: '*' }, params)).toString();
    const url = useProxy ? `/api/wikidata?${qs}` : `https://www.wikidata.org/w/api.php?${qs}`;
    return fetchWithDirectCircuit(url, `wd:${qs}`, THIRTY_DAYS_MS, 'Wikidata', useProxy);
  }

  async function verifyWithWikidata(dest) {
    if (!dest || !dest.id) return null;
    const entityKey = `city:${dest.id}`;
    if (global.StorageDB) {
      const existing = await global.StorageDB.getWikidata(entityKey);
      if (existing && Date.now() - existing.updatedAt < THIRTY_DAYS_MS) {
        return existing;
      }
    }

    const cleanName = cleanQueryName(dest.shortName || dest.name);
    const country = cleanQueryName(dest.country || '');
    let qid = null;

    // Step 1: Try zh.wikipedia then en.wikipedia geosearch/search for exact wikibase_item
    for (const lang of ['zh', 'en']) {
      try {
        const searchQ = lang === 'en' ? `${dest.id.replace(/^[a-z]{2}-/, '').replace(/-/g, ' ')} ${country}` : `${cleanName} ${country}`;
        const wp = await queryWikipediaSummarySearch(searchQ.trim(), lang);
        const pages = wp && wp.query && wp.query.pages ? Object.values(wp.query.pages) : [];
        for (const p of pages) {
          if (p && p.pageprops && p.pageprops.wikibase_item) {
            qid = p.pageprops.wikibase_item;
            break;
          }
        }
        if (qid) break;
      } catch (e) {
        // continue
      }
    }

    // Step 2: Fallback direct Wikidata wbsearchentities
    if (!qid) {
      try {
        const wdSearch = await queryWikidataApi({
          action: 'wbsearchentities',
          search: cleanName,
          language: 'zh',
          uselang: 'zh',
          limit: '3'
        });
        if (wdSearch && Array.isArray(wdSearch.search) && wdSearch.search[0]) {
          qid = wdSearch.search[0].id;
        }
      } catch (e) {
        // ignore
      }
    }

    if (!qid) {
      const rec = {
        entityKey,
        destId: dest.id,
        qid: null,
        confidence: 'empirical',
        coordDeltaKm: null,
        payload: null,
        updatedAt: Date.now()
      };
      if (global.StorageDB) await global.StorageDB.setWikidata(rec);
      return rec;
    }

    try {
      const entRes = await queryWikidataApi({
        action: 'wbgetentities',
        ids: qid,
        props: 'labels|descriptions|claims|sitelinks',
        languages: 'zh|zh-hans|en'
      });
      const entity = entRes && entRes.entities && entRes.entities[qid];
      if (!entity) return null;

      const claims = entity.claims || {};
      const wdCoords = extractClaimCoord(claims);
      const wdElevation = extractClaimQuantity(claims, 'P2044');
      const instanceIds = extractClaimEntityIds(claims, 'P31');
      const architectIds = extractClaimEntityIds(claims, 'P84');
      const heritageIds = extractClaimEntityIds(claims, 'P1435');

      // Resolve labels for P31 / P84 / P1435 in one batched wbgetentities call if present
      const refIds = [...new Set([...instanceIds, ...architectIds, ...heritageIds])];
      let refLabels = {};
      if (refIds.length) {
        try {
          const refRes = await queryWikidataApi({
            action: 'wbgetentities',
            ids: refIds.join('|'),
            props: 'labels',
            languages: 'zh|zh-hans|en'
          });
          const ents = (refRes && refRes.entities) || {};
          for (const rid of Object.keys(ents)) {
            const lbs = ents[rid].labels || {};
            refLabels[rid] = (lbs['zh-hans'] || lbs.zh || lbs.en || {}).value || rid;
          }
        } catch (e) {
          // ignore
        }
      }

      const coordDeltaKm =
        wdCoords && Array.isArray(dest.coords)
          ? Number(haversineKm(dest.coords, wdCoords).toFixed(2))
          : null;

      let confidence = 'high';
      if (coordDeltaKm === null) confidence = 'medium';
      else if (coordDeltaKm > 80) confidence = 'review';
      else if (coordDeltaKm > 15) confidence = 'medium';

      const labels = entity.labels || {};
      const descs = entity.descriptions || {};
      const record = {
        entityKey,
        destId: dest.id,
        qid,
        confidence,
        coordDeltaKm,
        updatedAt: Date.now(),
        payload: {
          labelZh: (labels['zh-hans'] || labels.zh || {}).value || '',
          labelEn: (labels.en || {}).value || '',
          descZh: (descs['zh-hans'] || descs.zh || descs.en || {}).value || '',
          coords: wdCoords,
          elevationM: wdElevation,
          instanceOf: instanceIds.map((id) => refLabels[id] || id),
          architects: architectIds.map((id) => refLabels[id] || id),
          heritage: heritageIds.map((id) => refLabels[id] || id),
          wikidataUrl: `https://www.wikidata.org/wiki/${qid}`
        }
      };
      if (global.StorageDB) await global.StorageDB.setWikidata(record);
      return record;
    } catch (e) {
      return null;
    }
  }

  const api = {
    fetchPlacePhotos,
    verifyWithWikidata,
    scoreTravelPhoto,
    rankAndFilterTravelPhotos
  };

  global.MediaWikidataService = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

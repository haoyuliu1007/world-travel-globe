(function (global) {
  'use strict';

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

  function parseCommonsPages(pagesObj) {
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
        thumbUrl: info.thumburl,
        fullUrl: info.url || info.thumburl,
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

  async function queryCommonsApi(params) {
    const Api = global.ApiClient;
    const caps = Api ? await Api.detectWorkerCapabilities() : { available: false };
    const qs = new URLSearchParams(Object.assign({ format: 'json', origin: '*' }, params)).toString();
    const url =
      caps && caps.available && caps.features && caps.features.commons
        ? `/api/commons?${qs}`
        : `https://commons.wikimedia.org/w/api.php?${qs}`;

    if (Api) {
      return Api.fetchJson(url, {
        cacheKey: `commons:${qs}`,
        ttlMs: SEVEN_DAYS_MS,
        source: 'Wikimedia Commons',
        timeoutMs: 9000
      });
    }
    const res = await fetch(url);
    return res.json();
  }

  async function queryWikipediaSummarySearch(query, lang) {
    const Api = global.ApiClient;
    const hostLang = lang || 'en';
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
    const url = `https://${hostLang}.wikipedia.org/w/api.php?${qs}`;
    if (Api) {
      return Api.fetchJson(url, {
        cacheKey: `wp:${hostLang}:${query}`,
        ttlMs: SEVEN_DAYS_MS,
        source: `Wikipedia (${hostLang})`,
        timeoutMs: 8500
      });
    }
    const res = await fetch(url);
    return res.json();
  }

  async function fetchPlacePhotos(opts) {
    const o = opts || {};
    const lat = Number(o.lat);
    const lng = Number(o.lng);
    const limit = o.limit || 6;
    const radiusM = Math.min(10000, o.radiusM || 3500);
    const cacheKey = `photos:v1:${o.id || ''}:${lat.toFixed(3)},${lng.toFixed(3)}:${cleanQueryName(o.name)}:${limit}`;

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
          ggslimit: String(Math.min(15, limit + 5)),
          prop: 'imageinfo',
          iiprop: 'url|extmetadata|size|mime',
          iiurlwidth: '960'
        });
        photos = parseCommonsPages(geoRes && geoRes.query && geoRes.query.pages);
      }
    } catch (e) {
      // fall through to text search
    }

    if (photos.length < 2 && o.name) {
      try {
        const q = `${cleanQueryName(o.name)} ${cleanQueryName(o.country || '')}`.trim();
        const searchRes = await queryCommonsApi({
          action: 'query',
          generator: 'search',
          gsrsearch: `${q} filetype:bitmap`,
          gsrnamespace: '6',
          gsrlimit: String(limit + 3),
          prop: 'imageinfo',
          iiprop: 'url|extmetadata|size|mime',
          iiurlwidth: '960'
        });
        const more = parseCommonsPages(searchRes && searchRes.query && searchRes.query.pages);
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
            photos.push({
              pageid: p.pageid,
              title: p.title,
              description: p.title,
              thumbUrl: p.thumbnail.source,
              fullUrl: p.thumbnail.source,
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

    const result = photos.slice(0, limit);
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
    const qs = new URLSearchParams(Object.assign({ format: 'json', origin: '*' }, params)).toString();
    const url =
      caps && caps.available && caps.features && caps.features.wikidata
        ? `/api/wikidata?${qs}`
        : `https://www.wikidata.org/w/api.php?${qs}`;

    if (Api) {
      return Api.fetchJson(url, {
        cacheKey: `wd:${qs}`,
        ttlMs: THIRTY_DAYS_MS,
        source: 'Wikidata',
        timeoutMs: 9000
      });
    }
    const res = await fetch(url);
    return res.json();
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

  global.MediaWikidataService = {
    fetchPlacePhotos,
    verifyWithWikidata
  };
})(window);

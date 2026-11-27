(function (global) {
  'use strict';

  const DB_NAME = 'WorldTravelGlobeDB';
  const DB_VERSION = 1;
  const FAVORITES_LS_KEY = 'wtg_favorites_v1';
  const MEMORY_FALLBACK = {
    apiCache: new Map(),
    wikidataCache: new Map(),
    travelStatus: new Map(),
    customLists: new Map(),
    userPhotos: new Map(),
    expenses: new Map(),
    trips: new Map(),
    settings: new Map()
  };

  let db = null;
  let readyPromise = null;
  let usingFallback = false;

  function makeId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function init() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      try {
        if (!global.Dexie || !global.indexedDB) {
          throw new Error('Dexie or IndexedDB unavailable');
        }
        db = new global.Dexie(DB_NAME);
        db.version(DB_VERSION).stores({
          apiCache: 'key, expiresAt, updatedAt',
          wikidataCache: 'entityKey, qid, confidence, updatedAt',
          travelStatus: 'destId, status, updatedAt',
          customLists: 'id, updatedAt',
          userPhotos: 'id, destId, takenAt',
          expenses: 'id, tripId, destId, date, category',
          trips: 'id, updatedAt',
          settings: 'key'
        });
        await db.open();
      } catch (err) {
        usingFallback = true;
        db = null;
      }
      await migrateLegacyFavoritesInternal();
      return !usingFallback;
    })();
    return readyPromise;
  }

  async function migrateLegacyFavoritesInternal() {
    try {
      let migrated = false;
      if (db) {
        const row = await db.settings.get('legacyFavMigrated');
        migrated = Boolean(row && row.value);
      } else {
        migrated = Boolean(MEMORY_FALLBACK.settings.get('legacyFavMigrated'));
      }
      if (migrated) return;

      const raw = global.localStorage && global.localStorage.getItem(FAVORITES_LS_KEY);
      if (raw) {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) {
          for (const id of ids) {
            if (!id) continue;
            if (db) {
              const cur = await db.travelStatus.get(id);
              if (!cur) await db.travelStatus.put({ destId: id, status: 'wishlist', notes: '', rating: 0, updatedAt: Date.now() });
            } else if (!MEMORY_FALLBACK.travelStatus.has(id)) {
              MEMORY_FALLBACK.travelStatus.set(id, { destId: id, status: 'wishlist', notes: '', rating: 0, updatedAt: Date.now() });
            }
          }
        }
      }
      if (db) {
        await db.settings.put({ key: 'legacyFavMigrated', value: true });
      } else {
        MEMORY_FALLBACK.settings.set('legacyFavMigrated', true);
      }
    } catch (e) {
      // ignore storage restrictions
    }
  }

  async function getCache(key) {
    await init();
    const now = Date.now();
    if (db) {
      const row = await db.apiCache.get(key);
      if (!row) return null;
      if (row.expiresAt && row.expiresAt < now) {
        db.apiCache.delete(key).catch(() => {});
        return null;
      }
      return row;
    }
    const row = MEMORY_FALLBACK.apiCache.get(key);
    if (!row || (row.expiresAt && row.expiresAt < now)) return null;
    return row;
  }

  async function setCache(key, data, ttlMs, source) {
    await init();
    const now = Date.now();
    const row = {
      key,
      data,
      source: source || 'network',
      updatedAt: now,
      expiresAt: ttlMs ? now + ttlMs : 0
    };
    if (db) {
      try {
        await db.apiCache.put(row);
      } catch (e) {
        MEMORY_FALLBACK.apiCache.set(key, row);
      }
    } else {
      MEMORY_FALLBACK.apiCache.set(key, row);
    }
    return row;
  }

  async function clearApiCache() {
    await init();
    MEMORY_FALLBACK.apiCache.clear();
    if (db) await db.apiCache.clear();
  }

  async function getWikidata(entityKey) {
    await init();
    if (db) return (await db.wikidataCache.get(entityKey)) || null;
    return MEMORY_FALLBACK.wikidataCache.get(entityKey) || null;
  }

  async function setWikidata(record) {
    await init();
    if (!record || !record.entityKey) return;
    if (db) {
      await db.wikidataCache.put(record);
    } else {
      MEMORY_FALLBACK.wikidataCache.set(record.entityKey, record);
    }
  }

  async function getAllWikidataConflicts() {
    await init();
    const all = db ? await db.wikidataCache.toArray() : Array.from(MEMORY_FALLBACK.wikidataCache.values());
    return all.filter((r) => r.confidence === 'review' || (r.coordDeltaKm && r.coordDeltaKm > 50));
  }

  async function getTravelStatus(destId) {
    await init();
    if (db) return (await db.travelStatus.get(destId)) || null;
    return MEMORY_FALLBACK.travelStatus.get(destId) || null;
  }

  async function getAllTravelStatuses() {
    await init();
    if (db) return db.travelStatus.toArray();
    return Array.from(MEMORY_FALLBACK.travelStatus.values());
  }

  const LOCAL_ONLY_KEYS = new Set([
    'cloudSyncPassphrase',
    'mapillaryToken',
    'orsApiKey',
    'preSyncBackup',
    'legacyFavMigrated',
    'crdtTombstones',
    'crdtLogicalClock'
  ]);
  const TRAVEL_STATUS_FIELDS = ['status', 'notes', 'rating', 'visitedAt'];

  async function readTombstones() {
    const raw = await getSetting('crdtTombstones', null);
    return raw && typeof raw === 'object'
      ? raw
      : { travelStatus: {}, customLists: {}, trips: {}, expenses: {}, userPhotos: {} };
  }

  async function recordTombstone(table, id) {
    if (!id) return;
    const tombs = await readTombstones();
    if (!tombs[table] || typeof tombs[table] !== 'object') tombs[table] = {};
    tombs[table][String(id)] = Date.now();
    await setSetting('crdtTombstones', tombs);
    const curClk = Number(await getSetting('crdtLogicalClock', 0)) || 0;
    await setSetting('crdtLogicalClock', curClk + 1);
  }

  async function clearTombstone(table, id) {
    if (!id) return;
    const tombs = await readTombstones();
    if (tombs[table] && tombs[table][String(id)]) {
      delete tombs[table][String(id)];
      await setSetting('crdtTombstones', tombs);
    }
  }

  async function setTravelStatus(destId, patch, opts) {
    await init();
    if (!destId) return null;
    const now = Date.now();
    const prev = (await getTravelStatus(destId)) || { destId, status: 'wishlist', notes: '', rating: 0, fieldUpdatedAt: {} };
    const preserveTs = Boolean(opts && opts.preserveTimestamp);
    const nextFieldUpdatedAt = Object.assign({}, prev.fieldUpdatedAt || {}, (patch && patch.fieldUpdatedAt) || {});
    if (!preserveTs && patch && typeof patch === 'object') {
      for (let i = 0; i < TRAVEL_STATUS_FIELDS.length; i++) {
        const f = TRAVEL_STATUS_FIELDS[i];
        if (patch[f] !== undefined) nextFieldUpdatedAt[f] = now;
      }
    }
    const next = Object.assign(
      {},
      prev,
      patch,
      {
        destId,
        fieldUpdatedAt: nextFieldUpdatedAt,
        updatedAt: preserveTs && patch && patch.updatedAt ? Number(patch.updatedAt) : now
      }
    );
    if (!next.status) {
      if (db) await db.travelStatus.delete(destId);
      else MEMORY_FALLBACK.travelStatus.delete(destId);
      if (!preserveTs) await recordTombstone('travelStatus', destId);
      return null;
    }
    if (!preserveTs) await clearTombstone('travelStatus', destId);
    if (db) await db.travelStatus.put(next);
    else MEMORY_FALLBACK.travelStatus.set(destId, next);
    return next;
  }

  async function deleteTravelStatus(destId) {
    await init();
    if (db) await db.travelStatus.delete(destId);
    else MEMORY_FALLBACK.travelStatus.delete(destId);
    await recordTombstone('travelStatus', destId);
  }

  async function getCustomLists() {
    await init();
    if (db) return db.customLists.orderBy('updatedAt').reverse().toArray();
    return Array.from(MEMORY_FALLBACK.customLists.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async function saveCustomList(listObj, opts) {
    await init();
    const preserveTs = Boolean(opts && opts.preserveTimestamp);
    const now = Date.now();
    const item = Object.assign(
      { id: makeId('list'), name: '未命名清单', description: '', destIds: [], createdAt: now },
      listObj,
      { updatedAt: preserveTs && listObj && listObj.updatedAt ? Number(listObj.updatedAt) : now }
    );
    if (!preserveTs) await clearTombstone('customLists', item.id);
    if (db) await db.customLists.put(item);
    else MEMORY_FALLBACK.customLists.set(item.id, item);
    return item;
  }

  async function deleteCustomList(id) {
    await init();
    if (db) await db.customLists.delete(id);
    else MEMORY_FALLBACK.customLists.delete(id);
    await recordTombstone('customLists', id);
  }

  async function getUserPhotos(destId) {
    await init();
    if (db) {
      return destId
        ? db.userPhotos.where('destId').equals(destId).toArray()
        : db.userPhotos.toArray();
    }
    const all = Array.from(MEMORY_FALLBACK.userPhotos.values());
    return destId ? all.filter((p) => p.destId === destId) : all;
  }

  async function saveUserPhoto(photo, opts) {
    await init();
    const preserveTs = Boolean(opts && opts.preserveTimestamp);
    const now = Date.now();
    const item = Object.assign(
      { id: makeId('photo'), takenAt: new Date().toISOString().slice(0, 10) },
      photo,
      { updatedAt: preserveTs && photo && photo.updatedAt ? Number(photo.updatedAt) : now }
    );
    if (!preserveTs) await clearTombstone('userPhotos', item.id);
    if (db) await db.userPhotos.put(item);
    else MEMORY_FALLBACK.userPhotos.set(item.id, item);
    return item;
  }

  async function deleteUserPhoto(id) {
    await init();
    if (db) await db.userPhotos.delete(id);
    else MEMORY_FALLBACK.userPhotos.delete(id);
    await recordTombstone('userPhotos', id);
  }

  async function getExpenses(filter) {
    await init();
    const all = db ? await db.expenses.toArray() : Array.from(MEMORY_FALLBACK.expenses.values());
    if (!filter) return all.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return all
      .filter((e) => (!filter.tripId || e.tripId === filter.tripId) && (!filter.destId || e.destId === filter.destId))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }

  async function saveExpense(exp, opts) {
    await init();
    const preserveTs = Boolean(opts && opts.preserveTimestamp);
    const now = Date.now();
    const item = Object.assign(
      {
        id: makeId('exp'),
        tripId: '',
        destId: '',
        date: new Date().toISOString().slice(0, 10),
        category: '其他',
        amountRmb: 0,
        currency: 'CNY',
        note: ''
      },
      exp,
      { updatedAt: preserveTs && exp && exp.updatedAt ? Number(exp.updatedAt) : now }
    );
    if (!preserveTs) await clearTombstone('expenses', item.id);
    if (db) await db.expenses.put(item);
    else MEMORY_FALLBACK.expenses.set(item.id, item);
    return item;
  }

  async function deleteExpense(id) {
    await init();
    if (db) await db.expenses.delete(id);
    else MEMORY_FALLBACK.expenses.delete(id);
    await recordTombstone('expenses', id);
  }

  async function getTrips() {
    await init();
    if (db) return db.trips.orderBy('updatedAt').reverse().toArray();
    return Array.from(MEMORY_FALLBACK.trips.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async function saveTrip(trip, opts) {
    await init();
    const preserveTs = Boolean(opts && opts.preserveTimestamp);
    const now = Date.now();
    const item = Object.assign(
      { id: makeId('trip'), name: '新旅行计划' },
      trip,
      { updatedAt: preserveTs && trip && trip.updatedAt ? Number(trip.updatedAt) : now }
    );
    if (!preserveTs) await clearTombstone('trips', item.id);
    if (db) await db.trips.put(item);
    else MEMORY_FALLBACK.trips.set(item.id, item);
    return item;
  }

  async function deleteTrip(id) {
    await init();
    if (db) await db.trips.delete(id);
    else MEMORY_FALLBACK.trips.delete(id);
    await recordTombstone('trips', id);
  }

  async function getSetting(key, defaultVal) {
    await init();
    if (db) {
      const row = await db.settings.get(key);
      return row ? row.value : defaultVal;
    }
    if (MEMORY_FALLBACK.settings.has(key)) return MEMORY_FALLBACK.settings.get(key);
    try {
      const raw = global.localStorage && global.localStorage.getItem(`wtg_set_${key}`);
      return raw !== null ? JSON.parse(raw) : defaultVal;
    } catch (e) {
      return defaultVal;
    }
  }

  async function setSetting(key, value) {
    await init();
    if (db) {
      await db.settings.put({ key, value });
    } else {
      MEMORY_FALLBACK.settings.set(key, value);
    }
    try {
      if (global.localStorage) global.localStorage.setItem(`wtg_set_${key}`, JSON.stringify(value));
    } catch (e) {
      // ignore
    }
    return value;
  }

  async function exportAllUserData(opts) {
    await init();
    const includeSecrets = Boolean(opts && opts.includeSecrets);
    const [travelStatus, customLists, userPhotos, expenses, trips, rawSettings, tombstones, logicalClock] = await Promise.all([
      getAllTravelStatuses(),
      getCustomLists(),
      getUserPhotos(),
      getExpenses(),
      getTrips(),
      db ? db.settings.toArray() : Array.from(MEMORY_FALLBACK.settings.entries()).map(([key, value]) => ({ key, value })),
      readTombstones(),
      getSetting('crdtLogicalClock', 0)
    ]);
    const settings = includeSecrets
      ? rawSettings
      : rawSettings.filter((s) => s && s.key && !LOCAL_ONLY_KEYS.has(s.key));
    return {
      schemaVersion: '4.2.0',
      logicalClock: Number(logicalClock || 0) || 0,
      tombstones,
      exportedAt: new Date().toISOString(),
      travelStatus,
      customLists,
      userPhotos,
      expenses,
      trips,
      settings
    };
  }

  async function createLocalBackupSnapshot() {
    const snap = await exportAllUserData({ includeSecrets: false });
    await setSetting('preSyncBackup', { savedAt: Date.now(), payload: snap });
    return snap;
  }

  async function restoreLatestBackupSnapshot() {
    const rec = await getSetting('preSyncBackup', null);
    if (!rec || !rec.payload) return false;
    await importAllUserData(rec.payload, 'crdt');
    return true;
  }

  async function importAllUserData(payload, mode) {
    await init();
    if (!payload || typeof payload !== 'object') throw new Error('Invalid archive payload');
    if (mode === 'replace' || mode === 'crdt') {
      await wipeAllUserData(true);
    }
    const importOpts = { preserveTimestamp: true };
    if (Array.isArray(payload.travelStatus)) {
      for (const s of payload.travelStatus) if (s && s.destId) await setTravelStatus(s.destId, s, importOpts);
    }
    if (Array.isArray(payload.customLists)) {
      for (const l of payload.customLists) if (l && l.id) await saveCustomList(l, importOpts);
    }
    if (Array.isArray(payload.userPhotos)) {
      for (const p of payload.userPhotos) if (p && p.id) await saveUserPhoto(p, importOpts);
    }
    if (Array.isArray(payload.expenses)) {
      for (const e of payload.expenses) if (e && e.id) await saveExpense(e, importOpts);
    }
    if (Array.isArray(payload.trips)) {
      for (const t of payload.trips) if (t && t.id) await saveTrip(t, importOpts);
    }
    if (Array.isArray(payload.settings)) {
      for (const st of payload.settings) {
        if (st && st.key && !LOCAL_ONLY_KEYS.has(st.key)) await setSetting(st.key, st.value);
      }
    }
    if (payload.tombstones && typeof payload.tombstones === 'object') {
      await setSetting('crdtTombstones', payload.tombstones);
    }
    if (Number.isFinite(Number(payload.logicalClock))) {
      await setSetting('crdtLogicalClock', Number(payload.logicalClock));
    }
    return true;
  }

  async function wipeAllUserData(keepCache) {
    await init();
    MEMORY_FALLBACK.travelStatus.clear();
    MEMORY_FALLBACK.customLists.clear();
    MEMORY_FALLBACK.userPhotos.clear();
    MEMORY_FALLBACK.expenses.clear();
    MEMORY_FALLBACK.trips.clear();
    if (db) {
      await Promise.all([
        db.travelStatus.clear(),
        db.customLists.clear(),
        db.userPhotos.clear(),
        db.expenses.clear(),
        db.trips.clear(),
        keepCache ? Promise.resolve() : db.apiCache.clear()
      ]);
    }
  }

  async function getStorageStats() {
    await init();
    const [cacheCount, statusCount, listCount, photoCount, expCount, tripCount] = db
      ? await Promise.all([
          db.apiCache.count(),
          db.travelStatus.count(),
          db.customLists.count(),
          db.userPhotos.count(),
          db.expenses.count(),
          db.trips.count()
        ])
      : [
          MEMORY_FALLBACK.apiCache.size,
          MEMORY_FALLBACK.travelStatus.size,
          MEMORY_FALLBACK.customLists.size,
          MEMORY_FALLBACK.userPhotos.size,
          MEMORY_FALLBACK.expenses.size,
          MEMORY_FALLBACK.trips.size
        ];
    return {
      usingFallback,
      cacheCount,
      statusCount,
      listCount,
      photoCount,
      expCount,
      tripCount
    };
  }

  global.StorageDB = {
    init,
    getCache,
    setCache,
    clearApiCache,
    getWikidata,
    setWikidata,
    getAllWikidataConflicts,
    getTravelStatus,
    getAllTravelStatuses,
    setTravelStatus,
    deleteTravelStatus,
    getCustomLists,
    saveCustomList,
    deleteCustomList,
    getUserPhotos,
    saveUserPhoto,
    deleteUserPhoto,
    getExpenses,
    saveExpense,
    deleteExpense,
    getTrips,
    saveTrip,
    deleteTrip,
    getSetting,
    setSetting,
    exportAllUserData,
    importAllUserData,
    createLocalBackupSnapshot,
    restoreLatestBackupSnapshot,
    wipeAllUserData,
    getStorageStats
  };
})(window);

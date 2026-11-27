(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ProfileCRDT = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const SYNC_TABLES = [
    ['travelStatus', 'destId'],
    ['customLists', 'id'],
    ['trips', 'id'],
    ['expenses', 'id'],
    ['userPhotos', 'id']
  ];

  const LOCAL_ONLY_SETTING_KEYS = new Set([
    'cloudSyncPassphrase',
    'syncPassphrase',
    'apiTokens',
    'openMeteoKey',
    'mapillaryToken',
    'orsApiKey',
    'preSyncBackup',
    'legacyFavMigrated',
    'crdtTombstones',
    'crdtLogicalClock',
    'perfTier'
  ]);

  const TRAVEL_STATUS_FIELDS = ['status', 'notes', 'rating', 'visitedAt'];
  const TRAVEL_STATUS_DEFAULTS = {
    status: '',
    notes: '',
    rating: 0,
    visitedAt: ''
  };

  function canonicalJson(val) {
    if (val === undefined) return 'null';
    if (val === null || typeof val !== 'object') return JSON.stringify(val);
    if (Array.isArray(val)) return '[' + val.map(canonicalJson).join(',') + ']';
    const keys = Object.keys(val).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(val[k])).join(',') + '}';
  }

  function recordStamp(rec) {
    if (!rec || typeof rec !== 'object') return 0;
    const wall = Number(rec.updatedAt || rec.takenAt || rec.createdAt || 0) || 0;
    return wall;
  }

  function recordClock(rec) {
    if (!rec || typeof rec !== 'object') return 0;
    return Number(rec.clock || 0) || 0;
  }

  function compareRecordOrder(a, b) {
    const tsA = recordStamp(a);
    const tsB = recordStamp(b);
    if (tsA !== tsB) return tsA > tsB ? 1 : -1;
    const clkA = recordClock(a);
    const clkB = recordClock(b);
    if (clkA !== clkB) return clkA > clkB ? 1 : -1;
    const ca = canonicalJson(a || {});
    const cb = canonicalJson(b || {});
    if (ca === cb) return 0;
    return ca > cb ? 1 : -1;
  }

  function tieBreakCompare(a, b) {
    return compareRecordOrder(a, b) >= 0 ? a : b;
  }

  function emptyTombstones() {
    return {
      travelStatus: {},
      customLists: {},
      trips: {},
      expenses: {},
      userPhotos: {}
    };
  }

  function normalizeTombstones(raw) {
    const out = emptyTombstones();
    if (!raw || typeof raw !== 'object') return out;
    for (let i = 0; i < SYNC_TABLES.length; i++) {
      const table = SYNC_TABLES[i][0];
      const src = raw[table];
      if (!src || typeof src !== 'object') continue;
      Object.keys(src).forEach((id) => {
        const ts = Number(src[id]) || 0;
        if (ts > 0) out[table][String(id)] = ts;
      });
    }
    return out;
  }

  function mergeTombstones(localTombs, remoteTombs) {
    const a = normalizeTombstones(localTombs);
    const b = normalizeTombstones(remoteTombs);
    const out = emptyTombstones();
    for (let i = 0; i < SYNC_TABLES.length; i++) {
      const table = SYNC_TABLES[i][0];
      const keys = new Set([...Object.keys(a[table]), ...Object.keys(b[table])]);
      keys.forEach((k) => {
        const ts = Math.max(Number(a[table][k] || 0), Number(b[table][k] || 0));
        if (ts > 0) out[table][k] = ts;
      });
    }
    return out;
  }

  /**
   * Canonicalize a travelStatus record so legacy records without fieldUpdatedAt
   * and field-stamped records obey strict semilattice symmetry.
   */
  function normalizeTravelStatusRecord(rec) {
    if (!rec || typeof rec !== 'object') return rec;
    const baseTs = recordStamp(rec);
    const srcFields = rec.fieldUpdatedAt && typeof rec.fieldUpdatedAt === 'object' ? rec.fieldUpdatedAt : {};
    const fieldUpdatedAt = {};
    const out = Object.assign({}, rec);

    let maxFieldTs = baseTs;
    for (let i = 0; i < TRAVEL_STATUS_FIELDS.length; i++) {
      const f = TRAVEL_STATUS_FIELDS[i];
      const hasVal = rec[f] !== undefined;
      const hasExplicit = Object.prototype.hasOwnProperty.call(srcFields, f) && Number.isFinite(Number(srcFields[f]));
      const ts = hasExplicit ? Math.max(0, Number(srcFields[f])) : (hasVal ? baseTs : 0);
      fieldUpdatedAt[f] = ts;
      if (ts > maxFieldTs) maxFieldTs = ts;
      out[f] = hasVal ? rec[f] : TRAVEL_STATUS_DEFAULTS[f];
    }

    out.fieldUpdatedAt = fieldUpdatedAt;
    out.updatedAt = maxFieldTs;
    out.clock = recordClock(rec);
    return out;
  }

  function mergeTravelStatusRecord(lItem, rItem) {
    const a = normalizeTravelStatusRecord(lItem);
    const b = normalizeTravelStatusRecord(rItem);
    const winner = compareRecordOrder(b, a) >= 0 ? b : a;
    const merged = Object.assign({}, winner);
    const mergedFieldStamps = {};

    for (let i = 0; i < TRAVEL_STATUS_FIELDS.length; i++) {
      const f = TRAVEL_STATUS_FIELDS[i];
      const lTs = Number(a.fieldUpdatedAt[f] || 0);
      const rTs = Number(b.fieldUpdatedAt[f] || 0);

      if (rTs > lTs) {
        merged[f] = b[f];
        mergedFieldStamps[f] = rTs;
      } else if (lTs > rTs) {
        merged[f] = a[f];
        mergedFieldStamps[f] = lTs;
      } else {
        const ca = canonicalJson(a[f]);
        const cb = canonicalJson(b[f]);
        merged[f] = cb > ca ? b[f] : a[f];
        mergedFieldStamps[f] = Math.max(lTs, rTs);
      }
    }

    merged.fieldUpdatedAt = mergedFieldStamps;
    merged.updatedAt = Math.max(recordStamp(a), recordStamp(b), ...Object.values(mergedFieldStamps));
    merged.clock = recordClock(winner);
    return merged;
  }

  function applyTombstoneToTravelStatus(item, delTs) {
    if (!delTs || delTs <= 0) return item;
    if (delTs >= recordStamp(item)) return null;
    const out = Object.assign({}, item);
    const nextFields = Object.assign({}, item.fieldUpdatedAt || {});
    for (let i = 0; i < TRAVEL_STATUS_FIELDS.length; i++) {
      const f = TRAVEL_STATUS_FIELDS[i];
      if ((Number(nextFields[f]) || 0) <= delTs) {
        out[f] = TRAVEL_STATUS_DEFAULTS[f];
        nextFields[f] = 0;
      }
    }
    out.fieldUpdatedAt = nextFields;
    return out;
  }

  function mergeArrayByKey(localArr, remoteArr, keyField, tableTombs, tableName, stats) {
    const map = new Map();
    const aList = Array.isArray(localArr) ? localArr : [];
    const bList = Array.isArray(remoteArr) ? remoteArr : [];
    const tombs = tableTombs || {};

    const prep = (raw, k) => {
      if (tableName !== 'travelStatus') return raw;
      return applyTombstoneToTravelStatus(normalizeTravelStatusRecord(raw), Number(tombs[k] || 0));
    };

    for (let i = 0; i < aList.length; i++) {
      const raw = aList[i];
      if (!raw || raw[keyField] == null) continue;
      const k = String(raw[keyField]);
      const delTs = Number(tombs[k] || 0);
      const item = prep(raw, k);
      if (!item || delTs >= recordStamp(item)) {
        if (stats) stats.deletedByTombstone++;
        continue;
      }
      if (!map.has(k)) {
        map.set(k, item);
      } else {
        const existing = map.get(k);
        map.set(k, tableName === 'travelStatus' ? mergeTravelStatusRecord(existing, item) : tieBreakCompare(existing, item));
      }
    }

    for (let i = 0; i < bList.length; i++) {
      const raw = bList[i];
      if (!raw || raw[keyField] == null) continue;
      const k = String(raw[keyField]);
      const delTs = Number(tombs[k] || 0);
      const rItem = prep(raw, k);
      if (!rItem || delTs >= recordStamp(rItem)) {
        if (stats) stats.deletedByTombstone++;
        continue;
      }
      if (!map.has(k)) {
        map.set(k, rItem);
        if (stats) stats.addedFromRemote++;
      } else {
        const lItem = map.get(k);
        if (tableName === 'travelStatus') {
          const merged = mergeTravelStatusRecord(lItem, rItem);
          const changed = canonicalJson(merged) !== canonicalJson(lItem);
          map.set(k, merged);
          if (stats) {
            if (changed) stats.conflictsResolved++;
            else stats.keptLocal++;
          }
        } else {
          const cmp = compareRecordOrder(rItem, lItem);
          if (cmp > 0) {
            map.set(k, rItem);
            if (stats) stats.conflictsResolved++;
          } else if (stats) {
            stats.keptLocal++;
          }
        }
      }
    }

    return Array.from(map.values()).sort((x, y) => String(x[keyField]).localeCompare(String(y[keyField])));
  }

  function mergeSettings(localArr, remoteArr) {
    const map = new Map();
    const listA = Array.isArray(localArr) ? localArr : [];
    const listB = Array.isArray(remoteArr) ? remoteArr : [];

    const ingest = (list) => {
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (!s || !s.key || LOCAL_ONLY_SETTING_KEYS.has(s.key)) continue;
        if (!map.has(s.key)) {
          map.set(s.key, s);
        } else {
          map.set(s.key, tieBreakCompare(map.get(s.key), s));
        }
      }
    };

    ingest(listA);
    ingest(listB);
    return Array.from(map.values()).sort((x, y) => String(x.key).localeCompare(String(y.key)));
  }

  /**
   * Strip sensitive or local-only settings before exporting/syncing to cloud or JSON files.
   */
  function sanitizeProfileForSync(profile) {
    const src = profile && typeof profile === 'object' ? profile : {};
    const cloned = Object.assign({}, src);
    if (Array.isArray(src.settings)) {
      cloned.settings = src.settings
        .filter((s) => s && s.key && !LOCAL_ONLY_SETTING_KEYS.has(s.key))
        .sort((x, y) => String(x.key).localeCompare(String(y.key)));
    }
    cloned.tombstones = normalizeTombstones(src.tombstones);
    return cloned;
  }

  /**
   * Commutative, associative, idempotent join-semilattice CRDT merge with deletion tombstones,
   * monotone logical clock join (increment happens ONLY on local write events), field-level
   * travelStatus merging, and strict secret isolation.
   */
  function mergeUserProfiles(localProfile, remoteProfile) {
    const local = localProfile && typeof localProfile === 'object' ? localProfile : {};
    const remote = remoteProfile && typeof remoteProfile === 'object' ? remoteProfile : {};
    const stats = { addedFromRemote: 0, keptLocal: 0, conflictsResolved: 0, deletedByTombstone: 0 };

    const tombstones = mergeTombstones(local.tombstones, remote.tombstones);
    const localClock = Number(local.logicalClock || 0) || 0;
    const remoteClock = Number(remote.logicalClock || 0) || 0;
    const logicalClock = Math.max(localClock, remoteClock);

    const merged = {
      schemaVersion: '4.5.0',
      logicalClock,
      tombstones,
      travelStatus: mergeArrayByKey(local.travelStatus, remote.travelStatus, 'destId', tombstones.travelStatus, 'travelStatus', stats),
      customLists: mergeArrayByKey(local.customLists, remote.customLists, 'id', tombstones.customLists, 'customLists', stats),
      trips: mergeArrayByKey(local.trips, remote.trips, 'id', tombstones.trips, 'trips', stats),
      expenses: mergeArrayByKey(local.expenses, remote.expenses, 'id', tombstones.expenses, 'expenses', stats),
      userPhotos: mergeArrayByKey(local.userPhotos, remote.userPhotos, 'id', tombstones.userPhotos, 'userPhotos', stats),
      settings: mergeSettings(local.settings, remote.settings)
    };

    return { merged, stats };
  }

  return {
    LOCAL_ONLY_SETTING_KEYS,
    sanitizeProfileForSync,
    mergeUserProfiles
  };
});

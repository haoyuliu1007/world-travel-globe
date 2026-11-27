(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ProfileCRDT = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function recordStamp(rec) {
    if (!rec || typeof rec !== 'object') return 0;
    return Number(rec.updatedAt || rec.takenAt || rec.createdAt || 0) || 0;
  }

  function tieBreakCompare(a, b) {
    const sa = JSON.stringify(a || {});
    const sb = JSON.stringify(b || {});
    return sa >= sb ? a : b;
  }

  function mergeArrayByKey(localArr, remoteArr, keyField, stats) {
    const map = new Map();
    const aList = Array.isArray(localArr) ? localArr : [];
    const bList = Array.isArray(remoteArr) ? remoteArr : [];

    for (let i = 0; i < aList.length; i++) {
      const item = aList[i];
      if (!item || item[keyField] == null) continue;
      map.set(String(item[keyField]), item);
    }

    for (let i = 0; i < bList.length; i++) {
      const rItem = bList[i];
      if (!rItem || rItem[keyField] == null) continue;
      const k = String(rItem[keyField]);
      if (!map.has(k)) {
        map.set(k, rItem);
        if (stats) stats.addedFromRemote++;
      } else {
        const lItem = map.get(k);
        const lTs = recordStamp(lItem);
        const rTs = recordStamp(rItem);
        if (rTs > lTs) {
          map.set(k, rItem);
          if (stats) stats.conflictsResolved++;
        } else if (rTs === lTs && JSON.stringify(lItem) !== JSON.stringify(rItem)) {
          map.set(k, tieBreakCompare(lItem, rItem));
          if (stats) stats.conflictsResolved++;
        } else if (stats) {
          stats.keptLocal++;
        }
      }
    }

    return Array.from(map.values()).sort((x, y) => String(x[keyField]).localeCompare(String(y[keyField])));
  }

  function mergeSettings(localArr, remoteArr) {
    const map = new Map();
    const listA = Array.isArray(localArr) ? localArr : [];
    const listB = Array.isArray(remoteArr) ? remoteArr : [];

    listA.forEach((s) => {
      if (s && s.key) map.set(s.key, s);
    });
    listB.forEach((s) => {
      if (!s || !s.key) return;
      if (!map.has(s.key)) {
        map.set(s.key, s);
      } else if (s.key !== 'cloudSyncPassphrase') {
        const cur = map.get(s.key);
        if (recordStamp(s) > recordStamp(cur)) {
          map.set(s.key, s);
        }
      }
    });
    return Array.from(map.values()).sort((x, y) => String(x.key).localeCompare(String(y.key)));
  }

  /**
   * Commutative, idempotent LWW-Element-Set CRDT merge across multi-device profiles.
   */
  function mergeUserProfiles(localProfile, remoteProfile) {
    const local = localProfile && typeof localProfile === 'object' ? localProfile : {};
    const remote = remoteProfile && typeof remoteProfile === 'object' ? remoteProfile : {};
    const stats = { addedFromRemote: 0, keptLocal: 0, conflictsResolved: 0 };

    const merged = {
      schemaVersion: Math.max(Number(local.schemaVersion || 1), Number(remote.schemaVersion || 1)),
      exportedAt: new Date().toISOString(),
      travelStatus: mergeArrayByKey(local.travelStatus, remote.travelStatus, 'destId', stats),
      customLists: mergeArrayByKey(local.customLists, remote.customLists, 'id', stats),
      trips: mergeArrayByKey(local.trips, remote.trips, 'id', stats),
      expenses: mergeArrayByKey(local.expenses, remote.expenses, 'id', stats),
      userPhotos: mergeArrayByKey(local.userPhotos, remote.userPhotos, 'id', stats),
      settings: mergeSettings(local.settings, remote.settings)
    };

    return { merged, stats };
  }

  return {
    mergeUserProfiles
  };
});

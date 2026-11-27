(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    let tzLookupDep = null;
    try {
      tzLookupDep = require('../../vendor/tz-lookup.min.js');
    } catch (e) {
      try {
        tzLookupDep = require('tz-lookup');
      } catch (e2) {
        tzLookupDep = null;
      }
    }
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root, tzLookupDep);
  } else {
    root.TimezoneService = factory(root, root.tzlookup || null);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global, initialTzLookup) {
  'use strict';

  const dtfCache = new Map();

  function getTzLookupFn() {
    if (typeof initialTzLookup === 'function') return initialTzLookup;
    if (global && typeof global.tzlookup === 'function') return global.tzlookup;
    return null;
  }

  function formatUtcOffset(offsetMin) {
    const m = Math.round(Number(offsetMin) || 0);
    const sign = m >= 0 ? '+' : '-';
    const abs = Math.abs(m);
    const hrs = Math.floor(abs / 60);
    const rem = abs % 60;
    return rem ? `UTC${sign}${hrs}:${String(rem).padStart(2, '0')}` : `UTC${sign}${hrs}`;
  }

  function estimateLongitudeOffsetMinutes(lng) {
    const clampedLng = Math.max(-180, Math.min(180, Number(lng) || 0));
    return Math.max(-720, Math.min(840, Math.round(clampedLng / 15) * 60));
  }

  function resolveTimeZone(lat, lng) {
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
    const fn = getTzLookupFn();
    if (!fn) return null;
    try {
      const iana = fn(Number(lat), Number(lng));
      return typeof iana === 'string' && iana.length > 0 ? iana : null;
    } catch (e) {
      return null;
    }
  }

  function getFormatter(timeZone) {
    if (dtfCache.has(timeZone)) return dtfCache.get(timeZone);
    if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') return null;
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      });
      dtfCache.set(timeZone, fmt);
      return fmt;
    } catch (e) {
      return null;
    }
  }

  function partsOffsetMinutesAtUtc(fmt, utcMs) {
    const parts = fmt.formatToParts(new Date(utcMs));
    const map = {};
    for (let i = 0; i < parts.length; i++) {
      map[parts[i].type] = parts[i].value;
    }
    const y = Number(map.year);
    const m = Number(map.month);
    const d = Number(map.day);
    const hh = Number(map.hour) % 24;
    const mm = Number(map.minute);
    const ss = Number(map.second);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    const zonedAsUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
    return Math.round((zonedAsUtc - utcMs) / 60000);
  }

  /**
   * Compute the exact UTC offset in minutes for an IANA timeZone on the given
   * local date (YYYY-MM-DD) and wall-clock minutes, accurately resolving DST,
   * half-hour zones (+5:30/+9:30), 45-min zones (+5:45), and date-line zones (+13).
   */
  function getUtcOffsetMinutesForDate(timeZone, dateStr, minutes) {
    if (!timeZone) return null;
    const fmt = getFormatter(timeZone);
    if (!fmt) return null;
    try {
      const p = String(dateStr || '').split('-').map(Number);
      const yr = Number.isFinite(p[0]) && p[0] > 0 ? p[0] : 2026;
      const mo = Number.isFinite(p[1]) && p[1] >= 1 ? p[1] - 1 : 5;
      const dy = Number.isFinite(p[2]) && p[2] >= 1 ? p[2] : 21;
      const wallMin = Number.isFinite(Number(minutes)) ? Number(minutes) : 720;

      // Two-pass fixed-point iteration converts wall-clock local time -> exact UTC instant
      const wallUtcGuessMs = Date.UTC(yr, mo, dy, 0, wallMin, 0);
      const off1 = partsOffsetMinutesAtUtc(fmt, wallUtcGuessMs);
      if (off1 === null) return null;
      const refinedUtcMs = wallUtcGuessMs - off1 * 60000;
      const off2 = partsOffsetMinutesAtUtc(fmt, refinedUtcMs);
      return off2 !== null ? off2 : off1;
    } catch (e) {
      return null;
    }
  }

  function detectIsDst(timeZone, dateStr, offsetMin) {
    if (!timeZone || !Number.isFinite(offsetMin)) return false;
    const yr = String(dateStr || '2026-06-21').split('-')[0] || '2026';
    const jan = getUtcOffsetMinutesForDate(timeZone, `${yr}-01-15`, 720);
    const jul = getUtcOffsetMinutesForDate(timeZone, `${yr}-07-15`, 720);
    if (!Number.isFinite(jan) || !Number.isFinite(jul) || jan === jul) return false;
    return offsetMin === Math.max(jan, jul);
  }

  function resolveOffsetForLocationDate(lat, lng, dateStr, minutes) {
    const iana = resolveTimeZone(lat, lng);
    if (iana) {
      const offsetMin = getUtcOffsetMinutesForDate(iana, dateStr, minutes);
      if (Number.isFinite(offsetMin)) {
        const isDst = detectIsDst(iana, dateStr, offsetMin);
        const offsetText = formatUtcOffset(offsetMin);
        return {
          iana,
          offsetMin,
          isDst,
          source: 'iana',
          utcOffsetLabel: `${offsetText}${isDst ? ' DST' : ''}`,
          displayLabel: `${iana} · ${offsetText}${isDst ? ' DST' : ''}`
        };
      }
    }
    const estMin = estimateLongitudeOffsetMinutes(lng);
    const offsetText = formatUtcOffset(estMin);
    return {
      iana: null,
      offsetMin: estMin,
      isDst: false,
      source: 'longitude_fallback',
      utcOffsetLabel: offsetText,
      displayLabel: `Est. ${offsetText}`
    };
  }

  return {
    resolveTimeZone,
    getUtcOffsetMinutesForDate,
    estimateLongitudeOffsetMinutes,
    formatUtcOffset,
    resolveOffsetForLocationDate
  };
});

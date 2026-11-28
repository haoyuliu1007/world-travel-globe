(function (global) {
  'use strict';

  const THIRTY_MIN_MS = 30 * 60 * 1000;
  const TEN_MIN_MS = 10 * 60 * 1000;
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  const WMO_LABELS = {
    0: '晴朗',
    1: '大部晴朗',
    2: '局部多云',
    3: '阴天',
    45: '雾',
    48: '冻雾',
    51: '小毛雨',
    53: '中毛雨',
    55: '密毛雨',
    61: '小雨',
    63: '中雨',
    65: '大雨',
    66: '冻雨',
    67: '强冻雨',
    71: '小雪',
    73: '中雪',
    75: '大雪',
    77: '雪粒',
    80: '阵雨',
    81: '中阵雨',
    82: '强阵雨',
    85: '阵雪',
    86: '强阵雪',
    95: '雷暴',
    96: '雷暴伴冰雹',
    99: '强雷暴伴冰雹'
  };

  const WMO_LABELS_EN = {
    0: 'Clear',
    1: 'Mostly Clear',
    2: 'Partly Cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Rime Fog',
    51: 'Light Drizzle',
    53: 'Drizzle',
    55: 'Dense Drizzle',
    61: 'Light Rain',
    63: 'Rain',
    65: 'Heavy Rain',
    66: 'Freezing Rain',
    67: 'Heavy Freezing Rain',
    71: 'Light Snow',
    73: 'Snow',
    75: 'Heavy Snow',
    77: 'Snow Grains',
    80: 'Rain Showers',
    81: 'Moderate Showers',
    82: 'Heavy Showers',
    85: 'Snow Showers',
    86: 'Heavy Snow Showers',
    95: 'Thunderstorm',
    96: 'Storm + Hail',
    99: 'Severe Hailstorm'
  };

  function getLang() {
    return global.AppI18n && typeof global.AppI18n.getLang === 'function' ? global.AppI18n.getLang() : 'zh-CN';
  }

  function L(zh, en) {
    const lang = getLang();
    if (lang === 'en') return en;
    if (lang === 'zh-TW' && global.AppI18n && typeof global.AppI18n.toTraditional === 'function') {
      return global.AppI18n.toTraditional(zh);
    }
    return zh;
  }

  function describeWmoCode(code) {
    const n = Number(code);
    if (getLang() === 'en') return WMO_LABELS_EN[n] || `WMO ${code}`;
    const zh = WMO_LABELS[n];
    return zh ? L(zh, WMO_LABELS_EN[n] || zh) : `WMO ${code}`;
  }

  async function requestWeatherEndpoint(base, params, cacheKey, ttlMs, sourceName, opts) {
    const Api = global.ApiClient;
    const caps = Api ? await Api.detectWorkerCapabilities() : { available: false };
    const qs = new URLSearchParams(params).toString();
    const directUrl = `${base}?${qs}`;
    const url =
      caps && caps.available && caps.features && caps.features.weather
        ? `/api/weather?endpoint=${encodeURIComponent(base)}&${qs}`
        : directUrl;

    if (Api) {
      return Api.fetchJson(url, {
        cacheKey,
        ttlMs,
        source: sourceName || 'Open-Meteo',
        timeoutMs: 11000,
        signal: opts && opts.signal
      });
    }
    const res = await fetch(url, { signal: opts && opts.signal });
    return res.json();
  }

  async function fetchLiveWeather(lat, lng, opts) {
    const la = Number(lat).toFixed(3);
    const lo = Number(lng).toFixed(3);
    const cacheKey = `om:live:${la},${lo}`;
    return requestWeatherEndpoint(
      'https://api.open-meteo.com/v1/forecast',
      {
        latitude: la,
        longitude: lo,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,cloud_cover,wind_speed_10m',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunshine_duration,snowfall_sum',
        hourly: 'temperature_2m,cloud_cover,precipitation_probability,visibility',
        timezone: 'auto',
        forecast_days: '7'
      },
      cacheKey,
      THIRTY_MIN_MS,
      'Open-Meteo Forecast',
      opts
    );
  }

  function aggregateArchiveToMonthly(raw) {
    const daily = raw && raw.daily;
    if (!daily || !Array.isArray(daily.time)) return [];
    const buckets = Array.from({ length: 12 }, () => ({
      n: 0,
      tMinSum: 0,
      tMaxSum: 0,
      tMeanSum: 0,
      precipSum: 0,
      snowDays: 0,
      rainDays: 0,
      clearDays: 0,
      sunHoursSum: 0,
      years: new Set()
    }));

    for (let i = 0; i < daily.time.length; i++) {
      const dateStr = String(daily.time[i] || '');
      const parts = dateStr.split('-');
      if (parts.length < 2) continue;
      const year = parts[0];
      const mIdx = Number(parts[1]) - 1;
      if (mIdx < 0 || mIdx > 11) continue;

      const b = buckets[mIdx];
      const tMin = Number(daily.temperature_2m_min && daily.temperature_2m_min[i]);
      const tMax = Number(daily.temperature_2m_max && daily.temperature_2m_max[i]);
      const tMean = Number(daily.temperature_2m_mean && daily.temperature_2m_mean[i]);
      const precip = Number((daily.precipitation_sum && daily.precipitation_sum[i]) || 0);
      const snow = Number((daily.snowfall_sum && daily.snowfall_sum[i]) || 0);
      const sunSec = Number((daily.sunshine_duration && daily.sunshine_duration[i]) || 0);

      if (!Number.isFinite(tMean)) continue;
      b.n++;
      b.years.add(year);
      b.tMinSum += Number.isFinite(tMin) ? tMin : tMean;
      b.tMaxSum += Number.isFinite(tMax) ? tMax : tMean;
      b.tMeanSum += tMean;
      b.precipSum += Number.isFinite(precip) ? precip : 0;
      if (precip >= 1.0) b.rainDays++;
      if (snow >= 0.2) b.snowDays++;
      const sunH = sunSec / 3600;
      b.sunHoursSum += sunH;
      if (precip < 0.5 && sunH >= 5.5) b.clearDays++;
    }

    return buckets.map((b, idx) => {
      const n = Math.max(1, b.n);
      const yrCount = Math.max(1, b.years.size);
      return {
        month: idx + 1,
        tempMin: Number((b.tMinSum / n).toFixed(1)),
        tempMax: Number((b.tMaxSum / n).toFixed(1)),
        tempMean: Number((b.tMeanSum / n).toFixed(1)),
        precipMm: Math.round(b.precipSum / yrCount),
        rainProbPct: Math.round((b.rainDays / n) * 100),
        snowProbPct: Math.round((b.snowDays / n) * 100),
        clearProbPct: Math.round((b.clearDays / n) * 100),
        sunshineHours: Math.round(b.sunHoursSum / yrCount),
        sampleDays: b.n
      };
    });
  }

  async function fetchMonthlyClimate(lat, lng) {
    const la = Number(lat).toFixed(2);
    const lo = Number(lng).toFixed(2);
    const cacheKey = `om:climate5y:${la},${lo}`;
    if (global.StorageDB) {
      const hit = await global.StorageDB.getCache(cacheKey);
      if (hit && Array.isArray(hit.data) && hit.data.length === 12) return hit.data;
    }

    const raw = await requestWeatherEndpoint(
      'https://archive-api.open-meteo.com/v1/archive',
      {
        latitude: la,
        longitude: lo,
        start_date: '2020-01-01',
        end_date: '2024-12-31',
        daily: 'temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,snowfall_sum,sunshine_duration',
        timezone: 'UTC'
      },
      `om:archive_raw:${la},${lo}`,
      THIRTY_DAYS_MS,
      'Open-Meteo ERA5 Reanalysis'
    );

    const monthly = aggregateArchiveToMonthly(raw);
    if (global.StorageDB && monthly.length === 12) {
      await global.StorageDB.setCache(cacheKey, monthly, THIRTY_DAYS_MS, 'Open-Meteo ERA5 (2020-2024)');
    }
    return monthly;
  }

  async function fetchAirQuality(lat, lng) {
    const la = Number(lat).toFixed(2);
    const lo = Number(lng).toFixed(2);
    const cacheKey = `om:aq:${la},${lo}`;
    return requestWeatherEndpoint(
      'https://air-quality-api.open-meteo.com/v1/air-quality',
      {
        latitude: la,
        longitude: lo,
        current: 'us_aqi,european_aqi,pm2_5,pm10,uv_index,alder_pollen,birch_pollen,grass_pollen,ragweed_pollen',
        timezone: 'auto'
      },
      cacheKey,
      THIRTY_MIN_MS,
      'Open-Meteo Air Quality'
    );
  }

  function classifyAirQuality(aqRaw) {
    const cur = (aqRaw && aqRaw.current) || aqRaw || {};
    const aqi = Number(cur.us_aqi);
    const pm25 = Number(cur.pm2_5);
    const uv = Number(cur.uv_index);
    const pollens = [
      Number(cur.alder_pollen),
      Number(cur.birch_pollen),
      Number(cur.grass_pollen),
      Number(cur.ragweed_pollen)
    ].filter(Number.isFinite);
    const peakPollen = pollens.length ? Math.max(...pollens) : null;

    let aqiLevel = L('通透优', 'Crystal Clear');
    let aqiColor = '#34D399';
    if (!Number.isFinite(aqi)) {
      aqiLevel = '--';
      aqiColor = '#A1A1AA';
    } else if (aqi > 150) {
      aqiLevel = L('雾霾强遮蔽', 'Heavy Haze');
      aqiColor = '#FB7185';
    } else if (aqi > 100) {
      aqiLevel = L('轻度灰霾', 'Light Haze');
      aqiColor = '#F59E0B';
    } else if (aqi > 50) {
      aqiLevel = L('良好通透', 'Good Clarity');
      aqiColor = '#38BDF8';
    }

    let uvLevel = '--';
    if (Number.isFinite(uv)) {
      uvLevel = uv >= 8 ? L('极强防晒', 'Very High UV') : uv >= 5 ? L('中等强', 'High UV') : uv >= 2 ? L('适中', 'Moderate') : L('微弱', 'Low');
    }

    let pollenLabel = L('无显著花粉', 'No Pollen Data');
    if (peakPollen !== null) {
      pollenLabel = peakPollen >= 50 ? L('花粉偏高', 'High Pollen') : peakPollen >= 10 ? L('轻度花粉', 'Moderate Pollen') : L('低花粉', 'Low Pollen');
    }

    return {
      aqi: Number.isFinite(aqi) ? Math.round(aqi) : null,
      aqiLevel,
      aqiColor,
      pm25: Number.isFinite(pm25) ? Number(pm25.toFixed(1)) : null,
      uv: Number.isFinite(uv) ? Number(uv.toFixed(1)) : null,
      uvLevel,
      peakPollen: peakPollen !== null ? Math.round(peakPollen) : null,
      pollenLabel
    };
  }

  async function fetchRainViewerMeta() {
    const Api = global.ApiClient;
    const url = 'https://api.rainviewer.com/public/weather-maps.json';
    if (Api) {
      return Api.fetchJson(url, {
        cacheKey: 'rainviewer:maps',
        ttlMs: TEN_MIN_MS,
        source: 'RainViewer Public API',
        timeoutMs: 8000
      });
    }
    const res = await fetch(url);
    return res.json();
  }

  const api = {
    describeWmoCode,
    fetchLiveWeather,
    fetchMonthlyClimate,
    fetchAirQuality,
    classifyAirQuality,
    fetchRainViewerMeta
  };

  global.WeatherService = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

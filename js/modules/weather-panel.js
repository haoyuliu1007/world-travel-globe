(function (global) {
  'use strict';

  let activeChart = null;
  let globalWeatherMode = 'off'; // 'off' | 'radar' | 'clouds'

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function icon(name, size) {
    return global.AppIcons ? global.AppIcons.svg(name, size || 14) : '';
  }

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

  const MONTH_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  async function renderClimateChart(chartEl, monthly, chartTab) {
    if (!chartEl || !Array.isArray(monthly) || !monthly.length) return;
    if (!global.LazyLoader) return;
    try {
      const echarts = await global.LazyLoader.ensureECharts();
      if (!document.body.contains(chartEl)) return;
      if (activeChart && activeChart.getDom && activeChart.getDom() !== chartEl) {
        activeChart.dispose();
        activeChart = null;
      }
      if (!activeChart) {
        activeChart = echarts.init(chartEl);
      }

      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const textCol = isLight ? '#52525B' : '#A1A1AA';
      const gridCol = isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)';
      const months = monthly.map((m) => (getLang() === 'en' ? (MONTH_SHORT_EN[m.month - 1] || `M${m.month}`) : L(`${m.month}月`, `M${m.month}`)));

      let option;
      if (chartTab === 'probs') {
        const sClear = L('晴天率%', 'Clear %');
        const sRain = L('降雨率%', 'Rain %');
        const sSnow = L('降雪率%', 'Snow %');
        option = {
          backgroundColor: 'transparent',
          tooltip: { trigger: 'axis' },
          legend: { data: [sClear, sRain, sSnow], textStyle: { color: textCol, fontSize: 10 }, top: 0 },
          grid: { left: 34, right: 12, top: 32, bottom: 24 },
          xAxis: { type: 'category', data: months, axisLabel: { color: textCol, fontSize: 10 } },
          yAxis: { type: 'value', max: 100, axisLabel: { color: textCol, fontSize: 10, formatter: '{value}%' }, splitLine: { lineStyle: { color: gridCol } } },
          series: [
            { name: sClear, type: 'line', smooth: true, data: monthly.map((m) => m.clearProbPct), itemStyle: { color: '#FBBF24' } },
            { name: sRain, type: 'bar', data: monthly.map((m) => m.rainProbPct), itemStyle: { color: '#38BDF8' } },
            { name: sSnow, type: 'bar', data: monthly.map((m) => m.snowProbPct), itemStyle: { color: '#E2E8F0' } }
          ]
        };
      } else {
        const sHigh = L('高温°C', 'High °C');
        const sLow = L('低温°C', 'Low °C');
        const sPrecip = L('降水mm', 'Precip mm');
        option = {
          backgroundColor: 'transparent',
          tooltip: { trigger: 'axis' },
          legend: { data: [sHigh, sLow, sPrecip], textStyle: { color: textCol, fontSize: 10 }, top: 0 },
          grid: { left: 34, right: 36, top: 32, bottom: 24 },
          xAxis: { type: 'category', data: months, axisLabel: { color: textCol, fontSize: 10 } },
          yAxis: [
            { type: 'value', axisLabel: { color: textCol, fontSize: 10, formatter: '{value}°' }, splitLine: { lineStyle: { color: gridCol } } },
            { type: 'value', axisLabel: { color: textCol, fontSize: 10, formatter: '{value}mm' }, splitLine: { show: false } }
          ],
          series: [
            { name: sHigh, type: 'line', smooth: true, data: monthly.map((m) => m.tempMax), itemStyle: { color: '#FB923C' } },
            { name: sLow, type: 'line', smooth: true, data: monthly.map((m) => m.tempMin), itemStyle: { color: '#60A5FA' } },
            { name: sPrecip, type: 'bar', yAxisIndex: 1, data: monthly.map((m) => m.precipMm), itemStyle: { color: 'rgba(56,189,248,0.55)' } }
          ]
        };
      }
      activeChart.setOption(option, true);
    } catch (e) {
      chartEl.innerHTML = `<div style="padding:18px;color:var(--text-muted);font-size:11.5px;">${esc(L('图表引擎加载失败，请检查离线状态。', 'Failed to load climate chart engine offline.'))}</div>`;
    }
  }

  async function mount(dest, containerEl) {
    if (!dest || !containerEl || !global.WeatherService) return;
    if (!Array.isArray(dest.coords) || dest.coords.length < 2) return;

    const [lng, lat] = dest.coords;
    containerEl.innerHTML = `
      <div class="live-weather-card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${icon('cloud', 14)} ${esc(L('实时气象与气候统计', 'Live Weather & Climate Stats'))}</strong>
          <span class="source-tag realtime">${esc(L('Open-Meteo 实时载入中…', 'Loading Open-Meteo…'))}</span>
        </div>
        <div class="media-skeleton" style="margin-top:8px;height:68px;"></div>
      </div>
    `;

    let live = null;
    let monthly = null;
    let airQuality = null;
    let liveErr = null;

    await Promise.all([
      global.WeatherService.fetchLiveWeather(lat, lng)
        .then((d) => { live = d; })
        .catch((e) => { liveErr = e; }),
      global.WeatherService.fetchMonthlyClimate(lat, lng)
        .then((d) => { monthly = d; })
        .catch(() => {}),
      typeof global.WeatherService.fetchAirQuality === 'function'
        ? global.WeatherService.fetchAirQuality(lat, lng)
            .then((d) => { airQuality = d; })
            .catch(() => {})
        : Promise.resolve()
    ]);

    if (!document.body.contains(containerEl)) return;

    if (!live && (!monthly || !monthly.length)) {
      containerEl.innerHTML = `
        <div class="live-weather-card">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>${icon('cloud', 14)} ${esc(L('实时气象暂不可用', 'Live Weather Unavailable'))}</strong>
            <span class="source-tag empirical">${esc(L('已降级展示本地档案气候指南', 'Showing Local Archive Guide'))}</span>
          </div>
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">${esc(liveErr && liveErr.message ? liveErr.message : L('当前网络或 API 限流不可达，下方继续展示完整季节与装备建议。', 'Network or API rate limit reached; curated seasonal and gear advice shown below.'))}</div>
        </div>
      `;
      return;
    }

    const cur = (live && live.current) || {};
    const daily = (live && live.daily) || {};
    const daysCount = Array.isArray(daily.time) ? Math.min(7, daily.time.length) : 0;
    const aqInfo = airQuality && typeof global.WeatherService.classifyAirQuality === 'function'
      ? global.WeatherService.classifyAirQuality(airQuality)
      : null;
    const aqHtml = aqInfo && (aqInfo.aqi !== null || aqInfo.uv !== null)
      ? `<div class="weather-aq-strip">
          <span>🌫️ US AQI <strong class="mono-num" style="color:${aqInfo.aqiColor};">${aqInfo.aqi ?? '--'}</strong> (${esc(aqInfo.aqiLevel)})</span>
          ${aqInfo.pm25 !== null ? `<span class="mono-num">PM2.5 ${aqInfo.pm25} μg/m³</span>` : ''}
          ${aqInfo.uv !== null ? `<span>☀️ UV <strong class="mono-num">${aqInfo.uv}</strong> (${esc(aqInfo.uvLevel)})</span>` : ''}
          ${aqInfo.peakPollen !== null ? `<span>🌸 ${esc(aqInfo.pollenLabel)}</span>` : ''}
        </div>`
      : '';

    const forecastHtml = daysCount
      ? `<div class="forecast-strip">
          ${Array.from({ length: daysCount }, (_, i) => {
            const dt = String(daily.time[i] || '').slice(5);
            const tMax = Math.round(daily.temperature_2m_max[i]);
            const tMin = Math.round(daily.temperature_2m_min[i]);
            const pop = daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : 0;
            const wLabel = global.WeatherService.describeWmoCode(daily.weather_code[i]);
            return `
              <div class="forecast-day" title="${esc(wLabel)}">
                <div class="mono-num" style="color:var(--text-muted);">${esc(dt)}</div>
                <div style="margin:3px 0;font-weight:500;">${esc(wLabel)}</div>
                <div class="mono-num">${tMin}°/${tMax}°</div>
                <div class="mono-num" style="color:#38BDF8;font-size:10px;">💧${pop ?? 0}%</div>
              </div>
            `;
          }).join('')}
        </div>`
      : '';

    containerEl.innerHTML = `
      <div class="live-weather-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <strong>${icon('sun', 14)} ${esc(L('实况天气', 'Live Weather'))} · ${esc(global.WeatherService.describeWmoCode(cur.weather_code ?? 0))}</strong>
          <span class="source-tag realtime">${esc(L('Open-Meteo 实况与 7 日预报', 'Open-Meteo Live & 7-Day'))}</span>
        </div>
        ${
          live && live.current
            ? `<div class="weather-kpi-grid">
                <div class="weather-kpi"><div class="weather-kpi-label">${esc(L('气温', 'Temp'))}</div><div class="weather-kpi-val mono-num">${cur.temperature_2m ?? '--'}°C</div></div>
                <div class="weather-kpi"><div class="weather-kpi-label">${esc(L('湿度 / 云量', 'Humidity / Cloud'))}</div><div class="weather-kpi-val mono-num">${cur.relative_humidity_2m ?? '--'}% / ${cur.cloud_cover ?? '--'}%</div></div>
                <div class="weather-kpi"><div class="weather-kpi-label">${esc(L('风速', 'Wind'))}</div><div class="weather-kpi-val mono-num">${cur.wind_speed_10m ?? '--'} km/h</div></div>
                <div class="weather-kpi"><div class="weather-kpi-label">${esc(L('降水', 'Precip'))}</div><div class="weather-kpi-val mono-num">${cur.precipitation ?? 0} mm</div></div>
              </div>`
            : ''
        }
        ${aqHtml}
        ${forecastHtml}
        ${
          monthly && monthly.length === 12
            ? `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border-hairline);">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
                  <span style="font-size:12px;font-weight:600;">${esc(L('5 年历史月度气候统计 (2020–2024)', '5-Year Monthly Climate (2020–2024)'))}</span>
                  <div style="display:flex;gap:4px;">
                    <button class="mini-action-pill wx-chart-tab active" data-chart="temp" type="button">${esc(L('温湿降水', 'Temp & Precip'))}</button>
                    <button class="mini-action-pill wx-chart-tab" data-chart="probs" type="button">${esc(L('晴/雨/雪概率', 'Clear / Rain / Snow %'))}</button>
                  </div>
                </div>
                <div class="echarts-box" id="om-climate-echarts"></div>
                <div style="font-size:10.5px;color:var(--text-muted);margin-top:4px;">${esc(L('数据来源：Open-Meteo ERA5 历史再分析 (CC BY 4.0)', 'Source: Open-Meteo ERA5 Reanalysis (CC BY 4.0)'))}</div>
              </div>`
            : ''
        }
      </div>
    `;

    const chartEl = containerEl.querySelector('#om-climate-echarts');
    if (chartEl && monthly && monthly.length === 12) {
      renderClimateChart(chartEl, monthly, 'temp');
      containerEl.querySelectorAll('.wx-chart-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
          containerEl.querySelectorAll('.wx-chart-tab').forEach((b) => b.classList.toggle('active', b === btn));
          renderClimateChart(chartEl, monthly, btn.dataset.chart);
        });
      });
    }
  }

  async function setGlobalWeatherLayer(map, mode) {
    if (!map) return 'off';
    const nextMode = mode || (globalWeatherMode === 'off' ? 'radar' : globalWeatherMode === 'radar' ? 'clouds' : 'off');
    globalWeatherMode = nextMode;

    if (map.getLayer('layer-global-weather')) map.removeLayer('layer-global-weather');
    if (map.getSource('global-weather-src')) map.removeSource('global-weather-src');

    if (nextMode === 'off') return 'off';

    try {
      const meta = await global.WeatherService.fetchRainViewerMeta();
      const host = (meta && meta.host) || 'https://tilecache.rainviewer.com';
      let tilePath = null;
      if (nextMode === 'radar' && meta && meta.radar && Array.isArray(meta.radar.past) && meta.radar.past.length) {
        tilePath = `${meta.radar.past[meta.radar.past.length - 1].path}/256/{z}/{x}/{y}/2/1_1.png`;
      } else if (nextMode === 'clouds' && meta && meta.satellite && Array.isArray(meta.satellite.infrared) && meta.satellite.infrared.length) {
        tilePath = `${meta.satellite.infrared[meta.satellite.infrared.length - 1].path}/256/{z}/{x}/{y}/0/0_0.png`;
      }
      if (!tilePath) {
        globalWeatherMode = 'off';
        return 'off';
      }

      map.addSource('global-weather-src', {
        type: 'raster',
        tiles: [`${host}${tilePath}`],
        tileSize: 256,
        maxzoom: 12,
        attribution: 'RainViewer Global Weather'
      });

      const beforeId = map.getLayer('layer-labels') ? 'layer-labels' : undefined;
      map.addLayer(
        {
          id: 'layer-global-weather',
          type: 'raster',
          source: 'global-weather-src',
          paint: { 'raster-opacity': 0.65, 'raster-fade-duration': 200 }
        },
        beforeId
      );
      return nextMode;
    } catch (e) {
      globalWeatherMode = 'off';
      return 'off';
    }
  }

  global.WeatherPanel = {
    mount,
    setGlobalWeatherLayer,
    getGlobalWeatherMode: () => globalWeatherMode
  };
})(window);

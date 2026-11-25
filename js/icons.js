(function (global) {
  'use strict';

  const PATHS = {
    globe: '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5a14.5 14.5 0 0 1 0 19M12 2.5a14.5 14.5 0 0 0 0 19"/>',
    compass: '<circle cx="12" cy="12" r="9.5"/><polygon points="15.8 8.2 13.7 13.7 8.2 15.8 10.3 10.3 15.8 8.2"/>',
    search: '<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4.35-4.35"/>',
    sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>',
    sparkles: '<path d="m12 3 1.7 4.6L18.3 9.3l-4.6 1.7L12 15.6l-1.7-4.6L5.7 9.3l4.6-1.7L12 3Z"/><path d="M18.5 15.5l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1Z"/>',
    mountain: '<path d="m3 19 6.2-10.5 4.1 6.7 2.8-4.2L21 19H3Z"/>',
    building: '<path d="M4 20h16M6 20V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15M14 9h4a1 1 0 0 1 1 1v10M9 8h2M9 12h2M9 16h2M16.5 13h.01M16.5 16h.01"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    cloudRain: '<path d="M6.5 16.5A4.5 4.5 0 0 1 7.2 7.6 5.5 5.5 0 0 1 18 9.2a3.8 3.8 0 0 1-.5 7.3H6.5Z"/><path d="M9 19l-1 2M13 19l-1 2M17 19l-1 2"/>',
    snowflake: '<path d="M12 2.5v19M4.2 7l15.6 9M19.8 7 4.2 16M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>',
    aurora: '<path d="M3 16c3-4 5-10 9-10s6 6 9 10"/><path d="M5 19c2.5-2.5 4.5-6.5 7-6.5s4.5 4 7 6.5"/><circle cx="18.5" cy="5.5" r="1" fill="currentColor"/>',
    calendar: '<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3.5 9.5h17"/>',
    mapPin: '<path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 1 1 13 0c0 5.3-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
    navigation: '<polygon points="3 11 21 3 13 21 11 13 3 11"/>',
    layers: '<polygon points="12 3 21 7.5 12 12 3 7.5 12 3"/><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5"/>',
    tag: '<path d="M12.5 3.5H6a2.5 2.5 0 0 0-2.5 2.5v6.5l8 8a2 2 0 0 0 2.8 0l6.2-6.2a2 2 0 0 0 0-2.8l-8-8Z"/><circle cx="8" cy="8" r="1.1" fill="currentColor"/>',
    rotateCw: '<path d="M20 5v5h-5"/><path d="M20 10a8 8 0 1 0 1.4 4.5"/>',
    share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.3 10.9 7.4-4.2M8.3 13.1l7.4 4.2"/>',
    bookmark: '<path d="M6.5 4.5h11a1 1 0 0 1 1 1v15l-6.5-4-6.5 4v-15a1 1 0 0 1 1-1Z"/>',
    bookmarkFilled: '<path d="M6.5 4.5h11a1 1 0 0 1 1 1v15l-6.5-4-6.5 4v-15a1 1 0 0 1 1-1Z" fill="currentColor"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    maximize: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    minimize: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
    layoutGrid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    award: '<circle cx="12" cy="8.5" r="5"/><path d="m8.8 12.7-1.3 7.8 4.5-2.3 4.5 2.3-1.3-7.8"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M16 14.5h2"/>',
    route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H13a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-2.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    arrowUpRight: '<path d="M7 17 17 7M9 7h8v8"/>',
    box3d: '<path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4l8-4.6Z"/><path d="M12 12v9.2M12 12l8-4.6M12 12 4 7.4"/>',
    eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
    moon: '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/>',
    palette: '<circle cx="12" cy="12" r="9.5"/><circle cx="8.5" cy="9.5" r="1.1" fill="currentColor"/><circle cx="12" cy="7.5" r="1.1" fill="currentColor"/><circle cx="15.5" cy="9.5" r="1.1" fill="currentColor"/><path d="M14.5 15.5a2.5 2.5 0 0 0 0-5h-1a2 2 0 0 1-2-2"/>',
    languages: '<path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>',
    camera: '<path d="M4 8a2 2 0 0 1 2-2h2.5l1.5-2h4l1.5 2H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z"/><circle cx="12" cy="13" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-4.5-4.5L6 20"/>',
    wind: '<path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5M3 12h15a2.5 2.5 0 1 1-2.5 2.5M3 16h8a2 2 0 1 1-2 2"/>',
    droplet: '<path d="M12 2.5s6 6.5 6 11a6 6 0 1 1-12 0c0-4.5 6-11 6-11Z"/>',
    cloud: '<path d="M6.5 18.5A4.5 4.5 0 0 1 7.2 9.6 5.5 5.5 0 0 1 18 11.2a3.8 3.8 0 0 1-.5 7.3H6.5Z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    activity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    download: '<path d="M12 3v12M7 11l5 5 5-5M4 19h16"/>',
    upload: '<path d="M12 15V3M7 7l5-4 5 4M4 19h16"/>',
    trash: '<path d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/>',
    shield: '<path d="M12 3 4 6.5v5.5c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6.5L12 3Z"/>',
    sunrise: '<path d="M12 3v4M5.6 9.6l2.1 2.1M18.4 9.6l-2.1 2.1M3 17h18M7 17a5 5 0 0 1 10 0"/>',
    sunset: '<path d="M12 7V3M5.6 9.6l2.1 2.1M18.4 9.6l-2.1 2.1M3 17h18M7 17a5 5 0 0 1 10 0"/>',
    car: '<path d="M5 11l2-5h10l2 5M3 11h18v6H3v-6Z"/><circle cx="7" cy="17" r="1.5"/><circle cx="17" cy="17" r="1.5"/>',
    walk: '<circle cx="12" cy="4.5" r="1.5"/><path d="m10 8 2 4-2.5 7M12 12l3 3.5 1.5 3.5M7.5 12l2.5-4 3.5 1.5"/>',
    bike: '<circle cx="6" cy="16.5" r="3"/><circle cx="18" cy="16.5" r="3"/><path d="M6 16.5 10 9h4l4 7.5M10 9l-1-2.5M14 9l1.5-2.5h2"/>',
    star: '<polygon points="12 3 14.9 8.8 21.3 9.7 16.6 14.2 17.7 20.6 12 17.6 6.3 20.6 7.4 14.2 2.7 9.7 9.1 8.8 12 3"/>',
    cluster: '<circle cx="8" cy="9" r="3.5"/><circle cx="16" cy="9" r="3.5"/><circle cx="12" cy="16" r="3.5"/>'
  };

  function svg(name, size, cls) {
    const s = size || 15;
    const path = PATHS[name] || PATHS.mapPin;
    const extraCls = cls ? ` ${cls}` : '';
    return `<svg class="app-icon${extraCls}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  }

  global.AppIcons = { svg, PATHS };
})(window);

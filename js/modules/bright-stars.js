(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BrightStars = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const DEG2RAD = Math.PI / 180;

  // J2000 Galactic Center (Sagittarius A*)
  const GALACTIC_CENTER = {
    raHours: 17.7611,
    decDeg: -29.0078,
    name: 'Galactic Center (Sgr A*)'
  };

  // Curated J2000 Hipparcos / Yale Bright Star Catalog subset:
  // [raHours, decDeg, vMag, bvColorIndex, name]
  const CATALOG = [
    [6.7525, -16.7161, -1.46, 0.00, 'Sirius'],
    [6.3992, -52.6957, -0.74, 0.15, 'Canopus'],
    [14.6601, -60.8340, -0.27, 0.71, 'Rigil Kentaurus'],
    [14.2610, 19.1824, -0.05, 1.23, 'Arcturus'],
    [18.6156, 38.7837, 0.03, 0.00, 'Vega'],
    [5.2782, 45.9980, 0.08, 0.80, 'Capella'],
    [5.2423, -8.2016, 0.13, -0.03, 'Rigel'],
    [7.6550, 5.2250, 0.34, 0.42, 'Procyon'],
    [1.6286, -57.2368, 0.46, -0.16, 'Achernar'],
    [5.9195, 7.4071, 0.50, 1.85, 'Betelgeuse'],
    [14.0637, -60.3730, 0.61, -0.23, 'Hadar'],
    [19.8464, 8.8683, 0.77, 0.22, 'Altair'],
    [12.4433, -63.0991, 0.76, -0.24, 'Acrux'],
    [4.5987, 16.5093, 0.86, 1.54, 'Aldebaran'],
    [16.4901, -26.4320, 0.96, 1.83, 'Antares'],
    [13.4199, -11.1613, 0.97, -0.23, 'Spica'],
    [7.7553, 28.0262, 1.14, 1.00, 'Pollux'],
    [22.9608, -29.6222, 1.16, 0.09, 'Fomalhaut'],
    [20.6905, 45.2803, 1.25, 0.09, 'Deneb'],
    [12.7953, -59.6888, 1.25, -0.23, 'Mimosa'],
    [10.1395, 11.9672, 1.35, -0.11, 'Regulus'],
    [6.9771, -28.9721, 1.50, -0.21, 'Adhara'],
    [7.5767, 31.8883, 1.58, 0.03, 'Castor'],
    [12.5194, -57.1132, 1.63, 1.59, 'Gacrux'],
    [17.5601, -37.1038, 1.63, -0.22, 'Shaula'],
    [5.4189, 6.3497, 1.64, -0.22, 'Bellatrix'],
    [5.4382, 28.6075, 1.65, -0.13, 'Elnath'],
    [9.2200, -69.7172, 1.67, 0.00, 'Miaplacidus'],
    [5.6036, -1.2019, 1.69, -0.18, 'Alnilam'],
    [22.1372, -46.9610, 1.74, -0.13, 'Alnair'],
    [12.9005, 55.9598, 1.77, -0.02, 'Alioth'],
    [11.0621, 61.7510, 1.79, 1.07, 'Dubhe'],
    [3.4054, 49.8612, 1.79, 0.48, 'Mirfak'],
    [7.1398, -26.3932, 1.83, 0.67, 'Wezen'],
    [17.6220, -42.9978, 1.87, 0.40, 'Sargas'],
    [18.4029, -34.3846, 1.85, -0.03, 'Kaus Australis'],
    [8.3752, -59.5095, 1.86, 1.28, 'Avior'],
    [13.7923, 49.3133, 1.86, -0.19, 'Alkaid'],
    [5.9921, 44.9474, 1.90, 0.03, 'Menkalinan'],
    [16.8111, -69.0277, 1.92, 1.44, 'Atria'],
    [6.6285, 16.3993, 1.93, 0.00, 'Alhena'],
    [20.4274, -56.7351, 1.94, -0.20, 'Peacock'],
    [8.7453, -54.7088, 1.96, 0.04, 'Alsephina'],
    [6.3783, -17.9559, 1.98, -0.23, 'Mirzam'],
    [9.4598, -8.6586, 1.98, 1.44, 'Alphard'],
    [2.5303, 89.2641, 1.98, 0.60, 'Polaris'],
    [2.1196, 23.4624, 2.00, 1.15, 'Hamal'],
    [0.7265, -17.9866, 2.04, 1.02, 'Diphda'],
    [18.9211, -26.2967, 2.05, -0.22, 'Nunki'],
    [14.1114, -36.3700, 2.06, 1.01, 'Menkent'],
    [5.6793, -1.9426, 1.77, -0.21, 'Alnitak'],
    [5.5334, -0.2991, 2.23, -0.22, 'Mintaka'],
    [5.7959, -9.6696, 2.09, -0.17, 'Saiph'],
    [0.1398, 29.0904, 2.06, -0.11, 'Alpheratz'],
    [1.1622, 35.6206, 2.05, 1.58, 'Mirach'],
    [2.0650, 42.3297, 2.10, 1.37, 'Almach'],
    [10.3329, 19.8415, 2.08, 1.15, 'Algieba'],
    [14.8451, 74.1555, 2.08, 1.47, 'Kochab'],
    [17.5822, 12.5600, 2.07, 0.15, 'Rasalhague'],
    [3.1361, 40.9556, 2.12, -0.05, 'Algol'],
    [11.8177, 14.5721, 2.14, 0.09, 'Denebola'],
    [0.6751, 56.5373, 2.23, 1.17, 'Schedar'],
    [0.1529, 59.1498, 2.27, 0.34, 'Caph'],
    [0.9451, 60.7167, 2.47, -0.15, 'Navi'],
    [1.4303, 60.2353, 2.68, 0.13, 'Ruchbah'],
    [1.9066, 63.6701, 3.37, 0.16, 'Segin'],
    [11.0307, 56.3824, 2.37, -0.02, 'Merak'],
    [11.8972, 53.6948, 2.44, 0.00, 'Phecda'],
    [12.2570, 57.0326, 3.31, 0.08, 'Megrez'],
    [13.3987, 54.9254, 2.27, 0.02, 'Mizar'],
    [20.3705, 40.2567, 2.20, 0.68, 'Sadr'],
    [20.7702, 33.9703, 2.46, 1.03, 'Gienah Cygni'],
    [19.7497, 45.1308, 2.87, -0.03, 'Fawaris'],
    [19.5120, 27.9597, 3.08, 1.13, 'Albireo'],
    [18.8347, 33.3627, 3.52, 0.00, 'Sheliak'],
    [18.9824, 32.6896, 3.24, -0.09, 'Sulafat'],
    [19.7709, 10.6133, 2.72, 1.52, 'Tarazed'],
    [19.9219, 6.4068, 3.71, 0.86, 'Alshain'],
    [16.0056, -22.6217, 2.32, -0.12, 'Dschubba'],
    [16.0906, -19.8054, 2.62, -0.07, 'Acrab'],
    [16.8362, -34.2932, 2.29, 1.15, 'Epsilon Sco'],
    [17.6219, -37.2958, 2.70, -0.22, 'Lesath'],
    [17.7083, -39.0300, 2.41, -0.20, 'Girtab'],
    [3.7914, 24.1051, 2.87, -0.09, 'Alcyone'],
    [14.5348, 38.3083, 3.03, 0.19, 'Seginus'],
    [14.7498, 27.0742, 2.37, 0.97, 'Izar'],
    [15.5781, 26.7147, 2.23, -0.02, 'Alphecca'],
    [18.0907, -30.4241, 2.99, 1.38, 'Alnasl'],
    [18.3499, -29.8281, 2.81, 1.04, 'Kaus Media'],
    [18.4660, -25.4217, 2.81, 1.00, 'Kaus Borealis'],
    [19.0436, -29.8801, 2.60, 0.08, 'Ascella'],
    [23.0629, 28.0828, 2.42, 1.67, 'Scheat'],
    [23.0793, 15.2053, 2.49, -0.04, 'Markab'],
    [0.1398, 15.1836, 2.83, -0.23, 'Algenib'],
    [21.7364, 9.8750, 2.39, 1.53, 'Enif'],
    [22.0964, -0.3199, 2.95, 0.98, 'Sadalmelik'],
    [11.2351, 20.5237, 2.56, 0.12, 'Zosma'],
    [12.9338, 38.3184, 2.90, -0.06, 'Cor Caroli'],
    [15.3455, 71.8340, 3.05, 0.05, 'Pherkad']
  ];

  // Constellation polylines by star name (resolved safely to CATALOG indices)
  const CONSTELLATION_NAMES = [
    ['Dubhe', 'Merak', 'Phecda', 'Megrez', 'Alioth', 'Mizar', 'Alkaid'],
    ['Megrez', 'Dubhe'],
    ['Caph', 'Schedar', 'Navi', 'Ruchbah', 'Segin'],
    ['Betelgeuse', 'Bellatrix', 'Mintaka', 'Alnilam', 'Alnitak', 'Saiph', 'Rigel', 'Mintaka'],
    ['Betelgeuse', 'Alnitak'],
    ['Vega', 'Deneb', 'Altair', 'Vega'],
    ['Deneb', 'Sadr', 'Albireo'],
    ['Gienah Cygni', 'Sadr', 'Fawaris'],
    ['Acrux', 'Gacrux'],
    ['Acrab', 'Dschubba', 'Antares', 'Epsilon Sco', 'Sargas', 'Shaula', 'Lesath']
  ];

  const STAR_IDX_BY_NAME = new Map(CATALOG.map((entry, idx) => [entry[4], idx]));
  const CONSTELLATIONS = CONSTELLATION_NAMES
    .map((names) => names.map((n) => STAR_IDX_BY_NAME.get(n)).filter((i) => typeof i === 'number'))
    .filter((arr) => arr.length >= 2);

  function computeGmstHours(dateObj) {
    const dt = dateObj instanceof Date ? dateObj : new Date();
    const jd = dt.getTime() / 86400000 + 2440587.5;
    const d = jd - 2451545.0;
    const gmstDeg = 280.46061837 + 360.98564736629 * d;
    return (((gmstDeg % 360) + 360) % 360) / 15;
  }

  /**
   * Convert J2000 (RA hours, Dec deg) to unit 3D vector in World Travel Globe's
   * Earth-aligned frame at given Greenwich Mean Sidereal Time (hours).
   */
  function raDecToUnitVector(raHours, decDeg, gmstHours) {
    const gmst = Number.isFinite(gmstHours) ? gmstHours : computeGmstHours(new Date());
    const lngRad = (raHours - gmst) * 15 * DEG2RAD;
    const decRad = decDeg * DEG2RAD;
    const cosDec = Math.cos(decRad);
    return [
      cosDec * Math.cos(lngRad),
      Math.sin(decRad),
      cosDec * Math.sin(lngRad)
    ];
  }

  function bvToRgb(bv) {
    const c = Number.isFinite(bv) ? bv : 0.2;
    if (c < -0.05) return '184,214,255';
    if (c < 0.25) return '228,238,255';
    if (c < 0.65) return '255,248,232';
    if (c < 1.15) return '255,228,186';
    return '255,196,154';
  }

  function getProjectedStars(dateObj) {
    const gmst = computeGmstHours(dateObj);
    return CATALOG.map((entry, idx) => {
      const [ra, dec, mag, bv, name] = entry;
      const vec = raDecToUnitVector(ra, dec, gmst);
      const radius = Math.max(0.85, Math.min(2.6, 2.05 - mag * 0.34));
      const alpha = Math.max(0.45, Math.min(0.98, 0.92 - mag * 0.12));
      return {
        idx,
        name,
        mag,
        ra,
        dec,
        x: vec[0],
        y: vec[1],
        z: vec[2],
        r: radius,
        alpha,
        rgb: bvToRgb(bv)
      };
    });
  }

  function getGalacticCenterVector(dateObj) {
    const gmst = computeGmstHours(dateObj);
    return raDecToUnitVector(GALACTIC_CENTER.raHours, GALACTIC_CENTER.decDeg, gmst);
  }

  return {
    CATALOG,
    CONSTELLATIONS,
    GALACTIC_CENTER,
    computeGmstHours,
    raDecToUnitVector,
    bvToRgb,
    getProjectedStars,
    getGalacticCenterVector
  };
});

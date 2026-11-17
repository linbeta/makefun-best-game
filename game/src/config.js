// Giltwake — palette, layout and tuning. Every number the game is balanced on lives here.

export const VIEW = { width: 960, height: 600 };

// Screen bands (the canal runs left to right; the camera follows the boat along x).
export const LAYOUT = {
  skyBottom: 150,      // skyline and moon above this line
  farQuayTop: 150,     // far cobbled quay
  waterTop: 196,       // canal water from here...
  waterBottom: 528,    // ...to here
  nearQuayBottom: 600, // near cobbled quay below the water
  boatScreenX: 280,    // where the camera keeps the boat horizontally
};

export const PALETTE = {
  skyTop: '#060b17',
  skyBottom: '#15253b',
  moon: '#f4e8c4',
  moonGlow: 'rgba(244, 226, 170, 0.18)',
  stars: '#cfd8ff',
  buildingFar: '#0d1626',
  buildingNear: '#121d30',
  roofEdge: '#1d2a40',
  window: '#ffbc5c',
  windowHot: '#ffe09a',
  windowGlow: 'rgba(255, 176, 80, 0.22)',
  cobbleBase: '#1f2029',
  cobbleStone: '#353642',
  cobbleLight: '#4c4b58',
  cobbleWet: 'rgba(170, 200, 220, 0.10)',
  quayEdge: '#8a6a2c',
  waterDeep: '#031216',
  waterMid: '#08262c',
  waterTeal: '#14525a',
  ripple: 'rgba(120, 200, 205, 0.16)',
  reflectGold: 'rgba(255, 205, 110, 0.55)',
  gold: '#f2c14e',
  goldLight: '#ffe7a3',
  goldDark: '#a4721c',
  brass: '#c7973c',
  brassDark: '#6a4916',
  brassLight: '#f0cf7a',
  paper: '#fff4d6',
  bargeHull: '#3a271b',
  bargeDeck: '#5a3d26',
  bargeLamp: '#ff6a3d',
  iron: '#6f717c',
  ironDark: '#3a3c45',
  danger: '#ff6a4a',
  dangerSoft: 'rgba(255, 106, 74, 0.35)',
  hudInk: '#fff3d1',
  hudDim: 'rgba(255, 243, 209, 0.62)',
  hudPanel: 'rgba(6, 14, 24, 0.72)',
  dawnTop: '#3b2a4a',
  dawnBottom: '#f2a86a',
};

export const FONTS = {
  display: "bold 112px Georgia, 'Palatino Linotype', 'Book Antiqua', 'DejaVu Serif', serif",
  serif: "Georgia, 'Palatino Linotype', 'Book Antiqua', 'DejaVu Serif', serif",
};

export const TUNING = {
  fixedStep: 1 / 60,
  floodSeconds: 115,        // the whole run must finish before the flood gate shuts
  floodWarnSeconds: 25,     // drone and red tint below this
  hullMax: 3,
  invulnSeconds: 1.4,
  boatRadius: 12,
  steerMaxAcross: 210,      // px/s across the canal
  steerMaxAlong: 150,       // px/s faster/slower than the current
  steerInertia: 3.2,        // how quickly the boat answers (higher = snappier)
  keyAccel: 620,
  minForwardFactor: 0.3,    // the current always carries the boat at least this much
  boostSeconds: 1.1,
  boostFactor: 1.38,
  chainWindow: 2.6,         // seconds to catch the next leaf and keep the chain
  chainCap: 12,
  leafPoints: 10,
  leafRadius: 15,
  dockRadius: 74,
  dockBonus: 400,
  hullBonus: 150,
  timeBonusPerSecond: 12,
  dockingSeconds: 1.8,
  sinkingSeconds: 1.6,
};

// Each canal stretch grows harder: longer, faster current, more traffic and falling cogs.
export const STRETCHES = [
  { name: 'Lamplight Reach', length: 4300, current: 120, bridges: 2, whirlpools: 3, barges: 3, leafClusters: 13, cogEvery: 2.1 },
  { name: 'Clockmakers Cut', length: 4900, current: 140, bridges: 3, whirlpools: 5, barges: 5, leafClusters: 15, cogEvery: 1.6 },
  { name: 'Floodgate Run',   length: 5500, current: 160, bridges: 4, whirlpools: 7, barges: 7, leafClusters: 17, cogEvery: 1.2 },
];

export const ROMAN = ['I', 'II', 'III'];

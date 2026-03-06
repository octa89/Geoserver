// ---- GeoServer Config ----
export const GEOSERVER_URL = import.meta.env.VITE_GEOSERVER_URL || '/geoserver';
export const API_URL = import.meta.env.VITE_API_URL || '/api';

// ---- Default Map View ----
export const DEFAULT_CENTER: [number, number] = [40.758, -82.515];
export const DEFAULT_ZOOM = 14;
export const MAX_ZOOM = 22;
export const MAX_NATIVE_ZOOM = 19;

// ---- Basemaps ----
export const BASEMAPS = {
  street: {
    label: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
  dark: {
    label: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
} as const;

export type BasemapKey = keyof typeof BASEMAPS;

// ---- Color Palette (unique values) ----
export const COLOR_PALETTE = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990',
  '#dcbeff', '#9A6324', '#fffac8', '#800000', '#aaffc3',
  '#808000', '#ffd8b1', '#000075', '#a9a9a9', '#e6beff',
  '#1abc9c', '#d35400', '#2ecc71', '#8e44ad', '#2c3e50',
];

// ---- Layer Colors ----
export const LAYER_COLORS = [
  '#3388ff', '#e6194b', '#3cb44b', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#469990', '#dcbeff',
  '#9A6324', '#800000', '#aaffc3', '#808000', '#000075',
  '#fabed4', '#fffac8', '#ffd8b1', '#a9a9a9', '#e6beff',
];

// ---- Color Ramps (graduated) ----
export const COLOR_RAMPS: Record<string, string[]> = {
  Blues:      ['#f7fbff', '#08306b'],
  Reds:       ['#fff5f0', '#67000d'],
  Greens:     ['#f7fcf5', '#00441b'],
  Oranges:    ['#fff5eb', '#7f2704'],
  Purples:    ['#fcfbfd', '#3f007d'],
  YlOrRd:     ['#ffffcc', '#800026'],
  YlGnBu:     ['#ffffd9', '#081d58'],
  RdYlGn:     ['#a50026', '#006837'],
  Spectral:   ['#9e0142', '#5e4fa2'],
  Viridis:    ['#440154', '#fde725'],
  Plasma:     ['#0d0887', '#f0f921'],
  Greys:      ['#ffffff', '#000000'],
  PinkYellow: ['#ff69b4', '#ffd700'],
  CyanDark:   ['#e0ffff', '#008b8b'],
};

// ---- Point Symbols ----
export const POINT_SYMBOLS = [
  'circle', 'square', 'triangle', 'diamond', 'star', 'cross',
] as const;

export type PointSymbol = typeof POINT_SYMBOLS[number];

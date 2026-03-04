import L from 'leaflet';
import type {
  SymbologyConfig,
  UniqueSymbology,
  GraduatedSymbology,
  ProportionalSymbology,
  RuleSymbology,
  RuleDef,
} from '../types/symbology';
import { COLOR_PALETTE } from '../config/constants';
import { darkenColor, generateRampColors } from './colorUtils';
import {
  extractNumericValues,
  classifyEqualInterval,
  classifyQuantile,
  classifyJenks,
  classifyValue,
} from './classify';
import { pointSVG } from './markers';
import type { LeafletLayerRefs } from '../store/leafletRegistry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GeomType = string;

// ---------------------------------------------------------------------------
// defaultStyle
// ---------------------------------------------------------------------------

/**
 * Return a Leaflet path style object for a given geometry type and fill color.
 *
 * Points:    { radius, fillColor, color (darkened), weight, fillOpacity }
 * Lines:     { color, weight, opacity }
 * Polygons:  { fillColor, color (darkened), weight, fillOpacity }
 */
export function defaultStyle(
  geomType: GeomType,
  color: string
): L.PathOptions {
  const darker = darkenColor(color);

  if (geomType === 'Point' || geomType === 'MultiPoint') {
    return {
      radius: 6,
      fillColor: color,
      color: darker,
      weight: 1.5,
      fillOpacity: 0.7,
      opacity: 1,
    };
  }

  if (
    geomType === 'LineString' ||
    geomType === 'MultiLineString'
  ) {
    return {
      color,
      weight: 3,
      opacity: 0.8,
    };
  }

  // Polygon / MultiPolygon / fallback
  return {
    fillColor: color,
    color: darker,
    weight: 2,
    fillOpacity: 0.35,
    opacity: 1,
  };
}

// ---------------------------------------------------------------------------
// applyStyleToLayer
// ---------------------------------------------------------------------------

/**
 * Apply a fill color (and optional size) to a single Leaflet sub-layer.
 *
 * - CircleMarkers: setStyle with radius/fillColor/color.
 * - Non-circle point symbols: replace the icon with a fresh DivIcon SVG.
 * - Lines / Polygons: setStyle with the appropriate color fields.
 */
export function applyStyleToLayer(
  layer: L.Layer,
  color: string,
  geomType: GeomType,
  pointSymbol: string,
  radius?: number
): void {
  const darker = darkenColor(color);
  const isPoint =
    geomType === 'Point' || geomType === 'MultiPoint';

  if (isPoint) {
    if (layer instanceof L.CircleMarker) {
      layer.setStyle({
        fillColor: color,
        color: darker,
        weight: 1.5,
        fillOpacity: 0.7,
        opacity: 1,
        ...(radius !== undefined ? { radius } : {}),
      });
      return;
    }

    // Non-circle symbol: rebuild the icon SVG
    if (layer instanceof L.Marker) {
      const size = radius !== undefined ? radius * 2 : 12;
      const svg = pointSVG(pointSymbol, color, darker, size);
      const icon = L.divIcon({
        html: svg,
        className: 'posm-point-marker',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      layer.setIcon(icon);
    }
    return;
  }

  if (
    geomType === 'LineString' ||
    geomType === 'MultiLineString'
  ) {
    (layer as L.Polyline).setStyle({
      color,
      weight: radius !== undefined ? radius : 3,
      opacity: 0.8,
    });
    return;
  }

  // Polygon / fallback
  (layer as L.Polygon).setStyle({
    fillColor: color,
    color: darker,
    weight: 2,
    fillOpacity: radius !== undefined ? radius : 0.35,
    opacity: 1,
  });
}

// ---------------------------------------------------------------------------
// applySymbology  (dispatcher)
// ---------------------------------------------------------------------------

/**
 * Route to the correct symbology mode implementation based on config.mode.
 * Returns the resulting SymbologyConfig (same shape as the input config).
 */
export function applySymbology(
  leafletLayer: L.GeoJSON,
  geojson: GeoJSON.FeatureCollection,
  geomType: GeomType,
  pointSymbol: string,
  config: SymbologyConfig
): SymbologyConfig {
  switch (config.mode) {
    case 'unique':
      return applyUniqueValues(
        leafletLayer,
        geojson,
        geomType,
        pointSymbol,
        config.field,
        config.groupByYear
      );

    case 'graduated':
      return applyGraduated(leafletLayer, geojson, geomType, pointSymbol, {
        field: config.field,
        method: config.method,
        nClasses: config.nClasses,
        ramp: config.ramp,
      });

    case 'proportional':
      return applyProportional(
        leafletLayer,
        geojson,
        geomType,
        pointSymbol,
        {
          field: config.field,
          minSize: config.minSize,
          maxSize: config.maxSize,
          color: config.color,
        }
      );

    case 'rules':
      return applyRules(leafletLayer, geojson, geomType, pointSymbol, {
        rules: config.rules,
        defaultColor: config.defaultColor,
      });

    default:
      return config;
  }
}

// ---------------------------------------------------------------------------
// extractYear  (helper)
// ---------------------------------------------------------------------------

/**
 * Extract a 4-digit year string from a date value.
 *
 * Tries a simple /^\d{4}/ prefix match first, then falls back to Date.parse.
 * Returns null if no year can be extracted.
 */
export function extractYear(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();

  // Fast path: string starts with 4 digits
  const match = str.match(/^(\d{4})/);
  if (match) return match[1];

  // Fallback: try JS Date parse
  const ts = Date.parse(str);
  if (!isNaN(ts)) {
    return String(new Date(ts).getFullYear());
  }

  return null;
}

// ---------------------------------------------------------------------------
// applyUniqueValues
// ---------------------------------------------------------------------------

/**
 * Assign a distinct color from COLOR_PALETTE to each unique field value.
 *
 * When groupByYear is true, the field value is first collapsed to its
 * 4-digit year so that all dates in the same year share a color.
 *
 * Values are sorted by frequency (most common first), falling back to
 * chronological order when groupByYear is active.
 */
export function applyUniqueValues(
  leafletLayer: L.GeoJSON,
  geojson: GeoJSON.FeatureCollection,
  geomType: GeomType,
  pointSymbol: string,
  field: string,
  groupByYear = false
): UniqueSymbology {
  // Step 1: Build frequency map (optionally extract year)
  const freqMap: Map<string, number> = new Map();

  for (const feature of geojson.features) {
    let raw = feature.properties?.[field];
    if (raw === null || raw === undefined) raw = '';

    const key = groupByYear
      ? (extractYear(raw) ?? String(raw))
      : String(raw);

    freqMap.set(key, (freqMap.get(key) ?? 0) + 1);
  }

  // Step 2: Sort keys
  let sortedKeys: string[];
  if (groupByYear) {
    // Chronological for year keys (numeric sort)
    sortedKeys = Array.from(freqMap.keys()).sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  } else {
    // By frequency descending
    sortedKeys = Array.from(freqMap.keys()).sort(
      (a, b) => (freqMap.get(b) ?? 0) - (freqMap.get(a) ?? 0)
    );
  }

  // Step 3: Assign colors
  const valueColorMap: Record<string, string> = {};
  sortedKeys.forEach((key, idx) => {
    valueColorMap[key] = COLOR_PALETTE[idx % COLOR_PALETTE.length];
  });

  // Step 4: Restyle each sub-layer
  leafletLayer.eachLayer((sublayer) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feature = (sublayer as any).feature as GeoJSON.Feature | undefined;
    if (!feature) return;

    let raw = feature.properties?.[field];
    if (raw === null || raw === undefined) raw = '';
    const key = groupByYear
      ? (extractYear(raw) ?? String(raw))
      : String(raw);

    const color = valueColorMap[key] ?? '#888888';
    applyStyleToLayer(sublayer, color, geomType, pointSymbol);
  });

  return {
    mode: 'unique',
    field,
    valueColorMap,
    groupByYear,
  };
}

// ---------------------------------------------------------------------------
// applyGraduated
// ---------------------------------------------------------------------------

interface GraduatedOpts {
  field: string;
  method: 'equalInterval' | 'quantile' | 'jenks';
  nClasses: number;
  ramp: string;
}

/**
 * Classify numeric field values into equal-interval, quantile, or Jenks
 * classes and paint each feature with the corresponding ramp color.
 */
export function applyGraduated(
  leafletLayer: L.GeoJSON,
  geojson: GeoJSON.FeatureCollection,
  geomType: GeomType,
  pointSymbol: string,
  opts: GraduatedOpts
): GraduatedSymbology {
  const { field, method, nClasses, ramp } = opts;

  // Step 1: Extract numeric values (already sorted ascending by classify.ts)
  const values = extractNumericValues(geojson, field);

  // Step 2: Classify
  let breaks: number[];
  if (method === 'quantile') {
    breaks = classifyQuantile(values, nClasses);
  } else if (method === 'jenks') {
    breaks = classifyJenks(values, nClasses);
  } else {
    breaks = classifyEqualInterval(values, nClasses);
  }

  // Step 3: Generate colors from ramp
  const colors = generateRampColors(ramp, nClasses);

  // Step 4: Restyle each sub-layer
  leafletLayer.eachLayer((sublayer) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feature = (sublayer as any).feature as GeoJSON.Feature | undefined;
    if (!feature) return;

    const raw = feature.properties?.[field];
    const num = raw !== null && raw !== undefined ? Number(raw) : NaN;

    let color = colors[0] ?? '#cccccc';
    if (isFinite(num) && breaks.length >= 2) {
      const classIdx = classifyValue(num, breaks);
      color = colors[Math.min(classIdx, colors.length - 1)] ?? '#cccccc';
    }

    applyStyleToLayer(sublayer, color, geomType, pointSymbol);
  });

  return {
    mode: 'graduated',
    field,
    method,
    nClasses,
    ramp,
    breaks,
    colors,
  };
}

// ---------------------------------------------------------------------------
// applyProportional
// ---------------------------------------------------------------------------

interface ProportionalOpts {
  field: string;
  minSize: number;
  maxSize: number;
  color?: string;
}

/**
 * Scale a visual property linearly by numeric field value:
 * - Points:   radius (minSize … maxSize)
 * - Lines:    stroke weight
 * - Polygons: fillOpacity (mapped to 0.1 … 0.8 range regardless of minSize/maxSize)
 */
export function applyProportional(
  leafletLayer: L.GeoJSON,
  geojson: GeoJSON.FeatureCollection,
  geomType: GeomType,
  pointSymbol: string,
  opts: ProportionalOpts
): ProportionalSymbology {
  const { field, minSize, maxSize, color } = opts;

  const values = extractNumericValues(geojson, field);
  const minVal = values.length ? values[0] : 0;          // already sorted asc
  const maxVal = values.length ? values[values.length - 1] : 1;
  const range = maxVal - minVal || 1;

  const isPoint =
    geomType === 'Point' || geomType === 'MultiPoint';
  const isLine =
    geomType === 'LineString' || geomType === 'MultiLineString';

  leafletLayer.eachLayer((sublayer) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feature = (sublayer as any).feature as GeoJSON.Feature | undefined;
    if (!feature) return;

    const raw = feature.properties?.[field];
    const num = raw !== null && raw !== undefined ? Number(raw) : NaN;
    const t = isFinite(num) ? (num - minVal) / range : 0;
    const scaled = minSize + t * (maxSize - minSize);

    const fillColor = color ?? '#3388ff';

    if (isPoint) {
      applyStyleToLayer(sublayer, fillColor, geomType, pointSymbol, scaled / 2);
    } else if (isLine) {
      applyStyleToLayer(sublayer, fillColor, geomType, pointSymbol, scaled);
    } else {
      // Polygon: vary fillOpacity between 0.1 and 0.8
      const opacity = 0.1 + t * 0.7;
      applyStyleToLayer(sublayer, fillColor, geomType, pointSymbol, opacity);
    }
  });

  return {
    mode: 'proportional',
    field,
    minSize,
    maxSize,
    color,
    minVal,
    maxVal,
  };
}

// ---------------------------------------------------------------------------
// applyRules
// ---------------------------------------------------------------------------

interface RulesOpts {
  rules: RuleDef[];
  defaultColor: string;
}

/**
 * Test each feature against an ordered list of rules; apply the color of the
 * first matching rule. Unmatched features use defaultColor.
 *
 * Supported operators: =, !=, >, <, >=, <=, LIKE, IS NULL, IS NOT NULL
 */
export function applyRules(
  leafletLayer: L.GeoJSON,
  geojson: GeoJSON.FeatureCollection,
  geomType: GeomType,
  pointSymbol: string,
  opts: RulesOpts
): RuleSymbology {
  const { rules, defaultColor } = opts;

  leafletLayer.eachLayer((sublayer) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feature = (sublayer as any).feature as GeoJSON.Feature | undefined;
    if (!feature) return;

    const props = feature.properties ?? {};
    let matchedColor = defaultColor;

    for (const rule of rules) {
      if (testRule(props, rule)) {
        matchedColor = rule.color;
        break;
      }
    }

    applyStyleToLayer(sublayer, matchedColor, geomType, pointSymbol);
  });

  return {
    mode: 'rules',
    rules,
    defaultColor,
  };
}

/** Evaluate a single rule against a feature's properties object. */
function testRule(
  props: Record<string, unknown>,
  rule: RuleDef
): boolean {
  const { field, operator, value } = rule;
  const rawVal = props[field];

  switch (operator.trim().toUpperCase()) {
    case 'IS NULL':
      return rawVal === null || rawVal === undefined;

    case 'IS NOT NULL':
      return rawVal !== null && rawVal !== undefined;

    case '=':
      return String(rawVal) === value;

    case '!=':
      return String(rawVal) !== value;

    case '>': {
      const n = Number(rawVal);
      return isFinite(n) && n > Number(value);
    }
    case '<': {
      const n = Number(rawVal);
      return isFinite(n) && n < Number(value);
    }
    case '>=': {
      const n = Number(rawVal);
      return isFinite(n) && n >= Number(value);
    }
    case '<=': {
      const n = Number(rawVal);
      return isFinite(n) && n <= Number(value);
    }

    case 'LIKE': {
      // Convert SQL LIKE pattern to a JS regex:
      // % -> .*, _ -> .
      const escaped = value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      const pattern = escaped.replace(/%/g, '.*').replace(/_/g, '.');
      const re = new RegExp(`^${pattern}$`, 'i');
      return re.test(String(rawVal ?? ''));
    }

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// refreshClusterAfterSymbology
// ---------------------------------------------------------------------------

/**
 * After restyling individual markers inside a cluster group, the cluster
 * group doesn't automatically reflect the new styles. This helper clears
 * and re-adds the GeoJSON layer to force the cluster group to re-ingest
 * the markers with their updated visual properties.
 *
 * Call this after any applyXxx / resetSymbology when the layer may be clustered.
 */
export function refreshClusterAfterSymbology(refs: LeafletLayerRefs): void {
  if (!refs.clusterGroup) return;
  refs.clusterGroup.clearLayers();
  refs.clusterGroup.addLayer(refs.leafletLayer);
}

// ---------------------------------------------------------------------------
// resetSymbology
// ---------------------------------------------------------------------------

/**
 * Reset every sub-layer in a GeoJSON layer to its default style.
 */
export function resetSymbology(
  leafletLayer: L.GeoJSON,
  geomType: GeomType,
  color: string,
  pointSymbol: string
): void {
  leafletLayer.eachLayer((sublayer) => {
    applyStyleToLayer(sublayer, color, geomType, pointSymbol);
  });
}

import type { FeatureCollection } from 'geojson';
import { COLOR_RAMPS } from '../config/constants';

/**
 * Linear RGB interpolation between two hex colors.
 * t=0 returns c1, t=1 returns c2.
 */
export function interpolateColor(c1: string, c2: string, t: number): string {
  const parse = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16),
    ];
  };

  const [r1, g1, b1] = parse(c1);
  const [r2, g2, b2] = parse(c2);

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return (
    '#' +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Generate n evenly-spaced colors from a named COLOR_RAMPS entry.
 * Falls back to a grey-to-black ramp if the key is not found.
 */
export function generateRampColors(rampKey: string, n: number): string[] {
  const ramp = COLOR_RAMPS[rampKey] ?? ['#cccccc', '#000000'];
  const [start, end] = ramp;

  if (n <= 0) return [];
  if (n === 1) return [start];

  return Array.from({ length: n }, (_, i) =>
    interpolateColor(start, end, i / (n - 1))
  );
}

/**
 * Draw a horizontal color-ramp gradient onto a canvas element.
 */
export function drawRamp(canvas: HTMLCanvasElement, rampKey: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const ramp = COLOR_RAMPS[rampKey] ?? ['#cccccc', '#000000'];
  const [start, end] = ramp;

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, start);
  gradient.addColorStop(1, end);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * Darken a hex color by 40% (multiply each channel by 0.6).
 */
export function darkenColor(hex: string): string {
  const h = hex.replace('#', '');
  const factor = 0.6;

  const r = Math.round(parseInt(h.substring(0, 2), 16) * factor);
  const g = Math.round(parseInt(h.substring(2, 4), 16) * factor);
  const b = Math.round(parseInt(h.substring(4, 6), 16) * factor);

  return (
    '#' +
    [r, g, b]
      .map((v) => Math.min(255, v).toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Return true if more than 80% of the first 100 non-null feature property
 * samples for `field` are numeric (finite numbers after coercion).
 */
export function isNumericField(
  geojson: FeatureCollection,
  field: string
): boolean {
  const samples = geojson.features
    .slice(0, 100)
    .map((f) => f.properties?.[field])
    .filter((v) => v !== null && v !== undefined);

  if (samples.length === 0) return false;

  const numericCount = samples.filter((v) => {
    const n = Number(v);
    return isFinite(n);
  }).length;

  return numericCount / samples.length > 0.8;
}

/**
 * Return true if more than 80% of the first 100 non-null feature property
 * samples for `field` match an ISO 8601 date pattern (YYYY-MM-DD…).
 */
export function isDateField(
  geojson: FeatureCollection,
  field: string
): boolean {
  // Common date patterns:
  // YYYY-MM-DD, YYYY-MM-DDThh:mm:ss...     (ISO 8601)
  // MM/DD/YYYY, M/D/YYYY                    (US format)
  // DD/MM/YYYY, D/M/YYYY                    (EU format — ambiguous, caught by same regex)
  // YYYY/MM/DD                              (alt ISO)
  // MM-DD-YYYY                              (US with dashes)
  // Also detect by field name heuristic
  const DATE_RES = [
    /^\d{4}-\d{1,2}-\d{1,2}([ T][\d:.Z+-]*)?$/,   // ISO: 2024-01-15, 2024-1-5T00:00:00Z
    /^\d{1,2}\/\d{1,2}\/\d{2,4}([ T][\d:.Z+-]*)?$/, // US/EU: 1/15/2024, 01/15/24
    /^\d{4}\/\d{1,2}\/\d{1,2}$/,                     // Alt: 2024/01/15
    /^\d{1,2}-\d{1,2}-\d{2,4}$/,                     // US dashes: 01-15-2024
  ];

  // Field name heuristic — names containing "date", "time", "dt" strongly suggest dates
  const nameLower = field.toLowerCase();
  const nameHint = /date|_dt$|_dt_|timestamp|inspdate|^dt_/.test(nameLower);

  const samples = geojson.features
    .slice(0, 100)
    .map((f) => f.properties?.[field])
    .filter((v) => v !== null && v !== undefined);

  if (samples.length === 0) return nameHint;

  const dateCount = samples.filter((v) => {
    if (typeof v !== 'string') return false;
    const trimmed = v.trim();
    if (trimmed === '') return false;
    return DATE_RES.some((re) => re.test(trimmed));
  }).length;

  // If field name hints at date, use a lower threshold (50%); otherwise 80%
  const threshold = nameHint ? 0.5 : 0.8;
  return dateCount / samples.length > threshold;
}

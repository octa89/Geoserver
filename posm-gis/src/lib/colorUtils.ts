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
  // Matches YYYY-MM-DD optionally followed by time component
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]*)?$/;

  const samples = geojson.features
    .slice(0, 100)
    .map((f) => f.properties?.[field])
    .filter((v) => v !== null && v !== undefined);

  if (samples.length === 0) return false;

  const dateCount = samples.filter(
    (v) => typeof v === 'string' && ISO_DATE_RE.test(v.trim())
  ).length;

  return dateCount / samples.length > 0.8;
}

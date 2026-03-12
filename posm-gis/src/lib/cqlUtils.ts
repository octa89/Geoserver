/**
 * Minimal CQL utility for backward compatibility with saved sessions
 * that contain active GeoServer filters.
 */

import type { FilterDef } from '../types/layer';

export function buildCqlFilter(
  filters: FilterDef[],
  mode: 'AND' | 'OR'
): string {
  if (filters.length === 0) return '';
  if (filters.length === 1) return filters[0].cql;
  return filters.map((f) => `(${f.cql})`).join(` ${mode} `);
}

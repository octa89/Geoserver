/**
 * searchMatch — pure matching logic for search conditions against GeoJSON features.
 *
 * Extracted from useAttributeSearch so it can be shared between the main app
 * (SearchPanel) and the read-only SharePage.
 */

import type { SavedSearchGroup } from '../types/session';

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

function coerceNumeric(val: string): number | null {
  if (val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

interface ConditionLike {
  field: string;
  operator: string;
  value: string;
  valueEnd?: string;
  layerName?: string;
}

function evaluateCondition(propValue: unknown, cond: ConditionLike): boolean {
  if (propValue == null) return false;
  const strProp = String(propValue);
  const { operator, value, valueEnd } = cond;

  switch (operator) {
    case 'CONTAINS':
      return strProp.toLowerCase().includes(value.toLowerCase());
    case '=': {
      const nProp = coerceNumeric(strProp);
      const nVal = coerceNumeric(value);
      if (nProp !== null && nVal !== null) return nProp === nVal;
      return strProp.toLowerCase() === value.toLowerCase();
    }
    case '!=': {
      const nProp = coerceNumeric(strProp);
      const nVal = coerceNumeric(value);
      if (nProp !== null && nVal !== null) return nProp !== nVal;
      return strProp.toLowerCase() !== value.toLowerCase();
    }
    case '>': {
      const nProp = coerceNumeric(strProp);
      const nVal = coerceNumeric(value);
      if (nProp !== null && nVal !== null) return nProp > nVal;
      return strProp.localeCompare(value) > 0;
    }
    case '<': {
      const nProp = coerceNumeric(strProp);
      const nVal = coerceNumeric(value);
      if (nProp !== null && nVal !== null) return nProp < nVal;
      return strProp.localeCompare(value) < 0;
    }
    case '>=': {
      const nProp = coerceNumeric(strProp);
      const nVal = coerceNumeric(value);
      if (nProp !== null && nVal !== null) return nProp >= nVal;
      return strProp.localeCompare(value) >= 0;
    }
    case '<=': {
      const nProp = coerceNumeric(strProp);
      const nVal = coerceNumeric(value);
      if (nProp !== null && nVal !== null) return nProp <= nVal;
      return strProp.localeCompare(value) <= 0;
    }
    case 'BETWEEN': {
      if (!valueEnd) return false;
      const nProp = coerceNumeric(strProp);
      const nLo = coerceNumeric(value);
      const nHi = coerceNumeric(valueEnd);
      if (nProp !== null && nLo !== null && nHi !== null) {
        return nProp >= nLo && nProp <= nHi;
      }
      return strProp.localeCompare(value) >= 0 && strProp.localeCompare(valueEnd) <= 0;
    }
    default:
      return false;
  }
}

function matchCondition(
  props: Record<string, unknown>,
  cond: ConditionLike,
  searchFields: string[]
): boolean {
  if (cond.field === '__any__') {
    for (const f of searchFields) {
      if (evaluateCondition(props[f], cond)) return true;
    }
    return false;
  }
  return evaluateCondition(props[cond.field], cond);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Given condition groups and a GeoJSON FeatureCollection per layer, return
 * a Set of matching feature indices per layer name.
 *
 * @param groups - The saved search condition groups
 * @param layerData - Map of layer name → { geojson, fields }
 * @returns Map of layer name → Set of matched feature indices
 */
export function matchConditionGroups(
  groups: SavedSearchGroup[],
  layerData: Map<string, { geojson: GeoJSON.FeatureCollection; fields: string[] }>
): Map<string, Set<number>> {
  const matchesByLayer = new Map<string, Set<number>>();

  for (const group of groups) {
    if (group.conditions.length === 0) continue;

    const data = layerData.get(group.layerName);
    if (!data) continue;

    const { geojson, fields } = data;
    const conditions = group.conditions;
    const combineMode = group.combineMode;

    for (let i = 0; i < geojson.features.length; i++) {
      const props = geojson.features[i].properties as Record<string, unknown> | null;
      if (!props) continue;

      let passes: boolean;
      if (combineMode === 'AND') {
        passes = true;
        for (const cond of conditions) {
          if (!matchCondition(props, cond, fields)) {
            passes = false;
            break;
          }
        }
      } else {
        passes = false;
        for (const cond of conditions) {
          if (matchCondition(props, cond, fields)) {
            passes = true;
            break;
          }
        }
      }

      if (passes) {
        let set = matchesByLayer.get(group.layerName);
        if (!set) {
          set = new Set();
          matchesByLayer.set(group.layerName, set);
        }
        set.add(i);
      }
    }
  }

  return matchesByLayer;
}

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

function coerceDate(val: string): number | null {
  const trimmed = val.trim();
  if (trimmed === '') return null;
  const ms = Date.parse(trimmed);
  if (!Number.isNaN(ms)) return ms;
  const slashParts = trimmed.split('/');
  if (slashParts.length === 3) {
    const [a, b, c] = slashParts.map(Number);
    const d = new Date(c, a - 1, b);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

interface ConditionLike {
  field: string;
  operator: string;
  value: string;
  valueEnd?: string;
  layerName?: string;
}

function evaluateCondition(propValue: unknown, cond: ConditionLike): boolean {
  // Null-checking operators must run before the null guard
  if (cond.operator === 'IS_NULL') return propValue == null || String(propValue).trim() === '';
  if (cond.operator === 'IS_NOT_NULL') return propValue != null && String(propValue).trim() !== '';

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
      const dProp0 = coerceDate(strProp);
      const dVal0 = coerceDate(value);
      if (dProp0 !== null && dVal0 !== null) return dProp0 === dVal0;
      return strProp.toLowerCase() === value.toLowerCase();
    }
    case '!=': {
      const nProp = coerceNumeric(strProp);
      const nVal = coerceNumeric(value);
      if (nProp !== null && nVal !== null) return nProp !== nVal;
      const dProp1 = coerceDate(strProp);
      const dVal1 = coerceDate(value);
      if (dProp1 !== null && dVal1 !== null) return dProp1 !== dVal1;
      return strProp.toLowerCase() !== value.toLowerCase();
    }
    case '>': {
      const nProp = coerceNumeric(strProp);
      const nVal = coerceNumeric(value);
      if (nProp !== null && nVal !== null) return nProp > nVal;
      const dProp2 = coerceDate(strProp);
      const dVal2 = coerceDate(value);
      if (dProp2 !== null && dVal2 !== null) return dProp2 > dVal2;
      return strProp.localeCompare(value) > 0;
    }
    case '<': {
      const nProp = coerceNumeric(strProp);
      const nVal = coerceNumeric(value);
      if (nProp !== null && nVal !== null) return nProp < nVal;
      const dProp3 = coerceDate(strProp);
      const dVal3 = coerceDate(value);
      if (dProp3 !== null && dVal3 !== null) return dProp3 < dVal3;
      return strProp.localeCompare(value) < 0;
    }
    case '>=': {
      const nProp = coerceNumeric(strProp);
      const nVal = coerceNumeric(value);
      if (nProp !== null && nVal !== null) return nProp >= nVal;
      const dProp4 = coerceDate(strProp);
      const dVal4 = coerceDate(value);
      if (dProp4 !== null && dVal4 !== null) return dProp4 >= dVal4;
      return strProp.localeCompare(value) >= 0;
    }
    case '<=': {
      const nProp = coerceNumeric(strProp);
      const nVal = coerceNumeric(value);
      if (nProp !== null && nVal !== null) return nProp <= nVal;
      const dProp5 = coerceDate(strProp);
      const dVal5 = coerceDate(value);
      if (dProp5 !== null && dVal5 !== null) return dProp5 <= dVal5;
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
      const dPropB = coerceDate(strProp);
      const dLoB = coerceDate(value);
      const dHiB = coerceDate(valueEnd);
      if (dPropB !== null && dLoB !== null && dHiB !== null) {
        return dPropB >= dLoB && dPropB <= dHiB;
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

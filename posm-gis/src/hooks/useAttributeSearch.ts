/**
 * useAttributeSearch — client-side attribute search across loaded GeoJSON layers.
 *
 * Searches are performed against the in-memory GeoJSON stored in the
 * leaflet registry, so they're instant with no network round-trip.
 *
 * Performance: search is time-budgeted (max 12ms) to never block a frame.
 */

import { useCallback, useRef } from 'react';
import L from 'leaflet';
import { getAllLayerRefs, getLayerRefs } from '../store/leafletRegistry';
import { useStore } from '../store';
import type { SearchCondition, ConditionGroup } from '../components/search/searchTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResult {
  layerName: string;
  layerLabel: string;
  featureIndex: number;
  properties: Record<string, unknown>;
  matchedField: string;
  matchedValue: string;
  geometry: GeoJSON.Geometry;
  layerColor: string;
}

export interface UseAttributeSearchReturn {
  search: (query: string, layerName?: string) => SearchResult[];
  structuredSearch: (
    conditions: SearchCondition[],
    combineMode: 'AND' | 'OR',
    layerName?: string
  ) => SearchResult[];
  groupedSearch: (groups: ConditionGroup[]) => SearchResult[];
  getLayerFields: (layerName: string) => string[];
  getAllFields: () => string[];
  highlightFeature: (
    map: L.Map,
    result: SearchResult
  ) => { cleanup: () => void };
  zoomToFeature: (map: L.Map, result: SearchResult) => void;
}

// ---------------------------------------------------------------------------
// Condition evaluation (pure function)
// ---------------------------------------------------------------------------

function coerceNumeric(val: string): number | null {
  if (val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * Evaluate a single search condition against a property value.
 */
function evaluateCondition(
  propValue: unknown,
  cond: SearchCondition
): boolean {
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

/**
 * Test whether a feature's properties satisfy a condition.
 * When field is '__any__', tests against ALL searchFields and returns
 * the first matching field name (or null if none match).
 */
function matchCondition(
  props: Record<string, unknown>,
  cond: SearchCondition,
  searchFields: string[]
): { matched: boolean; field: string; value: string } {
  if (cond.field === '__any__') {
    for (const f of searchFields) {
      const val = props[f];
      if (evaluateCondition(val, cond)) {
        return { matched: true, field: f, value: String(val) };
      }
    }
    return { matched: false, field: '', value: '' };
  }

  const val = props[cond.field];
  if (evaluateCondition(val, cond)) {
    return { matched: true, field: cond.field, value: String(val ?? '') };
  }
  return { matched: false, field: '', value: '' };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const MAX_RESULTS = 1000;
const MAX_RESULTS_PER_GROUP = 500;
const SEARCH_BUDGET_MS_ALL = 200;

export function useAttributeSearch(): UseAttributeSearchReturn {
  const highlightLayerRef = useRef<L.Layer | null>(null);

  /**
   * Basic text search (unchanged).
   */
  const search = useCallback(
    (query: string, layerName?: string): SearchResult[] => {
      const q = query.trim();
      if (q.length < 2) return [];

      const qLower = q.toLowerCase();
      const layers = useStore.getState().layers;
      const allRefs = getAllLayerRefs();
      const results: SearchResult[] = [];
      const deadline = layerName ? Infinity : performance.now() + SEARCH_BUDGET_MS_ALL;

      const layersToSearch = layerName
        ? [[layerName, allRefs.get(layerName)] as const].filter(
            ([, refs]) => refs != null
          )
        : Array.from(allRefs.entries());

      for (const [name, refs] of layersToSearch) {
        if (results.length >= MAX_RESULTS) break;
        if (performance.now() > deadline) break;
        if (!refs) continue;
        const config = layers[name];
        if (!config) continue;

        const searchFields = config.fields;
        if (searchFields.length === 0) continue;

        const features = refs.geojson.features;

        for (let i = 0; i < features.length; i++) {
          if (results.length >= MAX_RESULTS) break;
          if (i % 200 === 0 && performance.now() > deadline) break;

          const props = features[i].properties;
          if (!props) continue;

          for (const field of searchFields) {
            const value = props[field];
            if (value == null) continue;
            const strVal = String(value);
            if (strVal.toLowerCase().includes(qLower)) {
              results.push({
                layerName: name,
                layerLabel: config.label,
                featureIndex: i,
                properties: props as Record<string, unknown>,
                matchedField: field,
                matchedValue: strVal,
                geometry: features[i].geometry,
                layerColor: config.color,
              });
              break;
            }
          }
        }
      }

      return results;
    },
    []
  );

  /**
   * Structured / advanced search with field + operator + value conditions.
   *
   * Each condition may have a `layerName` — if set, that condition only
   * applies to features in that specific layer (skipped for others).
   * When combining with AND, a feature must satisfy all conditions that
   * target its layer (conditions targeting other layers are ignored).
   * When combining with OR, a feature matches if ANY condition targeting
   * its layer (or having no layer) matches.
   */
  const structuredSearch = useCallback(
    (
      conditions: SearchCondition[],
      combineMode: 'AND' | 'OR',
      layerName?: string
    ): SearchResult[] => {
      if (conditions.length === 0) return [];

      const layers = useStore.getState().layers;
      const allRefs = getAllLayerRefs();
      const results: SearchResult[] = [];
      const deadline = layerName ? Infinity : performance.now() + SEARCH_BUDGET_MS_ALL;

      // Determine which layers to iterate based on conditions' layerName targets
      const condLayerNames = new Set(
        conditions.map((c) => c.layerName).filter(Boolean) as string[]
      );

      const layersToSearch = layerName
        ? [[layerName, allRefs.get(layerName)] as const].filter(
            ([, refs]) => refs != null
          )
        : condLayerNames.size > 0
          ? // Only search layers that are targeted by at least one condition
            Array.from(condLayerNames)
              .map((n) => [n, allRefs.get(n)] as const)
              .filter(([, refs]) => refs != null)
          : Array.from(allRefs.entries());

      for (const [name, refs] of layersToSearch) {
        if (results.length >= MAX_RESULTS) break;
        if (performance.now() > deadline) break;
        if (!refs) continue;
        const config = layers[name];
        if (!config) continue;

        const searchFields = config.fields;
        if (searchFields.length === 0) continue;

        // Filter conditions relevant to this layer
        const relevantConds = conditions.filter(
          (c) => !c.layerName || c.layerName === name
        );
        if (relevantConds.length === 0) continue;

        const features = refs.geojson.features;

        for (let i = 0; i < features.length; i++) {
          if (results.length >= MAX_RESULTS) break;
          if (i % 200 === 0 && performance.now() > deadline) break;

          const props = features[i].properties;
          if (!props) continue;

          // Evaluate relevant conditions against this feature
          let firstMatch = { field: '', value: '' };
          let passes: boolean;

          if (combineMode === 'AND') {
            passes = true;
            for (const cond of relevantConds) {
              const m = matchCondition(
                props as Record<string, unknown>,
                cond,
                searchFields
              );
              if (!m.matched) {
                passes = false;
                break;
              }
              if (!firstMatch.field) firstMatch = m;
            }
          } else {
            // OR
            passes = false;
            for (const cond of relevantConds) {
              const m = matchCondition(
                props as Record<string, unknown>,
                cond,
                searchFields
              );
              if (m.matched) {
                passes = true;
                if (!firstMatch.field) firstMatch = m;
                break;
              }
            }
          }

          if (passes && firstMatch.field) {
            results.push({
              layerName: name,
              layerLabel: config.label,
              featureIndex: i,
              properties: props as Record<string, unknown>,
              matchedField: firstMatch.field,
              matchedValue: firstMatch.value,
              geometry: features[i].geometry,
              layerColor: config.color,
            });
          }
        }
      }

      return results;
    },
    []
  );

  /**
   * Grouped search — each group targets a specific layer with its own
   * combineMode. Groups are OR'd together (union of results).
   */
  const groupedSearch = useCallback(
    (groups: ConditionGroup[]): SearchResult[] => {
      const results: SearchResult[] = [];
      const seen = new Set<string>();

      // Process every group — each gets up to MAX_RESULTS_PER_GROUP
      for (const group of groups) {
        if (group.conditions.length === 0) continue;

        const groupResults = structuredSearch(
          group.conditions,
          group.combineMode,
          group.layerName
        );

        let groupCount = 0;
        for (const r of groupResults) {
          if (groupCount >= MAX_RESULTS_PER_GROUP) break;
          const key = `${r.layerName}:${r.featureIndex}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push(r);
            groupCount++;
          }
        }
      }

      return results;
    },
    [structuredSearch]
  );

  const getLayerFields = useCallback((layerName: string): string[] => {
    const config = useStore.getState().layers[layerName];
    return config?.fields ?? [];
  }, []);

  /**
   * Get the union of all fields across all loaded layers.
   */
  const getAllFields = useCallback((): string[] => {
    const layers = useStore.getState().layers;
    const fieldSet = new Set<string>();
    for (const config of Object.values(layers)) {
      for (const f of config.fields) fieldSet.add(f);
    }
    return Array.from(fieldSet).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
  }, []);

  /**
   * Highlight a feature on the map with a bright temporary overlay.
   */
  const highlightFeature = useCallback(
    (map: L.Map, result: SearchResult): { cleanup: () => void } => {
      if (highlightLayerRef.current && map.hasLayer(highlightLayerRef.current)) {
        map.removeLayer(highlightLayerRef.current);
      }

      const refs = getLayerRefs(result.layerName);
      if (!refs) return { cleanup: () => {} };

      const feature = refs.geojson.features[result.featureIndex];
      if (!feature) return { cleanup: () => {} };

      const highlightLayer = L.geoJSON(feature as GeoJSON.Feature, {
        pointToLayer: (_f, latlng) =>
          L.circleMarker(latlng, {
            radius: 14,
            color: '#ffeb3b',
            weight: 3,
            fillColor: '#ffeb3b',
            fillOpacity: 0.35,
          }),
        style: () => ({
          color: '#ffeb3b',
          weight: 4,
          fillColor: '#ffeb3b',
          fillOpacity: 0.2,
          dashArray: '6 4',
        }),
      });

      highlightLayer.addTo(map);
      highlightLayerRef.current = highlightLayer;

      const timer = setTimeout(() => {
        if (map.hasLayer(highlightLayer)) {
          map.removeLayer(highlightLayer);
        }
        if (highlightLayerRef.current === highlightLayer) {
          highlightLayerRef.current = null;
        }
      }, 8000);

      return {
        cleanup: () => {
          clearTimeout(timer);
          if (map.hasLayer(highlightLayer)) {
            map.removeLayer(highlightLayer);
          }
          if (highlightLayerRef.current === highlightLayer) {
            highlightLayerRef.current = null;
          }
        },
      };
    },
    []
  );

  /**
   * Fly the map to a search result feature.
   */
  const zoomToFeature = useCallback(
    (map: L.Map, result: SearchResult) => {
      const geom = result.geometry;

      const coords: [number, number][] = [];
      const extract = (c: unknown) => {
        if (Array.isArray(c)) {
          if (typeof c[0] === 'number') {
            coords.push([c[1] as number, c[0] as number]);
          } else {
            for (const sub of c) extract(sub);
          }
        }
      };

      if ('coordinates' in geom) {
        extract(geom.coordinates);
      }

      if (coords.length === 0) return;

      const bounds = L.latLngBounds(coords);
      if (!bounds.isValid()) return;

      if (geom.type === 'Point' || geom.type === 'MultiPoint') {
        map.flyTo(bounds.getCenter(), Math.max(map.getZoom(), 18), {
          duration: 0.8,
        });
      } else {
        map.flyToBounds(bounds, {
          padding: [40, 40],
          maxZoom: 19,
          duration: 0.8,
        });
      }
    },
    []
  );

  return {
    search,
    structuredSearch,
    groupedSearch,
    getLayerFields,
    getAllFields,
    highlightFeature,
    zoomToFeature,
  };
}

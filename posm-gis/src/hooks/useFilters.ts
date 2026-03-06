/**
 * useFilters hook
 *
 * Provides an `applyFilters(layerName)` function that:
 * 1. Reads the layer's current activeFilters and filterCombineMode from the store.
 * 2. Builds a CQL filter string from those filters.
 * 3. Re-fetches the layer GeoJSON from GeoServer with the CQL filter applied.
 * 4. Removes the existing Leaflet layer (or its cluster group) from the map.
 * 5. Creates a new Leaflet GeoJSON layer from the filtered data.
 * 6. Re-applies the layer's existing symbology.
 * 7. Re-binds popups.
 * 8. Registers the new layer refs in the non-reactive registry.
 *
 * This hook follows the same imperative pattern as useLayers.ts, keeping all
 * Leaflet mutations outside of React's render cycle.
 */

import { useCallback } from 'react';
import type { RefObject } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { useStore } from '../store';
import { getLayerRefs, setLayerRefs } from '../store/leafletRegistry';
import { fetchLayerGeoJSON } from '../lib/geoserver';
import { buildCqlFilter } from '../components/filter/filterUtils';
import { createPointMarker } from '../lib/markers';
import { darkenColor } from '../lib/colorUtils';
import { defaultStyle, recolorSymbology } from '../lib/symbology';
import { detectGeomType } from '../lib/fieldUtils';
import { bindPopups } from '../components/popup/FeaturePopup';
import { removeLabels, applyLabels, computeLabelMinZoom, updateLabelVisibility } from '../lib/labels';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Mirror of the threshold used in useLayers.ts */
const CLUSTER_THRESHOLD = 200;

// ---------------------------------------------------------------------------
// useFilters
// ---------------------------------------------------------------------------

export function useFilters(mapRef: RefObject<L.Map | null>) {
  const setLoading = useStore((s) => s.setLoading);

  const applyFilters = useCallback(
    async (layerName: string) => {
      const map = mapRef.current;
      if (!map) return;

      // Snapshot the current layer config at call time
      const layerConfig = useStore.getState().layers[layerName];
      if (!layerConfig) {
        console.warn(`useFilters: unknown layer "${layerName}"`);
        return;
      }

      const { activeFilters, filterCombineMode, fullName, color, geomType,
              pointSymbol, clustered, symbology, fields } = layerConfig;

      // Build CQL from current filters
      const cqlFilter = buildCqlFilter(activeFilters, filterCombineMode);

      setLoading(true, `Filtering ${layerConfig.label ?? layerName}…`);

      try {
        // 1. Fetch filtered GeoJSON from GeoServer
        const geojson = await fetchLayerGeoJSON(
          fullName,
          cqlFilter || undefined
        );

        // 2. Remove existing Leaflet layer from map
        const existing = getLayerRefs(layerName);
        if (existing) {
          const toRemove = existing.clusterGroup ?? existing.leafletLayer;
          if (map.hasLayer(toRemove)) {
            map.removeLayer(toRemove);
          }
          // Also clean up arrow decorators if any
          for (const decorator of existing.arrowDecorators ?? []) {
            if (map.hasLayer(decorator)) map.removeLayer(decorator);
          }
          // Clean up label manager if any
          if (existing.labelManager) {
            removeLabels(map, existing.labelManager);
          }
        }

        // 3. Detect geometry type from fresh data (may differ from original if
        //    filtered to zero features, so fall back to stored geomType)
        const resolvedGeomType =
          geojson.features.length > 0
            ? detectGeomType(geojson)
            : geomType;

        const isPoint =
          resolvedGeomType === 'Point' || resolvedGeomType === 'MultiPoint';
        const darker = darkenColor(color);

        // 4. Build new Leaflet GeoJSON layer
        const leafletLayer = L.geoJSON(geojson, {
          pointToLayer: isPoint
            ? (_feature, latlng) =>
                createPointMarker(latlng, pointSymbol, color, darker, 10)
            : undefined,
          style: !isPoint
            ? () => defaultStyle(resolvedGeomType, color)
            : undefined,
        });

        // 5. Re-apply existing symbology (if any) — use recolorSymbology
        // so user-edited colors are preserved instead of recomputed.
        if (symbology) {
          try {
            recolorSymbology(
              leafletLayer,
              geojson,
              resolvedGeomType,
              pointSymbol,
              symbology
            );
          } catch (e) {
            console.warn('useFilters: could not re-apply symbology', e);
          }
        }

        // 6. Bind popups
        bindPopups(leafletLayer, layerName, fields);

        // 7. Handle clustering for point layers
        const shouldCluster =
          isPoint && clustered && geojson.features.length > CLUSTER_THRESHOLD;

        let clusterGroup: L.MarkerClusterGroup | null = null;
        if (shouldCluster) {
          clusterGroup = (
            L as unknown as {
              markerClusterGroup: (opts: object) => L.MarkerClusterGroup;
            }
          ).markerClusterGroup({
            disableClusteringAtZoom: 20,
            chunkedLoading: true,
          });
          clusterGroup.addLayer(leafletLayer);
        }

        // 8. Add to map only if the layer is currently visible
        const mapLayer: L.Layer = clusterGroup ?? leafletLayer;
        if (layerConfig.visible) {
          mapLayer.addTo(map);
        }

        // 9. Re-create labels if a label field was active
        let newLabelManager = null;
        if (layerConfig.labelField) {
          newLabelManager = applyLabels(map, geojson, resolvedGeomType, color, layerConfig.labelField);
          const minZoom = computeLabelMinZoom(geojson);
          updateLabelVisibility(map, newLabelManager, map.getZoom(), layerConfig.visible, minZoom);
        }

        // 10. Update the non-reactive registry
        setLayerRefs(layerName, {
          leafletLayer,
          clusterGroup,
          geojson,
          arrowDecorators: [],
          labelManager: newLabelManager,
        });

        // 11. Update only the feature count — never overwrite the full layer config
        useStore.getState().setLayerFeatureCount(layerName, geojson.features.length);

      } catch (err) {
        console.error(`useFilters: failed to apply filters for "${layerName}"`, err);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapRef, setLoading]
  );

  return { applyFilters };
}

import { useCallback } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { useStore } from '../store';
import { setLayerRefs } from '../store/leafletRegistry';
import { discoverLayers, fetchLayerGeoJSON } from '../lib/geoserver';
import { extractFields, detectGeomType } from '../lib/fieldUtils';
import { createPointMarker } from '../lib/markers';
import { darkenColor } from '../lib/colorUtils';
import { defaultStyle } from '../lib/symbology';
import { bindPopups } from '../components/popup/FeaturePopup';
import { LAYER_COLORS } from '../config/constants';
import type { LayerConfig } from '../types/layer';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Feature count threshold above which a point layer is clustered. */
const CLUSTER_THRESHOLD = 200;

// ---------------------------------------------------------------------------
// createLeafletLayer
// ---------------------------------------------------------------------------

interface CreateLayerResult {
  leafletLayer: L.GeoJSON;
  clusterGroup: L.MarkerClusterGroup | null;
  geomType: string;
}

/**
 * Build a Leaflet GeoJSON layer (with optional marker-cluster wrapper) from
 * a raw FeatureCollection.
 *
 * - Points use createPointMarker for per-feature icons.
 * - Lines and polygons use the Leaflet path style from defaultStyle.
 * - If the layer is a point layer with more than CLUSTER_THRESHOLD features,
 *   it is wrapped in an L.markerClusterGroup with clustering disabled at
 *   zoom >= 20 (so individual markers appear at max zoom).
 */
function createLeafletLayer(
  geojson: GeoJSON.FeatureCollection,
  color: string,
  pointSymbol: string,
  clustered: boolean
): CreateLayerResult {
  const geomType = detectGeomType(geojson);
  const isPoint = geomType === 'Point' || geomType === 'MultiPoint';
  const darker = darkenColor(color);

  const leafletLayer = L.geoJSON(geojson, {
    // Points: custom marker per feature
    pointToLayer: isPoint
      ? (_feature, latlng) =>
          createPointMarker(latlng, pointSymbol, color, darker, 10)
      : undefined,

    // Lines / Polygons: Leaflet path style
    style: !isPoint
      ? () => defaultStyle(geomType, color)
      : undefined,

    // Popup click handlers are wired via bindPopups() after layer creation
  });

  // Cluster point layers that exceed the threshold
  const shouldCluster =
    isPoint && clustered && geojson.features.length > CLUSTER_THRESHOLD;

  let clusterGroup: L.MarkerClusterGroup | null = null;
  if (shouldCluster) {
    clusterGroup = (L as unknown as { markerClusterGroup: (opts: object) => L.MarkerClusterGroup }).markerClusterGroup({
      disableClusteringAtZoom: 20,
      chunkedLoading: true,
    });
    clusterGroup.addLayer(leafletLayer);
  }

  return { leafletLayer, clusterGroup, geomType };
}

// ---------------------------------------------------------------------------
// useLayers hook
// ---------------------------------------------------------------------------

/**
 * React hook that exposes `loadAllLayers`, an async function that:
 * 1. Discovers all layers for the given workspaces via WFS GetCapabilities.
 * 2. Fetches GeoJSON for each layer.
 * 3. Builds a Leaflet GeoJSON layer (with optional clustering).
 * 4. Adds the layer (or its cluster group) to the map.
 * 5. Persists serialisable config to Zustand (`setLayer`).
 * 6. Persists Leaflet refs to the non-reactive registry (`setLayerRefs`).
 * 7. Returns the combined bounds of all loaded layers for `map.fitBounds`.
 */
export function useLayers(mapRef: React.RefObject<L.Map | null>) {
  const setLayer = useStore((s) => s.setLayer);
  const setLoading = useStore((s) => s.setLoading);

  const loadAllLayers = useCallback(
    async (workspaces: string[]): Promise<L.LatLngBounds | null> => {
      const map = mapRef.current;
      if (!map) return null;

      setLoading(true, 'Discovering layers…');

      let allBounds: L.LatLngBounds | null = null;

      try {
        // Step 1: Discover layers across all workspaces
        const discovered = await discoverLayers(workspaces);

        setLoading(true, `Loading ${discovered.length} layer(s)…`);

        // Step 2: Fetch GeoJSON for each layer in parallel
        const results = await Promise.allSettled(
          discovered.map((layer) => fetchLayerGeoJSON(layer.fullName))
        );

        results.forEach((result, idx) => {
          if (result.status === 'rejected') {
            console.warn(
              `Failed to load layer "${discovered[idx].fullName}":`,
              result.reason
            );
            return;
          }

          const geojson = result.value;
          const layerMeta = discovered[idx];
          const color = LAYER_COLORS[idx % LAYER_COLORS.length];

          // Step 3: Create the Leaflet layer
          const { leafletLayer, clusterGroup, geomType } = createLeafletLayer(
            geojson,
            color,
            'circle',   // default symbol; user can change via LayerItem
            true        // attempt clustering for point layers > threshold
          );

          // Step 4: Add to map (prefer cluster group when available)
          const mapLayer: L.Layer = clusterGroup ?? leafletLayer;
          mapLayer.addTo(map);

          // Step 5: Compute bounds contribution
          try {
            const layerBounds = leafletLayer.getBounds();
            if (layerBounds.isValid()) {
              allBounds = allBounds
                ? allBounds.extend(layerBounds)
                : layerBounds;
            }
          } catch {
            // getBounds() can throw for empty layers
          }

          // Step 6: Bind click popups to every feature
          const fields = extractFields(geojson);
          bindPopups(leafletLayer, layerMeta.fullName, fields);

          // Step 7: Build serialisable LayerConfig and persist to Zustand
          const config: LayerConfig = {
            fullName: layerMeta.fullName,
            label: layerMeta.label,
            visible: true,
            color,
            geomType,
            pointSymbol: 'circle',
            clustered: clusterGroup !== null,
            showArrows: false,
            showFlowPulse: false,
            labelField: null,
            fields,
            featureCount: geojson.features.length,
            totalFeatureCount: geojson.features.length,
            symbology: null,
            activeFilters: [],
            filterCombineMode: 'AND',
            popupConfig: null,
            ageConfig: null,
            opacity: 1,
          };
          setLayer(layerMeta.fullName, config);

          // Step 7: Persist Leaflet refs to the non-reactive registry
          setLayerRefs(layerMeta.fullName, {
            leafletLayer,
            clusterGroup,
            geojson,
            arrowDecorators: [],
            flowPulseCleanup: null,
            labelManager: null,
          });
        });
      } catch (err) {
        console.error('Layer discovery failed:', err);
      } finally {
        setLoading(false);
      }

      return allBounds;
    },
    [mapRef, setLayer, setLoading]
  );

  return { loadAllLayers };
}

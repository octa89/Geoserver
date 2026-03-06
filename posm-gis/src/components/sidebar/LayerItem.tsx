import { useCallback } from 'react';
import type { RefObject } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { useStore } from '../../store';
import { getLayerRefs, setLayerRefs } from '../../store/leafletRegistry';
import { darkenColor } from '../../lib/colorUtils';
import { applyLabels, removeLabels, computeLabelMinZoom, updateLabelVisibility } from '../../lib/labels';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LayerItemProps {
  name: string;
  mapRef: RefObject<L.Map | null>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return a CSS color swatch style for the layer's geometry type and color.
 * - Points:   round circle
 * - Lines:    a horizontal bar (wide, short)
 * - Polygons: a filled rectangle
 */
function swatchStyle(
  color: string,
  geomType: string
): React.CSSProperties {
  const isPoint = geomType === 'Point' || geomType === 'MultiPoint';
  const isLine =
    geomType === 'LineString' || geomType === 'MultiLineString';

  if (isPoint) {
    return {
      width: 12,
      height: 12,
      borderRadius: '50%',
      backgroundColor: color,
      border: `2px solid ${darkenColor(color)}`,
      flexShrink: 0,
      display: 'inline-block',
    };
  }

  if (isLine) {
    return {
      width: 20,
      height: 4,
      borderRadius: 2,
      backgroundColor: color,
      flexShrink: 0,
      display: 'inline-block',
    };
  }

  // Polygon
  return {
    width: 14,
    height: 10,
    borderRadius: 2,
    backgroundColor: color,
    border: `1.5px solid ${darkenColor(color)}`,
    flexShrink: 0,
    display: 'inline-block',
    opacity: 0.7,
  };
}

// ---------------------------------------------------------------------------
// LayerItem
// ---------------------------------------------------------------------------

/**
 * A single row in the layer panel representing one GeoServer layer.
 *
 * Features:
 * - Visibility checkbox: adds/removes the layer (or cluster group) from the map.
 * - Color swatch:        reflects geomType-appropriate shape and layer color.
 * - Layer label:         human-readable name from GeoServer.
 * - Feature count:       shown in parentheses.
 * - Cluster toggle:      for point layers only — rebuilds the Leaflet layer
 *                        with or without an L.markerClusterGroup.
 * - Label field:         dropdown to select which property to render as a
 *                        Leaflet tooltip; "No labels" removes tooltips.
 */
export function LayerItem({ name, mapRef }: LayerItemProps) {
  const layer = useStore((s) => s.layers[name]);
  const setLayerVisibility = useStore((s) => s.setLayerVisibility);
  const setLayerClustered = useStore((s) => s.setLayerClustered);
  const setLayerLabelField = useStore((s) => s.setLayerLabelField);

  // Guard: layer might not be in the store yet during concurrent updates
  if (!layer) return null;

  const {
    label,
    visible,
    color,
    geomType,
    clustered,
    labelField,
    fields,
    featureCount,
    totalFeatureCount,
    activeFilters,
  } = layer;

  const isFiltered = activeFilters && activeFilters.length > 0;

  const isPoint = geomType === 'Point' || geomType === 'MultiPoint';

  // ---- Visibility toggle --------------------------------------------------

  const handleVisibilityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const nowVisible = e.target.checked;
      const map = mapRef.current;
      if (!map) return;

      const refs = getLayerRefs(name);
      if (!refs) return;

      const mapLayer = refs.clusterGroup ?? refs.leafletLayer;

      if (nowVisible) {
        if (!map.hasLayer(mapLayer)) {
          mapLayer.addTo(map);
        }
        // Re-add arrow decorators if any
        for (const dec of refs.arrowDecorators ?? []) {
          if (!map.hasLayer(dec)) dec.addTo(map);
        }
        // Restore labels if any
        if (refs.labelManager) {
          const minZoom = computeLabelMinZoom(refs.geojson);
          updateLabelVisibility(map, refs.labelManager, map.getZoom(), true, minZoom);
        }
      } else {
        if (map.hasLayer(mapLayer)) {
          map.removeLayer(mapLayer);
        }
        // Also remove arrow decorators
        for (const dec of refs.arrowDecorators ?? []) {
          if (map.hasLayer(dec)) map.removeLayer(dec);
        }
        // Hide labels when layer is hidden
        if (refs.labelManager) {
          const minZoom = computeLabelMinZoom(refs.geojson);
          updateLabelVisibility(map, refs.labelManager, map.getZoom(), false, minZoom);
        }
      }

      setLayerVisibility(name, nowVisible);
    },
    [name, mapRef, setLayerVisibility]
  );

  // ---- Cluster toggle (points only) ----------------------------------------

  const handleClusterToggle = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const refs = getLayerRefs(name);
    if (!refs) return;

    const { leafletLayer } = refs;
    const willCluster = !clustered;

    // Remove whatever is currently on the map
    const currentMapLayer = refs.clusterGroup ?? leafletLayer;
    if (map.hasLayer(currentMapLayer)) {
      map.removeLayer(currentMapLayer);
    }

    let newClusterGroup: L.MarkerClusterGroup | null = null;

    if (willCluster && featureCount > 200) {
      // Rebuild cluster group wrapping the existing leafletLayer
      newClusterGroup = (
        L as unknown as {
          markerClusterGroup: (opts: object) => L.MarkerClusterGroup;
        }
      ).markerClusterGroup({
        disableClusteringAtZoom: 20,
        chunkedLoading: true,
      });
      newClusterGroup.addLayer(leafletLayer);
    }

    // Add the updated layer to the map (respecting current visibility)
    if (visible) {
      const nextMapLayer = newClusterGroup ?? leafletLayer;
      nextMapLayer.addTo(map);
    }

    // Update the registry with the new cluster ref
    setLayerRefs(name, { ...refs, clusterGroup: newClusterGroup });

    // Update Zustand
    setLayerClustered(name, willCluster);
  }, [name, mapRef, clustered, visible, featureCount, setLayerClustered]);

  // ---- Label field change ---------------------------------------------------

  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const map = mapRef.current;
      if (!map) return;

      const refs = getLayerRefs(name);
      if (!refs) return;

      const selected = e.target.value === '__none__' ? null : e.target.value;

      // Remove existing label manager if any
      if (refs.labelManager) {
        removeLabels(map, refs.labelManager);
        setLayerRefs(name, { ...refs, labelManager: null });
      }

      // Create new label manager when a field is selected
      if (selected) {
        const mgr = applyLabels(map, refs.geojson, geomType, color, selected);
        const minZoom = computeLabelMinZoom(refs.geojson);

        // Immediately apply zoom visibility check
        const zoom = map.getZoom();
        updateLabelVisibility(map, mgr, zoom, visible, minZoom);

        setLayerRefs(name, { ...getLayerRefs(name)!, labelManager: mgr });
      }

      setLayerLabelField(name, selected);
    },
    [name, mapRef, geomType, color, visible, setLayerLabelField]
  );

  // ---- Zoom to layer extent ---------------------------------------------------

  const handleZoomToLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const refs = getLayerRefs(name);
    if (!refs) return;
    try {
      const bounds = refs.leafletLayer.getBounds();
      if (!bounds.isValid()) return;
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      if (ne.lat === sw.lat && ne.lng === sw.lng) {
        map.flyTo(bounds.getCenter(), 16, { duration: 0.7 });
      } else {
        map.flyToBounds(bounds, { padding: [40, 40], duration: 0.7 });
      }
    } catch { /* empty/invalid layer */ }
  }, [name, mapRef]);

  // ---- Render ----------------------------------------------------------------

  const darker = darkenColor(color);
  return (
    <div
      className="layer-item"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 0',
        flexWrap: 'wrap',
      }}
    >
      {/* Visibility checkbox */}
      <input
        type="checkbox"
        checked={visible}
        onChange={handleVisibilityChange}
        aria-label={`Toggle visibility of ${label}`}
        style={{ flexShrink: 0 }}
      />

      {/* Color swatch */}
      <span
        style={swatchStyle(color, geomType)}
        aria-hidden="true"
        title={geomType}
      />

      {/* Layer label + feature count */}
      <span
        className="layer-item-label"
        style={{
          flex: 1,
          fontSize: 13,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={name}
      >
        {label}{' '}
        <span style={{ color: isFiltered ? '#42d4f4' : '#999', fontSize: 11 }}>
          {isFiltered
            ? `(${featureCount.toLocaleString()}/${totalFeatureCount.toLocaleString()})`
            : `(${featureCount.toLocaleString()})`}
        </span>
      </span>

      {/* Zoom to layer extent */}
      <button
        onClick={handleZoomToLayer}
        title="Zoom to layer extent"
        disabled={featureCount === 0}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: featureCount === 0 ? 'not-allowed' : 'pointer',
          color: '#888',
          opacity: featureCount === 0 ? 0.4 : 1,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          transition: 'color 0.15s, transform 0.15s',
        }}
        onMouseEnter={(e) => {
          if (featureCount > 0) {
            e.currentTarget.style.color = '#42d4f4';
            e.currentTarget.style.transform = 'scale(1.15)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#888';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="7" />
          <line x1="15" y1="15" x2="21" y2="21" />
        </svg>
      </button>

      {/* Cluster toggle — points only */}
      {isPoint && (
        <button
          onClick={handleClusterToggle}
          title={clustered ? 'Disable clustering' : 'Enable clustering'}
          aria-pressed={clustered}
          style={{
            fontSize: 11,
            padding: '1px 5px',
            cursor: 'pointer',
            background: clustered ? darker : 'transparent',
            color: clustered ? '#fff' : '#555',
            border: `1px solid ${darker}`,
            borderRadius: 3,
            flexShrink: 0,
          }}
        >
          {clustered ? 'Clustered' : 'Cluster'}
        </button>
      )}

      {/* Label field selector */}
      <select
        value={labelField ?? '__none__'}
        onChange={handleLabelChange}
        aria-label={`Label field for ${label}`}
        style={{
          fontSize: 11,
          padding: '1px 3px',
          maxWidth: 110,
          flexShrink: 0,
        }}
      >
        <option value="__none__">No labels</option>
        {fields.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
    </div>
  );
}

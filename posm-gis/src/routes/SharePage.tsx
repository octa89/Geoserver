import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';

import { fetchLayerGeoJSON } from '../lib/geoserver';
import { detectGeomType } from '../lib/fieldUtils';
import { defaultStyle, recolorSymbology } from '../lib/symbology';
import { createPointMarker } from '../lib/markers';
import { darkenColor } from '../lib/colorUtils';
import { buildCqlFilter } from '../components/filter/filterUtils';
import { smartSortFields, formatPopupValue, escapeHtml } from '../lib/popupUtils';
import { applyLabels, computeLabelMinZoom, initLabelMoveListener, removeLabels } from '../lib/labels';
import type { LabelManager } from '../lib/labels';
import { BASEMAPS, LAYER_COLORS } from '../config/constants';
import { loadShareSnapshot } from '../lib/api';
import { ShareLegend } from '../components/legend/ShareLegend';
import type { ShareLayerInfo } from '../components/legend/ShareLegend';
import type { BasemapKey } from '../config/constants';
import type { ShareSnapshot } from '../types/share';
import type { PerLayerConfig } from '../types/session';
import type { PopupConfig } from '../types/layer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a date string for human display. */
function formatDate(iso: string | undefined): string {
  if (!iso) return 'Unknown date';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Read-only popup binding (no gear button, no store dependency)
// ---------------------------------------------------------------------------

function getPopupFields(
  props: Record<string, unknown>,
  popupConfig: PopupConfig | null | undefined
): string[] {
  if (popupConfig?.fieldOrder) {
    const hidden = popupConfig.hiddenFields || {};
    return popupConfig.fieldOrder.filter(
      (k) => !hidden[k] && props[k] != null && props[k] !== ''
    );
  }
  return smartSortFields(props);
}

function getPopupTitle(
  props: Record<string, unknown>,
  layerLabel: string,
  popupConfig: PopupConfig | null | undefined
): string {
  if (popupConfig) {
    if (popupConfig.titleField && props[popupConfig.titleField] != null && props[popupConfig.titleField] !== '') {
      const prefix = popupConfig.titleText ? popupConfig.titleText + ' ' : '';
      return prefix + String(props[popupConfig.titleField]);
    }
    if (popupConfig.titleText) return popupConfig.titleText;
  }
  return layerLabel;
}

function buildSharePopupHtml(
  props: Record<string, unknown>,
  layerLabel: string,
  popupConfig: PopupConfig | null | undefined
): string {
  const title = getPopupTitle(props, layerLabel, popupConfig);
  const keys = getPopupFields(props, popupConfig);

  let tableRows = '';
  let hasContent = false;
  for (const k of keys) {
    const v = props[k];
    if (v === null || v === undefined || v === '') continue;
    hasContent = true;
    tableRows += `<tr><td>${escapeHtml(k)}</td><td>${formatPopupValue(v)}</td></tr>`;
  }
  if (!hasContent) {
    tableRows = '<tr><td colspan="2" style="text-align:center;color:#999;">No attributes</td></tr>';
  }

  return `<div class="popup-header"><span>${escapeHtml(title)}</span></div><div class="popup-body"><table class="popup-table"><tbody>${tableRows}</tbody></table></div>`;
}

function bindSharePopups(
  leafletLayer: L.GeoJSON,
  layerLabel: string,
  popupConfig: PopupConfig | null | undefined
): void {
  leafletLayer.eachLayer((sublayer) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feature = (sublayer as any).feature as GeoJSON.Feature | undefined;
    if (!feature) return;

    const props = (feature.properties ?? {}) as Record<string, unknown>;

    sublayer.on('click', (e: L.LeafletMouseEvent) => {
      const html = buildSharePopupHtml(props, layerLabel, popupConfig);

      const latlng =
        e.latlng ??
        ((sublayer as L.Marker).getLatLng
          ? (sublayer as L.Marker).getLatLng()
          : null);
      if (!latlng) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map: L.Map | undefined =
        (sublayer as any)._map ??
        (e.target as any)?._map ??
        (leafletLayer as any)._map;
      if (!map) return;

      L.popup({ maxWidth: 300, maxHeight: 350, className: 'posm-popup' })
        .setLatLng(latlng)
        .setContent(html)
        .openOn(map);
    });
  });
}

// ---------------------------------------------------------------------------
// SharePage
// ---------------------------------------------------------------------------

/**
 * Public share viewer page.
 *
 * - No authentication required.
 * - Reads the shareId from the URL param.
 * - Loads the WorkspaceConfig snapshot from the API / localStorage.
 * - Renders a full-screen Leaflet map with saved layers, symbology, and filters.
 * - Shows a detailed floating legend and a top banner with share info.
 * - Read-only: viewer can only pan/zoom.
 */
const CLUSTER_THRESHOLD = 200;

/** Mutable registry of leaflet layers + label managers per layer name, for toggle */
interface ShareLayerRefs {
  leafletLayer: L.GeoJSON;
  clusterGroup: L.MarkerClusterGroup | null;
  labelMgr: LabelManager | null;
  labelMinZoom: number;
}

export function SharePage() {
  const { shareId } = useParams<{ shareId: string }>();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRefsMap = useRef<Record<string, ShareLayerRefs>>({});

  const [snapshot, setSnapshot] = useState<ShareSnapshot | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [status, setStatus] = useState<string>('Loading share\u2026');
  const [legendLayers, setLegendLayers] = useState<ShareLayerInfo[]>([]);
  const [hiddenLayers, setHiddenLayers] = useState<Record<string, boolean>>({});

  // Load snapshot on mount (async — fetches from API or localStorage)
  useEffect(() => {
    if (!shareId) {
      setNotFound(true);
      return;
    }

    let cancelled = false;

    loadShareSnapshot(shareId).then((snap) => {
      if (cancelled) return;
      if (!snap) {
        setNotFound(true);
        return;
      }
      setSnapshot(snap);
    });

    return () => {
      cancelled = true;
    };
  }, [shareId]);

  // Toggle layer visibility from legend
  const handleToggleLayer = (layerName: string) => {
    const map = mapRef.current;
    const refs = layerRefsMap.current[layerName];
    if (!map || !refs) return;

    setHiddenLayers((prev) => {
      const isCurrentlyHidden = !!prev[layerName];
      // The "display layer" is the cluster group if present, otherwise the raw leaflet layer
      const displayLayer = refs.clusterGroup ?? refs.leafletLayer;
      if (isCurrentlyHidden) {
        // Show layer
        displayLayer.addTo(map);
        if (refs.labelMgr) {
          const zoom = map.getZoom();
          if (zoom >= refs.labelMinZoom) {
            refs.labelMgr.layerGroup.addTo(map);
          }
        }
      } else {
        // Hide layer
        map.removeLayer(displayLayer);
        if (refs.labelMgr && map.hasLayer(refs.labelMgr.layerGroup)) {
          map.removeLayer(refs.labelMgr.layerGroup);
        }
      }
      return { ...prev, [layerName]: !isCurrentlyHidden };
    });
  };

  // Initialize Leaflet map and load layers once snapshot is available
  useEffect(() => {
    if (!snapshot || !mapContainerRef.current) return;
    if (mapRef.current) return; // already initialized

    const { wsConfig } = snapshot;
    const basemapKey: BasemapKey =
      (wsConfig.basemap as BasemapKey) in BASEMAPS
        ? (wsConfig.basemap as BasemapKey)
        : 'street';

    const map = L.map(mapContainerRef.current, {
      center: wsConfig.center,
      zoom: wsConfig.zoom,
      maxZoom: 22,
      zoomControl: false,
      renderer: L.canvas({ tolerance: 12 }),
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const basemapConfig = BASEMAPS[basemapKey];
    L.tileLayer(basemapConfig.url, {
      attribution: basemapConfig.attribution,
      maxNativeZoom: 19,
      maxZoom: 22,
    }).addTo(map);

    mapRef.current = map;

    // Determine layer render order (use layerOrder if available, else key order)
    const layerNames = wsConfig.layerOrder ?? Object.keys(wsConfig.layers);
    if (layerNames.length === 0) {
      setStatus('');
      return;
    }

    setStatus(`Loading ${layerNames.length} layer(s)\u2026`);

    const collectedLegend: ShareLayerInfo[] = [];

    Promise.allSettled(
      layerNames.map(async (fullName, idx) => {
        const layerCfg: PerLayerConfig = wsConfig.layers[fullName];
        if (!layerCfg) return;
        if (!layerCfg.visible) return;

        // Build CQL filter from saved activeFilters
        const cqlFilter =
          layerCfg.activeFilters && layerCfg.activeFilters.length > 0
            ? buildCqlFilter(layerCfg.activeFilters, layerCfg.filterCombineMode ?? 'AND')
            : undefined;

        const geojson = await fetchLayerGeoJSON(fullName, cqlFilter || undefined);
        const geomType = detectGeomType(geojson);
        const isPoint = geomType === 'Point' || geomType === 'MultiPoint';
        const color = layerCfg.color || LAYER_COLORS[idx % LAYER_COLORS.length];
        const pointSymbol = layerCfg.pointSymbol || 'circle';
        const darker = darkenColor(color);

        const leafletLayer = L.geoJSON(geojson, {
          pointToLayer: isPoint
            ? (_feature, latlng) =>
                createPointMarker(latlng, pointSymbol, color, darker, 10)
            : undefined,
          style: !isPoint ? () => defaultStyle(geomType, color) : undefined,
        });

        // Apply saved symbology if present — use recolorSymbology so that
        // user-edited colors are preserved instead of recomputed from palette.
        const resolvedSymbology = layerCfg.symbology;
        if (layerCfg.symbology) {
          recolorSymbology(
            leafletLayer,
            geojson,
            geomType,
            pointSymbol,
            layerCfg.symbology
          );
        }

        // Cluster point layers if saved config had clustering enabled (same threshold as main app)
        const shouldCluster =
          isPoint && layerCfg.clustered && geojson.features.length > CLUSTER_THRESHOLD;
        let clusterGroup: L.MarkerClusterGroup | null = null;
        if (shouldCluster) {
          clusterGroup = (L as unknown as { markerClusterGroup: (opts: object) => L.MarkerClusterGroup }).markerClusterGroup({
            disableClusteringAtZoom: 20,
            chunkedLoading: true,
          });
          clusterGroup.addLayer(leafletLayer);
          clusterGroup.addTo(map);
        } else {
          leafletLayer.addTo(map);
        }

        // Bind read-only popups (no config gear button)
        const shortName = fullName.includes(':')
          ? fullName.split(':')[1]
          : fullName;
        bindSharePopups(leafletLayer, shortName, layerCfg.popupConfig);

        // Apply labels if labelField is saved (same logic as main app)
        let labelMgr: LabelManager | null = null;
        let labelMinZoom = 19;
        if (layerCfg.labelField) {
          labelMinZoom = computeLabelMinZoom(geojson);
          labelMgr = applyLabels(map, geojson, geomType, color, layerCfg.labelField);
          // Hide labels if current zoom is below threshold
          const currentZoom = map.getZoom();
          if (currentZoom < labelMinZoom && map.hasLayer(labelMgr.layerGroup)) {
            map.removeLayer(labelMgr.layerGroup);
          }
        }

        // Store refs for toggle
        layerRefsMap.current[fullName] = { leafletLayer, clusterGroup, labelMgr, labelMinZoom };

        collectedLegend.push({
          name: fullName,
          label: shortName,
          color,
          geomType,
          symbology: resolvedSymbology ?? null,
          featureCount: geojson.features?.length ?? 0,
        });
      })
    ).then(() => {
      setLegendLayers([...collectedLegend]);
      setStatus('');

      // Set up label move/zoom listener (same as main app)
      const cleanupLabels = initLabelMoveListener(map, () => {
        return Object.entries(layerRefsMap.current)
          .filter(([, refs]) => refs.labelMgr !== null)
          .map(([name, refs]) => ({
            mgr: refs.labelMgr!,
            minZoom: refs.labelMinZoom,
            parentVisible: !hiddenLayersRef.current[name],
          }));
      });

      // Store cleanup for unmount
      labelCleanupRef.current = cleanupLabels;
    });

    return () => {
      if (labelCleanupRef.current) labelCleanupRef.current();
      // Clean up label managers
      for (const refs of Object.values(layerRefsMap.current)) {
        if (refs.labelMgr) {
          removeLabels(map, refs.labelMgr);
        }
      }
      layerRefsMap.current = {};
      map.remove();
      mapRef.current = null;
    };
  }, [snapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a ref of hiddenLayers so the label listener can access it without stale closures
  const hiddenLayersRef = useRef(hiddenLayers);
  hiddenLayersRef.current = hiddenLayers;

  const labelCleanupRef = useRef<(() => void) | null>(null);

  // ---- Error state ----------------------------------------------------------

  if (notFound) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100dvh',
          background: '#0a0a1a',
          color: '#e0e0e0',
          fontFamily: "'Segoe UI', sans-serif",
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <span style={{ fontSize: 48 }}>&#x1F5FA;</span>
        <h2 style={{ margin: 0, color: '#42d4f4' }}>Share Not Found</h2>
        <p style={{ color: '#888', margin: 0, fontSize: 14 }}>
          The share link is invalid or has expired.
        </p>
        <p style={{ color: '#555', margin: 0, fontSize: 12 }}>
          Share ID: {shareId ?? 'unknown'}
        </p>
        <a
          href="/"
          style={{
            marginTop: 8,
            color: '#42d4f4',
            textDecoration: 'none',
            fontSize: 13,
            border: '1px solid #42d4f4',
            borderRadius: 4,
            padding: '6px 16px',
          }}
        >
          Go to App
        </a>
      </div>
    );
  }

  // ---- Main map view --------------------------------------------------------

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100dvh',
        background: '#0a0a1a',
        overflow: 'hidden',
      }}
    >
      {/* Full-screen map container */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Top banner */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          background: 'rgba(10,10,26,0.88)',
          borderBottom: '1px solid #42d4f4',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap' as const,
          padding: '8px 16px',
          gap: '8px 16px',
          zIndex: 1000,
          fontFamily: "'Segoe UI', sans-serif",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: 15,
            color: '#42d4f4',
            letterSpacing: 0.4,
            flexShrink: 0,
          }}
        >
          POSM GIS — Shared Map View
        </span>

        {snapshot && (
          <>
            <span style={{ color: '#555', fontSize: 12 }}>|</span>
            <span style={{ color: '#888', fontSize: 12 }}>
              Workspace:{' '}
              <strong style={{ color: '#ccc' }}>{snapshot.wsName || '\u2014'}</strong>
            </span>
            {snapshot.created_at && (
              <>
                <span style={{ color: '#555', fontSize: 12 }}>|</span>
                <span style={{ color: '#888', fontSize: 12 }}>
                  Shared: {formatDate(snapshot.created_at)}
                </span>
              </>
            )}
          </>
        )}

        {status && (
          <span
            style={{
              marginLeft: 'auto',
              color: '#42d4f4',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                border: '2px solid rgba(66,212,244,0.3)',
                borderTopColor: '#42d4f4',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            {status}
          </span>
        )}
      </div>

      {/* Detailed legend panel — bottom-left */}
      <ShareLegend
        layers={legendLayers}
        hiddenLayers={hiddenLayers}
        onToggleLayer={handleToggleLayer}
      />
    </div>
  );
}

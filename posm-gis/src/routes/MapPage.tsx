import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';

import { useStore } from '../store';
import { getAllLayerRefs, getLayerRefs, setLayerRefs, clearRegistry } from '../store/leafletRegistry';
import { initLabelMoveListener, computeLabelMinZoom, removeLabels, applyLabels, updateLabelVisibility } from '../lib/labels';
import { recolorSymbology, resetSymbology, refreshClusterAfterSymbology } from '../lib/symbology';
import { BASEMAPS, DEFAULT_CENTER, DEFAULT_ZOOM, MAX_ZOOM, MAX_NATIVE_ZOOM } from '../config/constants';
import { logout, getUserWorkspaces } from '../config/auth';
import type { AppUser } from '../config/auth';
import { Sidebar } from '../components/sidebar/Sidebar';
import { WorkspaceModal } from '../components/sidebar/WorkspaceModal';
import { MapLegendControl } from '../components/legend/MapLegendControl';
import { useLayers } from '../hooks/useLayers';
import { useSession, suppressAutoSave, unsuppressAutoSave } from '../hooks/useSession';
import { useFilters } from '../hooks/useFilters';

interface MapPageProps {
  user: AppUser;
}

export function MapPage({ user }: MapPageProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const basemapLayerRef = useRef<L.TileLayer | null>(null);
  const navigate = useNavigate();

  const basemap = useStore((s) => s.basemap);
  const setMapView = useStore((s) => s.setMapView);
  const setCurrentWorkspace = useStore((s) => s.setCurrentWorkspace);
  const setWorkspaces = useStore((s) => s.setWorkspaces);
  const resetLayers = useStore((s) => s.resetLayers);
  const loading = useStore((s) => s.loading);
  const loadingMessage = useStore((s) => s.loadingMessage);

  const { loadAllLayers } = useLayers(mapRef);
  const { loadSession, autoSave } = useSession();
  const { applyFilters } = useFilters(mapRef);

  // Workspace modal state
  const [wsModalOpen, setWsModalOpen] = useState(false);
  const [wsModalCancellable, setWsModalCancellable] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const autoSaveCleanupRef = useRef<(() => void) | null>(null);

  // Mobile sidebar state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Determine if user is admin (__ALL__ access)
  const userWorkspaceList = getUserWorkspaces(user);
  const isAdmin = userWorkspaceList.includes('__ALL__');

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      maxZoom: MAX_ZOOM,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const tileLayer = L.tileLayer(BASEMAPS.street.url, {
      attribution: BASEMAPS.street.attribution,
      maxNativeZoom: MAX_NATIVE_ZOOM,
      maxZoom: MAX_ZOOM,
    }).addTo(map);

    basemapLayerRef.current = tileLayer;
    mapRef.current = map;

    map.on('moveend', () => {
      const c = map.getCenter();
      setMapView([c.lat, c.lng], map.getZoom());
    });

    // Wire up label move/zoom listener for viewport-culled labels
    const cleanupLabels = initLabelMoveListener(map, () => {
      const allRefs = getAllLayerRefs();
      const labeled: { mgr: import('../lib/labels').LabelManager; minZoom: number; parentVisible: boolean }[] = [];
      const layers = useStore.getState().layers;
      for (const [layerName, refs] of allRefs) {
        if (refs.labelManager) {
          const layerConfig = layers[layerName];
          labeled.push({
            mgr: refs.labelManager,
            minZoom: computeLabelMinZoom(refs.geojson),
            parentVisible: layerConfig?.visible ?? false,
          });
        }
      }
      return labeled;
    });

    setMapReady(true);

    return () => {
      cleanupLabels();
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // After map is ready, decide whether to show workspace modal or auto-load
  useEffect(() => {
    if (!mapReady) return;

    if (isAdmin) {
      // Admin: show workspace selection modal
      setWsModalOpen(true);
    } else if (userWorkspaceList.length > 1) {
      // Multiple workspaces: show modal to let user pick
      setWsModalOpen(true);
    } else {
      // Single workspace: auto-load
      const ws = userWorkspaceList[0] ?? '';
      loadWorkspaces([ws]);
    }
  }, [mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle basemap changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const config = BASEMAPS[basemap];
    if (basemapLayerRef.current) {
      map.removeLayer(basemapLayerRef.current);
    }
    const newLayer = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxNativeZoom: MAX_NATIVE_ZOOM,
      maxZoom: MAX_ZOOM,
    }).addTo(map);
    basemapLayerRef.current = newLayer;
  }, [basemap]);

  // Load workspaces: clear existing layers, discover new ones, restore session
  const loadWorkspaces = useCallback(async (workspaces: string[]) => {
    const map = mapRef.current;
    if (!map) return;

    // Suppress auto-save during the entire load → restore sequence.
    // This prevents React StrictMode double-invocation from causing a race
    // where an auto-save writes intermediate (null symbology) state to DynamoDB.
    suppressAutoSave();

    try {
      // Clear existing layers from the map
      const existingRefs = getAllLayerRefs();
      for (const [, refs] of existingRefs) {
        const toRemove = refs.clusterGroup ?? refs.leafletLayer;
        if (map.hasLayer(toRemove)) map.removeLayer(toRemove);
        for (const decorator of refs.arrowDecorators) {
          if (map.hasLayer(decorator)) map.removeLayer(decorator);
        }
        if (refs.labelManager) {
          removeLabels(map, refs.labelManager);
        }
      }
      clearRegistry();
      resetLayers();

      // Update store with current workspace info
      const wsLabel = workspaces.length === 1 ? workspaces[0] : workspaces.join(', ');
      setCurrentWorkspace(wsLabel);
      setWorkspaces(workspaces);

      // Discover and load layers
      const bounds = await loadAllLayers(workspaces);

      // Restore session for the workspace
      const savedConfig = await loadSession(wsLabel);

      // Apply saved map view (center/zoom) if a session was restored, otherwise fitBounds
      if (savedConfig) {
        map.setView(
          savedConfig.center ?? useStore.getState().center,
          savedConfig.zoom ?? useStore.getState().zoom,
          { animate: false }
        );
      } else if (bounds && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] });
      }

      // Reconcile Leaflet map with restored session state
      if (savedConfig) {
        const layersAfterRestore = useStore.getState().layers;
        const filteredLayerNames: string[] = [];

        for (const [layerName, cfg] of Object.entries(layersAfterRestore)) {
          const refs = getLayerRefs(layerName);
          if (!refs) continue;

          // Hide layers on the map that were saved as not visible
          if (!cfg.visible) {
            const toHide = refs.clusterGroup ?? refs.leafletLayer;
            if (map.hasLayer(toHide)) map.removeLayer(toHide);
          }

          // Layers with filters: applyFilters handles symbology + labels
          if (cfg.activeFilters && cfg.activeFilters.length > 0) {
            filteredLayerNames.push(layerName);
            continue;
          }

          // Apply saved symbology to the Leaflet layer — use recolorSymbology
          // (not applySymbology) so that user-edited colors from the saved
          // valueColorMap / colors array are preserved instead of recomputed.
          if (cfg.symbology) {
            try {
              recolorSymbology(
                refs.leafletLayer,
                refs.geojson,
                cfg.geomType,
                cfg.pointSymbol,
                cfg.symbology
              );
              refreshClusterAfterSymbology(refs);
            } catch (e) {
              console.warn(`[loadWorkspaces] symbology restore failed for "${layerName}"`, e);
            }
          } else {
            // Re-apply base color to Leaflet layer (it was created with
            // default palette color, but session may have restored a different one)
            resetSymbology(refs.leafletLayer, cfg.geomType, cfg.color, cfg.pointSymbol, refs.geojson);
            refreshClusterAfterSymbology(refs);
          }

          // Apply saved labels
          if (cfg.labelField) {
            const mgr = applyLabels(map, refs.geojson, cfg.geomType, cfg.color, cfg.labelField);
            const minZoom = computeLabelMinZoom(refs.geojson);
            updateLabelVisibility(map, mgr, map.getZoom(), cfg.visible, minZoom);
            setLayerRefs(layerName, { ...refs, labelManager: mgr });
          }
        }

        // Re-apply filters (re-fetches filtered GeoJSON + symbology + labels)
        if (filteredLayerNames.length > 0) {
          await Promise.allSettled(filteredLayerNames.map((n) => applyFilters(n)));
        }
      }

      // Set up auto-save (clean up previous if switching)
      if (autoSaveCleanupRef.current) {
        autoSaveCleanupRef.current();
      }
      autoSaveCleanupRef.current = autoSave();
    } finally {
      // Re-enable auto-save now that load + restore is fully complete
      unsuppressAutoSave();
    }
  }, [loadAllLayers, loadSession, autoSave, applyFilters, resetLayers, setCurrentWorkspace, setWorkspaces]);

  // Workspace modal selection handler
  const handleWorkspaceSelect = useCallback((workspaces: string[]) => {
    setWsModalOpen(false);
    setWsModalCancellable(false);
    loadWorkspaces(workspaces);
  }, [loadWorkspaces]);

  // Workspace modal cancel handler (only available when switching)
  const handleWsModalCancel = useCallback(() => {
    setWsModalOpen(false);
    setWsModalCancellable(false);
  }, []);

  // Switch workspace (re-open modal, cancellable)
  const handleSwitchWorkspace = useCallback(() => {
    setWsModalCancellable(true);
    setWsModalOpen(true);
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [navigate]);

  return (
    <div className="app-container">
      {/* Workspace modal */}
      <WorkspaceModal
        isOpen={wsModalOpen}
        onSelect={handleWorkspaceSelect}
        userWorkspaces={isAdmin ? null : (userWorkspaceList.length > 1 ? userWorkspaceList : null)}
        onCancel={wsModalCancellable ? handleWsModalCancel : undefined}
      />

      {/* Mobile hamburger button */}
      <button
        className="mobile-menu-btn"
        onClick={() => setMobileSidebarOpen(true)}
        aria-label="Open menu"
      >
        &#9776;
      </button>

      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="sidebar-mobile-backdrop visible"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        mapRef={mapRef}
        user={user}
        onLogout={handleLogout}
        isAdmin={isAdmin}
        onSwitchWorkspace={handleSwitchWorkspace}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Map */}
      <div
        ref={mapContainerRef}
        className="map-container"
        style={{ flex: 1, position: 'relative' }}
      >
        {/* Floating legend control */}
        <MapLegendControl />
      </div>

      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(10,10,26,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999,
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{
            width: 40, height: 40,
            border: '3px solid rgba(66,212,244,0.3)',
            borderTopColor: '#42d4f4',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{ color: '#42d4f4', fontSize: 14 }}>{loadingMessage || 'Loading...'}</span>
        </div>
      )}
    </div>
  );
}

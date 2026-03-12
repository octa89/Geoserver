import L from 'leaflet';

/**
 * Sewer Flow Pulse Effect
 *
 * Renders a single glowing yellow dot traveling along each pipe segment.
 * Uses a CSS-only animation approach for maximum performance:
 *
 * - ONE GeoJSON layer on a dedicated SVG renderer
 * - `stroke-dasharray` with a short dot + large gap so dots are sparse
 * - CSS `@keyframes` animates `stroke-dashoffset` — runs entirely on the
 *   compositor thread, no JS per frame
 * - No per-path setup or Web Animations API — works with any number of pipes
 *
 * Only visible at street zoom (zoom >= 16).
 */

const FLOW_ZOOM_THRESHOLD = 16;
const STYLE_ID = 'posm-flow-pulse-style';
const PULSE_COLOR = '#ffdd00';

// The dash pattern: a short dot (4px) with a very large gap (200px).
// At typical street zoom, most pipe segments are < 200px on screen,
// so only ONE dot appears per pipe. Longer pipes may show 2-3 dots
// which still looks natural (like multiple particles in a long pipe).
const DASH_DOT = 4;
const DASH_GAP = 200;
const DASH_TOTAL = DASH_DOT + DASH_GAP; // animation offset per cycle

/** Ensure the global @keyframes rule exists exactly once. */
function ensureStyleTag() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes posmFlowDot {
      to { stroke-dashoffset: -${DASH_TOTAL}px; }
    }
    .posm-flow-dot {
      animation: posmFlowDot 0.8s linear infinite;
      will-change: stroke-dashoffset;
    }
  `;
  document.head.appendChild(style);
}

function removeStyleTagIfUnused() {
  const remaining = document.querySelectorAll('.posm-flow-dot');
  if (remaining.length === 0) {
    document.getElementById(STYLE_ID)?.remove();
  }
}

/**
 * Enable the flow pulse effect for a layer.
 * Returns a cleanup function that removes everything.
 */
export function enableFlowPulse(
  map: L.Map,
  _layerName: string,
  leafletLayer: L.GeoJSON,
  _color: string
): () => void {
  ensureStyleTag();

  const svgRenderer = L.svg();

  // Collect all polyline geometries into a single FeatureCollection
  const features: GeoJSON.Feature[] = [];
  leafletLayer.eachLayer((sublayer) => {
    if (
      !(sublayer instanceof L.Polyline) &&
      !(sublayer instanceof L.Polygon)
    ) {
      return;
    }
    const geojson = (sublayer as L.Polyline).toGeoJSON();
    features.push(geojson as GeoJSON.Feature);
  });

  if (features.length === 0) {
    return () => {};
  }

  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features,
  };

  // Single GeoJSON layer — one DOM operation for all pipes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overlayLayer = L.geoJSON(fc, {
    style: () => ({
      color: PULSE_COLOR,
      weight: 4,
      opacity: 0.85,
      dashArray: `${DASH_DOT} ${DASH_GAP}`,
      lineCap: 'round' as const,
      interactive: false,
      className: 'posm-flow-dot',
    }),
    renderer: svgRenderer,
    interactive: false,
  } as any);

  overlayLayer.addTo(map);

  // Hide SVG during map transitions to prevent freeze from SVG re-renders
  // during flyTo/pan/zoom. Flow dots reappear once movement stops.
  let moveEndTimer: ReturnType<typeof setTimeout> | null = null;

  const getContainer = () =>
    (svgRenderer as unknown as { _container?: HTMLElement })._container;

  const onMoveStart = () => {
    if (moveEndTimer) {
      clearTimeout(moveEndTimer);
      moveEndTimer = null;
    }
    const c = getContainer();
    if (c) c.style.display = 'none';
  };

  const onMoveEnd = () => {
    if (moveEndTimer) clearTimeout(moveEndTimer);
    moveEndTimer = setTimeout(() => {
      moveEndTimer = null;
      const zoom = map.getZoom();
      const c = getContainer();
      if (c) c.style.display = zoom >= FLOW_ZOOM_THRESHOLD ? '' : 'none';
    }, 200);
  };

  // Initial visibility check
  const initContainer = getContainer();
  if (initContainer) {
    initContainer.style.display =
      map.getZoom() >= FLOW_ZOOM_THRESHOLD ? '' : 'none';
  }

  map.on('movestart', onMoveStart);
  map.on('moveend', onMoveEnd);

  // Cleanup — one layer removal + one container removal
  return () => {
    map.off('movestart', onMoveStart);
    map.off('moveend', onMoveEnd);
    if (moveEndTimer) {
      clearTimeout(moveEndTimer);
      moveEndTimer = null;
    }
    if (map.hasLayer(overlayLayer)) map.removeLayer(overlayLayer);
    const container = (svgRenderer as unknown as { _container?: HTMLElement })
      ._container;
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    removeStyleTagIfUnused();
  };
}

/**
 * Disable the flow pulse by calling its cleanup function.
 */
export function disableFlowPulse(cleanup: (() => void) | null): void {
  if (cleanup) cleanup();
}

/**
 * Toggle flow pulse on or off. Mirrors the toggleArrows pattern.
 *
 * Returns the new cleanup function (or null if disabled).
 */
export function toggleFlowPulse(
  map: L.Map,
  layerName: string,
  leafletLayer: L.GeoJSON,
  color: string,
  show: boolean,
  currentCleanup: (() => void) | null
): (() => void) | null {
  disableFlowPulse(currentCleanup);

  if (!show) {
    return null;
  }

  return enableFlowPulse(map, layerName, leafletLayer, color);
}

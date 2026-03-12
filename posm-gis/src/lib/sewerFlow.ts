import L from 'leaflet';

/**
 * Sewer Flow Pulse Effect — Comet Trail
 *
 * Renders a comet (bright round dot + fading trail) traveling along each pipe.
 *
 * Technique: 3 non-overlapping layers with the SAME dasharray cycle (500px)
 * but different `animation-delay` values to position them sequentially:
 *
 *   ···faint tail···|===trail===|●HEAD●→
 *
 * - Head:  1px dash + round lineCap + thick weight = circle
 * - Trail: 30px dash, medium weight & opacity
 * - Tail:  30px dash, thin & faint
 *
 * Each layer's delay offsets it by 30px along the path so they line up
 * perfectly without overlapping.  CSS-only animation, zero JS per frame.
 *
 * Only visible at street zoom (zoom >= 16).
 */

const FLOW_ZOOM_THRESHOLD = 16;
const STYLE_ID = 'posm-flow-pulse-style';
const PULSE_COLOR = '#ffdd00';

const DASH_TOTAL = 2000;         // cycle length shared by all layers
const ANIM_DURATION = '8s';      // time per full cycle (keeps 250px/s speed)
const SEGMENT_LEN = 30;          // px length of each trail segment
const SEGMENT_DELAY = (SEGMENT_LEN / DASH_TOTAL) * 2; // seconds offset per segment

// Layer definitions — rendered bottom to top.
// All use the same dasharray cycle; `delayMul` controls animation-delay
// so each segment appears at the right position behind the head.
const COMET_PARTS = [
  // Faint tail — 30px, thin, at the back (no delay offset)
  { da: `${SEGMENT_LEN} ${DASH_TOTAL - SEGMENT_LEN}`, weight: 1.5, opacity: 0.12,
    cls: 'posm-flow-tail', cap: 'butt' as const, delayMul: 0 },
  // Trail — 30px, medium, right behind head
  { da: `${SEGMENT_LEN} ${DASH_TOTAL - SEGMENT_LEN}`, weight: 3, opacity: 0.35,
    cls: 'posm-flow-mid', cap: 'butt' as const, delayMul: 1 },
  // Head glow — wider, faint halo around the dot
  { da: `1 ${DASH_TOTAL - 1}`, weight: 14, opacity: 0.12,
    cls: 'posm-flow-glow', cap: 'round' as const, delayMul: 2 },
  // Head — bright round dot (1px dash + round cap + thick weight = circle)
  { da: `1 ${DASH_TOTAL - 1}`, weight: 7, opacity: 0.95,
    cls: 'posm-flow-head', cap: 'round' as const, delayMul: 2 },
];

/** Ensure the global @keyframes + class rules exist exactly once. */
function ensureStyleTag() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;

  const classRules = COMET_PARTS.map((p) => {
    const delay = -(p.delayMul * SEGMENT_DELAY);
    return `.${p.cls} {
      animation: posmFlowComet ${ANIM_DURATION} linear infinite;
      animation-delay: ${delay.toFixed(4)}s;
      will-change: stroke-dashoffset;
    }`;
  }).join('\n    ');

  style.textContent = `
    @keyframes posmFlowComet {
      to { stroke-dashoffset: -${DASH_TOTAL}px; }
    }
    ${classRules}
  `;
  document.head.appendChild(style);
}

function removeStyleTagIfUnused() {
  const remaining = document.querySelectorAll(
    COMET_PARTS.map((p) => `.${p.cls}`).join(', '),
  );
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

  // Create overlay layers — each part of the comet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overlays: L.GeoJSON[] = [];
  for (const part of COMET_PARTS) {
    const layer = L.geoJSON(fc, {
      style: () => ({
        color: PULSE_COLOR,
        weight: part.weight,
        opacity: part.opacity,
        dashArray: part.da,
        lineCap: part.cap,
        interactive: false,
        className: part.cls,
      }),
      renderer: svgRenderer,
      interactive: false,
    } as any);

    layer.addTo(map);
    overlays.push(layer);
  }

  // Hide SVG during map transitions to prevent freeze from SVG re-renders
  // during flyTo/pan/zoom. Comet reappears once movement stops.
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

  // Cleanup — remove all overlay layers + the shared SVG container
  return () => {
    map.off('movestart', onMoveStart);
    map.off('moveend', onMoveEnd);
    if (moveEndTimer) {
      clearTimeout(moveEndTimer);
      moveEndTimer = null;
    }
    for (const layer of overlays) {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    }
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

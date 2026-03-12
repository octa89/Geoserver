import L from 'leaflet';
import type { FeatureCollection, LineString, MultiLineString, Point, Polygon, MultiPolygon } from 'geojson';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LabelEntry {
  id: number;
  latlng: L.LatLng;
  segStart: L.LatLng | null;
  segEnd: L.LatLng | null;
  text: string;
  color: string;
  isLine: boolean;
  isPoint: boolean;
}

export interface LabelManager {
  entries: LabelEntry[];
  activeMarkers: Record<number, { marker: L.Marker; entry: LabelEntry }>;
  layerGroup: L.LayerGroup;
  lastZoom: number | null;
  pendingRaf: number | null;
  isLine: boolean;
}

// ---------------------------------------------------------------------------
// Zoom threshold based on feature count
// ---------------------------------------------------------------------------

/**
 * Compute the minimum zoom level at which labels should be shown.
 * Labels only appear at street-level zoom to reduce CPU/GPU load.
 * Fewer features can afford to show labels at slightly lower zoom levels.
 */
export function computeLabelMinZoom(geojson: FeatureCollection): number {
  const count = geojson.features.length;
  if (count < 30) return 15;
  if (count < 100) return 16;
  if (count < 500) return 17;
  if (count < 2000) return 18;
  return 19;
}

// ---------------------------------------------------------------------------
// Entry building
// ---------------------------------------------------------------------------

/**
 * Compute the geographic midpoint of a LineString coordinate array.
 * Uses cumulative segment lengths to find the true half-length point.
 */
function lineStringMidpoint(
  coords: number[][]
): { latlng: L.LatLng; segStart: L.LatLng; segEnd: L.LatLng } {
  let totalLength = 0;
  const segments: Array<{ length: number; start: number[]; end: number[] }> = [];

  for (let i = 0; i < coords.length - 1; i++) {
    const dx = coords[i + 1][0] - coords[i][0];
    const dy = coords[i + 1][1] - coords[i][1];
    const len = Math.sqrt(dx * dx + dy * dy);
    segments.push({ length: len, start: coords[i], end: coords[i + 1] });
    totalLength += len;
  }

  const half = totalLength / 2;
  let accumulated = 0;

  for (const seg of segments) {
    if (accumulated + seg.length >= half) {
      const t = (half - accumulated) / seg.length;
      const lng = seg.start[0] + t * (seg.end[0] - seg.start[0]);
      const lat = seg.start[1] + t * (seg.end[1] - seg.start[1]);
      return {
        latlng: L.latLng(lat, lng),
        segStart: L.latLng(seg.start[1], seg.start[0]),
        segEnd: L.latLng(seg.end[1], seg.end[0]),
      };
    }
    accumulated += seg.length;
  }

  // Fallback: use first coord
  const first = coords[0];
  const last = coords[coords.length - 1];
  return {
    latlng: L.latLng(first[1], first[0]),
    segStart: L.latLng(first[1], first[0]),
    segEnd: L.latLng(last[1], last[0]),
  };
}

/**
 * Build the array of LabelEntry objects for all features.
 */
export function buildLabelEntries(
  geojson: FeatureCollection,
  field: string,
  geomType: string,
  color: string
): LabelEntry[] {
  const entries: LabelEntry[] = [];
  const isLine =
    geomType === 'LineString' || geomType === 'MultiLineString';
  const isPoint =
    geomType === 'Point' || geomType === 'MultiPoint';

  geojson.features.forEach((feature, idx) => {
    const text = String(feature.properties?.[field] ?? '');
    if (!text || text === 'null' || text === 'undefined') return;

    const geom = feature.geometry;
    if (!geom) return;

    let latlng: L.LatLng;
    let segStart: L.LatLng | null = null;
    let segEnd: L.LatLng | null = null;

    if (geom.type === 'Point') {
      const [lng, lat] = (geom as Point).coordinates;
      latlng = L.latLng(lat, lng);
    } else if (geom.type === 'MultiPoint') {
      const coords = (geom as { type: 'MultiPoint'; coordinates: number[][] }).coordinates;
      const [lng, lat] = coords[0];
      latlng = L.latLng(lat, lng);
    } else if (geom.type === 'LineString') {
      const coords = (geom as LineString).coordinates;
      const mid = lineStringMidpoint(coords);
      latlng = mid.latlng;
      segStart = mid.segStart;
      segEnd = mid.segEnd;
    } else if (geom.type === 'MultiLineString') {
      // Use the longest sub-line for the label
      const lines = (geom as MultiLineString).coordinates;
      let longestCoords = lines[0];
      let longestLen = 0;
      for (const line of lines) {
        let len = 0;
        for (let i = 0; i < line.length - 1; i++) {
          const dx = line[i + 1][0] - line[i][0];
          const dy = line[i + 1][1] - line[i][1];
          len += Math.sqrt(dx * dx + dy * dy);
        }
        if (len > longestLen) {
          longestLen = len;
          longestCoords = line;
        }
      }
      const mid = lineStringMidpoint(longestCoords);
      latlng = mid.latlng;
      segStart = mid.segStart;
      segEnd = mid.segEnd;
    } else if (geom.type === 'Polygon') {
      // Use bounding-box center
      const coords = (geom as Polygon).coordinates[0];
      const lngs = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      latlng = L.latLng((minLat + maxLat) / 2, (minLng + maxLng) / 2);
    } else if (geom.type === 'MultiPolygon') {
      // Use bounding-box center of the entire multi-polygon
      const allCoords = (geom as MultiPolygon).coordinates.flatMap((poly) =>
        poly[0]
      );
      const lngs = allCoords.map((c) => c[0]);
      const lats = allCoords.map((c) => c[1]);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      latlng = L.latLng((minLat + maxLat) / 2, (minLng + maxLng) / 2);
    } else {
      return; // GeometryCollection or unknown – skip
    }

    entries.push({
      id: idx,
      latlng,
      segStart,
      segEnd,
      text,
      color,
      isLine,
      isPoint,
    });
  });

  return entries;
}

// ---------------------------------------------------------------------------
// Marker creation
// ---------------------------------------------------------------------------

/**
 * Compute the screen angle (in degrees) for a line segment so that the label
 * can be rotated to follow the line.
 *
 * Returns a value in the range [-90, 90] so the text is never upside-down.
 */
function screenAngleDeg(
  map: L.Map,
  segStart: L.LatLng,
  segEnd: L.LatLng
): number {
  const p1 = map.latLngToContainerPoint(segStart);
  const p2 = map.latLngToContainerPoint(segEnd);

  let angle = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;

  // Normalize to -90..90 so labels read left-to-right
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;

  return angle;
}

/**
 * Create a Leaflet Marker with a divIcon label for a LabelEntry.
 */
export function createLabelMarker(entry: LabelEntry, map: L.Map): L.Marker {
  let transform = '';

  if (entry.isLine && entry.segStart && entry.segEnd) {
    const angle = screenAngleDeg(map, entry.segStart, entry.segEnd);
    transform = `rotate(${angle}deg)`;
  }

  const html = `<span class="posm-label-text" style="color:${entry.color};transform:${transform}">${entry.text}</span>`;

  const icon = L.divIcon({
    html,
    className: 'posm-label-icon',
    iconSize: undefined,
    iconAnchor: undefined,
  });

  return L.marker(entry.latlng, { icon, interactive: false, zIndexOffset: 500 });
}

// ---------------------------------------------------------------------------
// Viewport reconciliation
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 50; // markers added per animation frame

/**
 * Reconcile the set of visible label markers against the current padded
 * viewport. Adds markers for entries now in view, removes those that left,
 * and updates line-label angles when the zoom level changes.
 *
 * Large batches are split across frames using requestAnimationFrame so that
 * initial render of dense layers does not block the UI thread.
 */
export function reconcileViewport(mgr: LabelManager, map: L.Map): void {
  // Cancel any pending batch
  if (mgr.pendingRaf !== null) {
    cancelAnimationFrame(mgr.pendingRaf);
    mgr.pendingRaf = null;
  }

  const currentZoom = map.getZoom();
  const zoomChanged = currentZoom !== mgr.lastZoom;
  mgr.lastZoom = currentZoom;

  // Pad the viewport by 20% on each side
  const bounds = map.getBounds();
  const latPad = (bounds.getNorth() - bounds.getSouth()) * 0.2;
  const lngPad = (bounds.getEast() - bounds.getWest()) * 0.2;
  const padded = bounds.pad
    ? bounds.pad(0.2)
    : L.latLngBounds(
        L.latLng(bounds.getSouth() - latPad, bounds.getWest() - lngPad),
        L.latLng(bounds.getNorth() + latPad, bounds.getEast() + lngPad)
      );

  // Determine which entries are in the viewport
  const inView = new Set<number>();
  for (const entry of mgr.entries) {
    if (padded.contains(entry.latlng)) {
      inView.add(entry.id);
    }
  }

  // Remove markers that left the viewport
  for (const idStr of Object.keys(mgr.activeMarkers)) {
    const id = Number(idStr);
    if (!inView.has(id)) {
      mgr.layerGroup.removeLayer(mgr.activeMarkers[id].marker);
      delete mgr.activeMarkers[id];
    }
  }

  // Update angles for existing line markers on zoom change
  if (zoomChanged && mgr.isLine) {
    for (const idStr of Object.keys(mgr.activeMarkers)) {
      const id = Number(idStr);
      const { marker, entry } = mgr.activeMarkers[id];
      if (entry.segStart && entry.segEnd) {
        const angle = screenAngleDeg(map, entry.segStart, entry.segEnd);
        const span = (marker.getElement()?.querySelector('.posm-label-text') as HTMLElement | null);
        if (span) {
          span.style.transform = `rotate(${angle}deg)`;
        }
      }
    }
  }

  // Collect entries to add
  const toAdd = mgr.entries.filter(
    (e) => inView.has(e.id) && !mgr.activeMarkers[e.id]
  );

  if (toAdd.length === 0) return;

  // Add in chunks via rAF to avoid long tasks
  let offset = 0;

  function addChunk() {
    const chunk = toAdd.slice(offset, offset + CHUNK_SIZE);
    offset += CHUNK_SIZE;

    for (const entry of chunk) {
      const marker = createLabelMarker(entry, map);
      mgr.layerGroup.addLayer(marker);
      mgr.activeMarkers[entry.id] = { marker, entry };
    }

    if (offset < toAdd.length) {
      mgr.pendingRaf = requestAnimationFrame(addChunk);
    } else {
      mgr.pendingRaf = null;
    }
  }

  mgr.pendingRaf = requestAnimationFrame(addChunk);
}

// ---------------------------------------------------------------------------
// Public label lifecycle API
// ---------------------------------------------------------------------------

/**
 * Build a LabelManager, attach it to the map and start rendering labels.
 */
export function applyLabels(
  map: L.Map,
  geojson: FeatureCollection,
  geomType: string,
  color: string,
  field: string
): LabelManager {
  const entries = buildLabelEntries(geojson, field, geomType, color);
  const layerGroup = L.layerGroup().addTo(map);

  const isLine = geomType === 'LineString' || geomType === 'MultiLineString';

  const mgr: LabelManager = {
    entries,
    activeMarkers: {},
    layerGroup,
    lastZoom: null,
    pendingRaf: null,
    isLine,
  };

  reconcileViewport(mgr, map);
  return mgr;
}

/**
 * Fully remove a LabelManager from the map and cancel any pending work.
 */
export function removeLabels(map: L.Map, mgr: LabelManager): void {
  if (mgr.pendingRaf !== null) {
    cancelAnimationFrame(mgr.pendingRaf);
    mgr.pendingRaf = null;
  }

  mgr.layerGroup.clearLayers();
  if (map.hasLayer(mgr.layerGroup)) {
    map.removeLayer(mgr.layerGroup);
  }

  mgr.activeMarkers = {};
  mgr.entries = [];
}

/**
 * Show or hide all label markers based on the current zoom level and whether
 * the parent layer is visible.
 *
 * Labels are hidden (layer removed from map) when zoom < minZoom or
 * parentVisible is false, and shown otherwise.
 */
export function updateLabelVisibility(
  map: L.Map,
  mgr: LabelManager,
  zoom: number,
  parentVisible: boolean,
  minZoom: number
): void {
  const shouldShow = parentVisible && zoom >= minZoom;
  const isOnMap = map.hasLayer(mgr.layerGroup);

  if (shouldShow && !isOnMap) {
    mgr.layerGroup.addTo(map);
    reconcileViewport(mgr, map);
  } else if (!shouldShow && isOnMap) {
    // Cancel pending RAF before hiding to avoid adding markers off-screen
    if (mgr.pendingRaf !== null) {
      cancelAnimationFrame(mgr.pendingRaf);
      mgr.pendingRaf = null;
    }
    map.removeLayer(mgr.layerGroup);
  }
}

// ---------------------------------------------------------------------------
// Move/zoom listener
// ---------------------------------------------------------------------------

type LabeledLayerRef = {
  mgr: LabelManager;
  minZoom: number;
  parentVisible: boolean;
};

/**
 * Attach a debounced 'moveend' (and 'zoomend') handler to the map that
 * reconciles all labeled layers' viewports and updates visibility.
 *
 * `getLabeledLayers` is a callback so the caller can maintain a mutable
 * collection; the handler always reads the current snapshot.
 *
 * Call this once per map instance. Returns a cleanup function.
 */
export function initLabelMoveListener(
  map: L.Map,
  getLabeledLayers: () => LabeledLayerRef[]
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 150;

  function onMove() {
    if (debounceTimer !== null) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const zoom = map.getZoom();
      const layers = getLabeledLayers();

      for (const { mgr, minZoom, parentVisible } of layers) {
        updateLabelVisibility(map, mgr, zoom, parentVisible, minZoom);

        // If the layer group is on the map, reconcile its viewport
        if (map.hasLayer(mgr.layerGroup)) {
          reconcileViewport(mgr, map);
        }
      }
    }, DEBOUNCE_MS);
  }

  map.on('moveend', onMove);
  map.on('zoomend', onMove);

  // Return a cleanup function for the caller to call on unmount
  return () => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    map.off('moveend', onMove);
    map.off('zoomend', onMove);
  };
}

# Labels & Symbology — Architecture, Known Issues & Fixes

This document covers the labeling and symbology systems in POSM GIS, including known pitfalls, how they were resolved, and guidance for future development.

---

## Table of Contents

1. [Symbology System Overview](#symbology-system-overview)
2. [Label System Overview](#label-system-overview)
3. [Known Issue: Point Symbology Not Applying (Clustered Layers)](#known-issue-point-symbology-not-applying-clustered-layers)
4. [Known Issue: Labels and Symbology Out of Sync After Filtering](#known-issue-labels-and-symbology-out-of-sync-after-filtering)
5. [Known Issue: Non-Circle Point Symbols and Style Updates](#known-issue-non-circle-point-symbols-and-style-updates)
6. [Label Performance and Zoom Thresholds](#label-performance-and-zoom-thresholds)
7. [Symbology on Share View](#symbology-on-share-view)
8. [Developer Checklist](#developer-checklist)

---

## Symbology System Overview

**Files:** `src/lib/symbology.ts`, `src/components/symbology/*.tsx`, `src/types/symbology.ts`

The symbology system supports four modes, defined as a discriminated union (`SymbologyConfig`):

| Mode | Description | Key Fields |
|------|-------------|------------|
| `unique` | Distinct color per unique field value | `field`, `valueColorMap`, `groupByYear` |
| `graduated` | Classify numeric values into N classes | `field`, `method`, `nClasses`, `ramp`, `breaks`, `colors` |
| `proportional` | Scale visual property by numeric value | `field`, `minSize`, `maxSize`, `color` |
| `rules` | Ordered rule list with conditions | `rules[]`, `defaultColor` |

### How Symbology is Applied

1. User selects a mode and field in the symbology panel (`SymbologyPanel.tsx`)
2. The mode-specific panel (e.g., `UniqueValuesPanel.tsx`) calls the corresponding function from `symbology.ts` (e.g., `applyUniqueValues()`)
3. The function iterates over every Leaflet sub-layer within the `L.GeoJSON` layer and calls `applyStyleToLayer()` on each
4. The returned `SymbologyConfig` (with computed values like `valueColorMap` or `breaks`) is saved to the Zustand store via `setLayerSymbology()`
5. The session auto-save persists it to DynamoDB

### `applyStyleToLayer()` — How Styles Reach Leaflet

This function handles three geometry types differently:

- **Points (CircleMarker):** Calls `layer.setStyle({ fillColor, color, radius, ... })`
- **Points (non-circle symbols):** Rebuilds the `L.DivIcon` with a new SVG via `pointSVG()` and calls `layer.setIcon(icon)`
- **Lines:** Calls `layer.setStyle({ color, weight, opacity })`
- **Polygons:** Calls `layer.setStyle({ fillColor, color, fillOpacity, ... })`

### `applySymbology()` — Central Dispatcher

The `applySymbology()` function in `symbology.ts` routes to the correct mode implementation based on `config.mode`. It returns the full resolved `SymbologyConfig` which may contain computed data not present in the input (e.g., `valueColorMap` for unique values, `breaks` and `colors` for graduated).

---

## Label System Overview

**File:** `src/lib/labels.ts`

Labels are rendered as Leaflet `L.Marker` instances with `L.DivIcon` HTML, managed by a `LabelManager` object stored in the `leafletRegistry`.

### Key Concepts

- **Viewport culling:** Only labels within the current map viewport (+ 20% padding) are rendered. Labels outside the viewport are removed from the DOM. This is critical for performance with large datasets.
- **Zoom thresholds:** Labels only appear above a minimum zoom level based on feature count (see table below). This prevents thousands of overlapping labels at low zoom.
- **Line label rotation:** Labels on LineString features are rotated to follow the line segment angle. Angles are recomputed on zoom change.
- **Chunked rendering:** Large batches of labels are added across multiple `requestAnimationFrame` calls (50 per frame) to avoid blocking the UI thread.
- **Debounced reconciliation:** The `moveend`/`zoomend` listener is debounced at 80ms to avoid excessive recalculation during rapid panning.

### Label Placement by Geometry Type

| Geometry | Placement |
|----------|-----------|
| Point | At the point coordinate |
| LineString | At the geographic midpoint of the line (computed by cumulative segment length) |
| MultiLineString | At the midpoint of the longest sub-line |
| Polygon | At the bounding box center |
| MultiPolygon | At the bounding box center of all rings |

### Zoom Thresholds

| Feature Count | Min Zoom |
|---------------|----------|
| < 30 | 15 |
| < 100 | 16 |
| < 500 | 17 |
| < 2,000 | 18 |
| >= 2,000 | 19 |

---

## Known Issue: Point Symbology Not Applying (Clustered Layers)

**Problem:** When a point layer is clustered using `L.MarkerClusterGroup`, changing symbology (color, unique values, graduated, etc.) appears to have no effect. The markers on the map keep their old colors. Lines and polygons are unaffected.

**Root Cause:** `MarkerClusterGroup` manages its own internal rendering of markers. When you call `setStyle()` on individual `L.CircleMarker` sublayers inside the cluster group, the CircleMarker's internal options update but the cluster group doesn't re-render them. The cluster group caches marker visuals and only refreshes when markers are removed and re-added.

**Fix (`refreshClusterAfterSymbology`):**

After applying any symbology change, call `refreshClusterAfterSymbology(refs)` from `symbology.ts`:

```typescript
import { refreshClusterAfterSymbology } from '../../lib/symbology';
import { getLayerRefs } from '../../store/leafletRegistry';

// After applyUniqueValues / applyGraduated / applyProportional / applyRules:
const refs = getLayerRefs(layerName);
if (refs) refreshClusterAfterSymbology(refs);
```

The function clears and re-adds the GeoJSON layer to the cluster group:

```typescript
export function refreshClusterAfterSymbology(refs: LeafletLayerRefs): void {
  if (!refs.clusterGroup) return;       // no-op for non-clustered layers
  refs.clusterGroup.clearLayers();
  refs.clusterGroup.addLayer(refs.leafletLayer);
}
```

**Where it's applied:** All four symbology panels (`UniqueValuesPanel`, `GraduatedPanel`, `ProportionalPanel`, `RulesPanel`) and the reset handler in `SymbologyPanel.tsx`.

**Important:** This must be called after EVERY symbology change, including resets. If you add a new symbology mode in the future, include this call.

---

## Known Issue: Labels and Symbology Out of Sync After Filtering

**Problem:** When CQL filters are applied, the entire Leaflet layer is torn down and rebuilt with fresh GeoJSON. If labels or symbology were active, they need to be re-applied to the new layer.

**How it's handled:** The `useFilters` hook (in `hooks/useFilters.ts`) follows this sequence after re-fetching filtered GeoJSON:

1. Remove old labels (`removeLabels`)
2. Tear down old Leaflet layer from map and registry
3. Build new `L.GeoJSON` layer from filtered data
4. Re-apply symbology if `layer.symbology` is set in the store
5. Re-apply labels if `layer.labelField` is set
6. Re-bind popups
7. Update the leaflet registry with new refs

**Gotcha:** If you modify the filter application flow, ensure symbology is re-applied BEFORE labels, because symbology changes colors that labels may inherit.

---

## Known Issue: Non-Circle Point Symbols and Style Updates

**Problem:** For point layers using non-circle symbols (square, triangle, diamond, star, cross), styling works differently than CircleMarkers.

**Why:** Non-circle symbols are rendered as `L.Marker` with `L.DivIcon` containing an inline SVG. Unlike `L.CircleMarker` which supports `setStyle()`, `L.Marker` requires rebuilding the icon entirely via `setIcon()`.

**How it works in `applyStyleToLayer()`:**

```typescript
if (layer instanceof L.CircleMarker) {
  layer.setStyle({ fillColor, color, radius, ... });
} else if (layer instanceof L.Marker) {
  // Rebuild SVG icon from scratch
  const svg = pointSVG(pointSymbol, color, darker, size);
  const icon = L.divIcon({ html: svg, ... });
  layer.setIcon(icon);
}
```

**Performance note:** Rebuilding DivIcons for thousands of markers is more expensive than `setStyle()` on CircleMarkers. The `circle` symbol type uses native canvas-rendered `L.CircleMarker` and is the most performant option for large point datasets.

---

## Label Performance and Zoom Thresholds

Labels are the most performance-sensitive feature. Each label is a DOM element (DivIcon marker), and rendering thousands simultaneously causes jank.

### Performance Mitigations

1. **Zoom gating:** Labels hidden below computed `minZoom` threshold
2. **Viewport culling:** Only labels in the visible bounds (+ 20% pad) are in the DOM
3. **Chunked rendering:** 50 labels added per animation frame via `requestAnimationFrame`
4. **Debounced updates:** 80ms debounce on `moveend`/`zoomend` events
5. **Cleanup on hide:** When layer visibility is toggled off or zoom drops below threshold, all label markers are removed from the map (not just hidden)

### When Labels Break

- **Layer rebuilt without label cleanup:** If the Leaflet layer is destroyed and recreated (e.g., during filter application or cluster toggle) without calling `removeLabels()` first, orphaned label markers will remain on the map. Always call `removeLabels(map, refs.labelManager)` before destroying a layer.
- **Label manager reference stale:** The `labelManager` in the registry must be updated after any operation that replaces it. Use `setLayerRefs(name, { ...refs, labelManager: newMgr })`.

---

## Symbology on Share View

**File:** `src/routes/SharePage.tsx`, `src/components/legend/ShareLegend.tsx`

The share view (`/share/:shareId`) is a read-only snapshot. It re-applies saved symbology when loading:

1. Fetches the share config from DynamoDB (includes per-layer `PerLayerConfig` with `symbology` field)
2. Fetches GeoJSON for each layer (with CQL filters if saved)
3. Calls `applySymbology()` with the saved config
4. The returned resolved config (with `valueColorMap`, `breaks`, etc.) is passed to `ShareLegend` for rendering

**Important:** The `applySymbology()` return value may differ from the stored config because it recomputes derived data (break points, color maps) from the actual GeoJSON data. The share view uses the RETURNED config for the legend, not the stored one.

---

## Developer Checklist

When modifying symbology or labels, verify these scenarios:

### Symbology Changes
- [ ] Apply symbology to a **non-clustered** point layer — colors update
- [ ] Apply symbology to a **clustered** point layer — colors update (requires `refreshClusterAfterSymbology`)
- [ ] Apply symbology to a **line** layer — colors/weights update
- [ ] Apply symbology to a **polygon** layer — fills update
- [ ] **Reset** symbology — all features return to default color
- [ ] Apply symbology, then **toggle clustering** on/off — symbology persists
- [ ] Apply symbology, then **apply a filter** — symbology re-applied to filtered subset
- [ ] Apply symbology, **save session**, reload page — symbology restored
- [ ] Apply symbology, **share** — share view shows correct colors + legend

### Label Changes
- [ ] Enable labels on a point layer — labels appear at correct zoom
- [ ] Enable labels on a line layer — labels follow line angle
- [ ] Enable labels, then **hide layer** — labels also disappear
- [ ] Enable labels, then **show layer** — labels reappear
- [ ] Enable labels, then **apply filter** — labels reflect filtered data
- [ ] Enable labels, then **toggle clustering** — labels persist
- [ ] Zoom in/out — labels appear/disappear at threshold zoom
- [ ] Pan rapidly — no UI jank (chunked rendering working)
- [ ] Change label field — old labels removed, new labels shown
- [ ] Select "No labels" — all labels removed cleanly

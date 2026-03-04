# Frontend Modules Reference

All frontend JavaScript modules share the `window.POSM` namespace.

---

## auth.js

Authentication and user/group management with localStorage persistence.

### Storage Keys
| Key | Storage | Purpose |
|-----|---------|---------|
| `posm_current_user` | sessionStorage | Current logged-in user |
| `posm_demo_users` | localStorage | User list |
| `posm_demo_groups` | localStorage | Group definitions |
| `posm_selected_workspace` | sessionStorage | Active workspace |

### Functions

| Function | Description |
|----------|-------------|
| `POSM.getUsers()` | Get all users |
| `POSM.setUsers(users)` | Save user list |
| `POSM.getGroups()` | Get all groups |
| `POSM.setGroups(groups)` | Save group definitions |
| `POSM.login(username)` | Set current user session |
| `POSM.logout()` | Clear session, redirect to login |
| `POSM.getCurrentUser()` | Get logged-in user object |
| `POSM.getUserWorkspaces()` | Get workspaces accessible to current user |
| `POSM.getSelectedWorkspace()` | Get active workspace |
| `POSM.setSelectedWorkspace(ws)` | Set active workspace |
| `POSM.requireAuth()` | Guard: redirect to login if unauthenticated |
| `POSM.discoverWorkspaces()` | Fetch workspaces from GeoServer REST API |

### Default Users
- `admin` (Administrator) - access to all workspaces
- `user_posm` (POSM User) - access to POSM_GIS workspace
- `user_other` (Other User) - limited access

---

## config.js

Configuration constants, color palettes, ramps, and utility functions.

### Configuration Object (`POSM.CONFIG`)

| Property | Description |
|----------|-------------|
| `GEOSERVER_URL` | Base GeoServer URL (default: `/geoserver`) |
| `WORKSPACES` | Array of workspaces (populated at runtime) |
| `wfsUrl(workspace)` | Build WFS endpoint URL |
| `wfsCapsUrl(workspace)` | Build WFS GetCapabilities URL |
| `WORKSPACE` | Getter: first workspace or `'POSM_GIS'` |

### Color Constants

| Constant | Count | Purpose |
|----------|-------|---------|
| `POSM.COLOR_PALETTE` | 25 | Unique value symbology colors |
| `POSM.LAYER_COLORS` | 20 | Default per-layer colors |
| `POSM.COLOR_RAMPS` | 14 | Named color ramps for graduated symbology |

### Available Color Ramps
Blues, Reds, Greens, Oranges, Purples, YlOrRd, YlGnBu, RdYlGn, Spectral, Viridis, Plasma, Greys, PinkYellow, CyanDark

### Utility Functions

| Function | Description |
|----------|-------------|
| `POSM.interpolateColor(c1, c2, t)` | Linear RGB interpolation between two hex colors |
| `POSM.generateRampColors(rampKey, n)` | Generate n colors from a named ramp |
| `POSM.drawRamp(canvas, rampKey)` | Draw gradient on HTML5 canvas |
| `POSM.darkenColor(hex)` | Darken a hex color by 40% |
| `POSM.isNumericField(geojson, field)` | Detect numeric field (>80% numeric in 100 samples) |
| `POSM.isDateField(geojson, field)` | Detect ISO date field (>80% date in 100 samples) |

---

## map.js

Leaflet map initialization and basemap management.

### Map Setup
- Center: `[41.897, -84.037]`
- Default zoom: 14
- Zoom control: bottom-right

### Basemaps

| Key | Provider | Tiles |
|-----|----------|-------|
| `street` | OpenStreetMap | Standard |
| `satellite` | Esri | World Imagery |
| `dark` | CartoDB | Dark Matter |

### Functions

| Function | Description |
|----------|-------------|
| `POSM.initBasemaps()` | Wire basemap toggle buttons |

---

## markers.js

Custom point symbol rendering with SVG.

### Supported Symbols
`circle`, `square`, `triangle`, `diamond`, `star`, `cross`

### Functions

| Function | Description |
|----------|-------------|
| `POSM.pointSVG(symbolType, fill, stroke, size)` | Generate SVG markup string |
| `POSM.createPointMarker(latlng, symbolType, fillColor, borderColor, size)` | Create Leaflet marker (circleMarker for circles, divIcon for others) |

---

## arrows.js

Directional arrow decorators for line features using leaflet-polylinedecorator.

### Functions

| Function | Description |
|----------|-------------|
| `POSM.addArrowDecorators(layerName)` | Add arrow symbols at line endpoints |
| `POSM.removeArrowDecorators(layerName)` | Remove all arrows from a layer |
| `POSM.toggleArrows(layerName, show)` | Toggle arrow visibility |

---

## labels.js

Viewport-culled label engine with zoom-level-based visibility control.

Labels use a **viewport-aware label manager** that only creates DOM nodes for features currently visible on screen. On pan/zoom, labels are incrementally added and removed at viewport edges. Line label rotation angles are updated via CSS transform rather than destroying and recreating markers. Large batches are rendered in chunks of 50 per animation frame to avoid UI freezing.

All labels (including points) are rendered as `L.divIcon` markers in a persistent `L.layerGroup`, independent of the feature layer and clustering.

### Performance Characteristics

| Scenario | Behavior |
|----------|----------|
| 2000-feature layer, 50 in view | ~60 DOM nodes (50 + 20% padding) |
| Zoom change (line labels) | CSS transform update on visible markers only |
| Pan | Incremental add/remove at viewport edges |
| Below minZoom | 0 DOM nodes (all cleared from memory) |

### Min Zoom Thresholds

| Feature Count | Min Zoom to Show Labels |
|---------------|------------------------|
| < 30 | 14 |
| 30 - 100 | 15 |
| 100 - 500 | 16 |
| 500 - 2000 | 17 |
| > 2000 | 18 |

### Functions

| Function | Description |
|----------|-------------|
| `POSM.computeLabelMinZoom(geojson)` | Calculate min zoom from feature count |
| `POSM.applyLabels(layerName, field)` | Precompute label metadata and render visible labels |
| `POSM.removeLabels(layerName)` | Remove all labels and clean up label manager |
| `POSM.updateLabelVisibility(layerName)` | Show/hide labels based on current zoom, reconcile viewport |
| `POSM.initLabelZoomListener()` | Register global `moveend` handler (covers pan + zoom) |

### Internal Architecture

Each labeled layer stores a `_labelManager` object on `POSM.layerData[name]`:

```javascript
{
    entries: [],          // Precomputed label metadata (latlng, text, color, segment data) — no DOM
    activeMarkers: {},    // Map<entryId, {marker, entry}> — only currently visible labels
    layerGroup: L.layerGroup(),  // Single persistent layer group
    lastZoom: null,       // For detecting zoom changes
    pendingRaf: null,     // requestAnimationFrame handle for chunked rendering
    isLine: false         // Geometry type flag
}
```

Key internal functions:
- **`buildLabelEntries()`** — Iterates all features once, produces plain metadata objects (no DOM)
- **`reconcileViewport()`** — Adds/removes markers based on padded map bounds (20%), updates line angles via CSS on zoom change
- **`addMarkersChunked()`** — Batches marker creation (50/frame via RAF) for large sets; synchronous for small sets
- **`updateMarkerAngle()`** — Updates `.posm-label-text` span `style.transform` directly (no DOM rebuild)
- **`debouncedReconcileAll()`** — 80ms debounced handler on `moveend`, enforces minZoom visibility and reconciles all labeled layers

### Styling
- Yellow text (`#ffe066`) with dark halo (8-direction text-shadow)
- 11px bold font
- Non-interactive (won't block feature clicks)

---

## layers.js

WFS layer discovery, GeoJSON loading, and Leaflet layer management.

### Functions

| Function | Description |
|----------|-------------|
| `POSM.discoverLayers()` | Discover layers from all workspaces via WFS GetCapabilities |
| `POSM.fetchLayerGeoJSON(fullName, cqlFilter)` | Fetch GeoJSON via WFS GetFeature |
| `POSM.createLeafletLayer(geojson, shortName, color, pointSymbol, opts)` | Create Leaflet layer with optional clustering |
| `POSM.addLayerToMap(shortName)` | Add layer (and labels) to map |
| `POSM.removeLayerFromMap(shortName)` | Remove layer (and labels) from map |
| `POSM.rebuildLayer(layerName)` | Recreate layer, preserving symbology/labels/arrows |

### Helpers (also exposed)

| Function | Description |
|----------|-------------|
| `POSM.defaultStyle(geomType, color)` | Generate Leaflet style options |
| `POSM.detectGeomType(geojson)` | Detect geometry type from features |
| `POSM.extractFields(geojson)` | Extract attribute field names |

### Clustering
Point layers with >200 features are automatically clustered using `L.markerClusterGroup`. Clustering can be toggled per layer via the UI.

### Error Handling
`fetchLayerGeoJSON` detects XML error responses from GeoServer (which return HTTP 200 but XML body) and extracts the error message from `ExceptionText` or `ServiceException` elements.

---

## symbology.js

Main symbology dispatcher and unique values implementation.

### Symbology Modes

| Mode | Function | Description |
|------|----------|-------------|
| `unique` | `POSM.applyUniqueValues(layerName, field, groupByYear)` | One color per distinct value (optionally grouped by year for date fields) |
| `graduated` | `POSM.applyGraduated(layerName, opts)` | Color ramp by numeric ranges |
| `proportional` | `POSM.applyProportional(layerName, opts)` | Size varies by value |
| `rules` | `POSM.applyRules(layerName, opts)` | Custom conditional styling |

### Functions

| Function | Description |
|----------|-------------|
| `POSM.applySymbology(layerName, opts)` | Dispatcher: routes to correct mode |
| `POSM.applyUniqueValues(layerName, field, groupByYear)` | Apply unique value symbology (optionally group dates by year) |
| `POSM.resetSymbology(layerName)` | Reset to default style |
| `POSM.changePointSymbol(layerName, symbolType)` | Change point marker shape |
| `POSM.buildSymbologyDropdowns()` | Populate layer selector dropdown |
| `POSM._applyStyleToLayer(layer, color, geomType, pointSymbol)` | Apply style to individual sublayer |
| `POSM.createSwatchSVG(geomType, color, symbolType)` | Single-color swatch SVG |
| `POSM.createMultiSwatchSVG(geomType, colors, symbolType)` | Multi-color swatch SVG |

### Options Object

```javascript
// Unique Values
{ mode: 'unique', field: 'fieldName' }

// Unique Values (date field grouped by year)
{ mode: 'unique', field: 'dateFieldName', groupByYear: true }

// Graduated
{ mode: 'graduated', field: 'fieldName', method: 'jenks', nClasses: 5, ramp: 'Viridis' }

// Proportional
{ mode: 'proportional', field: 'fieldName', minSize: 4, maxSize: 24 }

// Rules
{ mode: 'rules', rules: [{ field, operator, value, color }], defaultColor: '#888' }
```

---

## symbology-classify.js

Statistical classification algorithms for graduated symbology.

### Functions

| Function | Description |
|----------|-------------|
| `POSM.extractNumericValues(geojson, field)` | Extract and sort numeric values |
| `POSM.classifyEqualInterval(values, n)` | Equal-width class breaks |
| `POSM.classifyQuantile(values, n)` | Equal-count class breaks |
| `POSM.classifyJenks(values, n)` | Natural breaks (Fisher-Jenks DP algorithm, sampled to 1000) |
| `POSM.classifyValue(value, breaks)` | Find class index for a value |

---

## symbology-graduated.js

Graduated color ramp symbology.

### `POSM.applyGraduated(layerName, opts)`

| Option | Default | Description |
|--------|---------|-------------|
| `field` | required | Numeric field name |
| `method` | `'equalInterval'` | Classification method |
| `nClasses` | `5` | Number of classes |
| `ramp` | `'Blues'` | Color ramp name |

---

## symbology-proportional.js

Proportional symbol sizing based on numeric values.

### `POSM.applyProportional(layerName, opts)`

| Option | Default | Description |
|--------|---------|-------------|
| `field` | required | Numeric field name |
| `minSize` | `4` | Minimum symbol size (px) |
| `maxSize` | `24` | Maximum symbol size (px) |

Scaling behavior by geometry:
- **Points**: radius scales between minSize and maxSize
- **Lines**: stroke weight scales
- **Polygons**: fill opacity scales (0.2 to 0.8)

---

## symbology-rules.js

Rule-based conditional styling. First matching rule wins.

### `POSM.applyRules(layerName, opts)`

| Option | Default | Description |
|--------|---------|-------------|
| `rules` | `[]` | Array of rule objects |
| `defaultColor` | `'#888'` | Color for unmatched features |

### Rule Object

```javascript
{ field: 'status', operator: '=', value: 'active', color: '#3cb44b' }
```

### Supported Operators
`=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`, `IS NULL`, `IS NOT NULL`

---

## symbology-legend.js

Dynamic legend rendering per symbology mode.

### Functions

| Function | Description |
|----------|-------------|
| `POSM.updateLegendUniqueValues(valueColorMap, fieldName, geomType, symbolType)` | Legend with value-color pairs |
| `POSM.updateLegendGraduated(breaks, colors, fieldName, geomType)` | Legend with class ranges |
| `POSM.updateLegendProportional(minVal, maxVal, minSize, maxSize, fieldName, color)` | Legend with 3 size steps |
| `POSM.updateLegendRules(rules, defaultColor)` | Legend with rule conditions |

---

## symbology-ui.js

UI controls for symbology mode selection, ramp picker, and rule builder.

### Functions

| Function | Description |
|----------|-------------|
| `POSM.wireSymbologyModeGrid()` | Wire mode selector grid |
| `POSM.showSymbologyPanel(mode)` | Toggle panel visibility |
| `POSM.populateModeFields(layerName)` | Populate per-mode field dropdowns (including date fields for age) |
| `POSM.initRampPicker()` | Build graduated color ramp selector with canvas previews |
| `POSM.initAgeRampPicker()` | Build age-specific color ramp selector (defaults to YlOrRd) |
| `POSM.wireAgePanel()` | Wire age panel: field select, apply (compute + graduated + labels), remove |
| `POSM.addRuleCard()` | Create rule builder card |
| `POSM.collectRules()` | Extract rule objects from UI cards |
| `POSM.showPendingDot()` | Show pending indicator dot |
| `POSM.hidePendingDot()` | Hide pending indicator dot |

---

## app.js

Main application orchestrator. Handles initialization, event wiring, sidebar management, filter system, popups, and layer panel.

### Key Internal Functions

| Function | Description |
|----------|-------------|
| `buildLayerPanel()` | Build layer list with checkboxes, swatches, cluster toggles, and label dropdowns |
| `wireEvents()` | Wire all UI event handlers |
| `wireFilterPanel()` | Initialize attribute filter system |
| `showLoading()` / `hideLoading()` | Loading indicator management |

### Filter System

The filter panel supports:
- **Operators**: `=`, `!=`, `>`, `<`, `>=`, `<=`, `CONTAINS`, `LIKE`, `ILIKE`, `IS NULL`, `IS NOT NULL`, `BETWEEN`
- **Multiple stacked filters** per layer with AND/OR combination
- **Date field detection** with native date picker
- **Autocomplete suggestions** from field values
- **CQL generation** for GeoServer WFS requests

### Popup System

Attribute popups detect and format:
- **URLs**: Rendered as clickable hyperlinks
- **Image URLs** (`.jpg`, `.png`, `.gif`, `.webp`, etc.): Rendered inline as `<img>` tags

**Smart field ordering** (default): image URL fields first, then link URL fields, then remaining fields alphabetically.

**Field configuration** (per layer): Click the gear icon (⚙) in the popup header to open a modal where you can:
- Drag-reorder fields
- Toggle fields on/off via checkboxes
- Reset to default smart ordering

Configuration stored on `POSM.layerData[name].popupConfig` and persisted in session.

| Internal Function | Description |
|-------------------|-------------|
| `smartSortFields(props)` | Partition fields: images → links → alpha |
| `getPopupFields(props, info)` | Returns ordered field list (user config or smart default) |
| `openPopupFieldConfig(layerName, sampleProps)` | Opens the drag-reorder/toggle modal |

### Sidebar Features
- Collapsible with toggle button
- Resizable via drag handle (260px - 600px)
- Width stored in `--sidebar-width` CSS variable

---

## session.js

Session persistence with server-side JSON storage and localStorage fallback.

### Storage

- **Primary**: Server JSON files via `GET/POST /api/config/<username>` (stored in `configs/<username>.json`)
- **Fallback**: Browser localStorage with key `posm_map_config_<username>`
- Per-user, per-workspace configuration
- Auto-saving with 500ms debounce via `POSM.scheduleSave()`

### What Gets Persisted (per layer)

| Property | Description |
|----------|-------------|
| `visible` | Layer on/off state |
| `color` | Layer color |
| `symbology` | Full symbology config (mode, field, colors, rules, etc.) |
| `pointSymbol` | Point marker shape |
| `showArrows` | Arrow decorators on/off |
| `clustered` | Marker clustering on/off |
| `labelField` | Active label field name |
| `activeFilters` | Array of CQL filter objects |
| `filterCombineMode` | AND/OR filter combination |
| `popupConfig` | Field order and visibility for popups |
| `ageConfig` | Age calculator config: `{ field, unit, computedField }` |

Also persisted: basemap, map center, zoom level.

### Functions

| Function | Description |
|----------|-------------|
| `POSM.saveSession()` | Save to server (fire-and-forget) + localStorage |
| `POSM.loadSession()` | Async: try server first, fall back to localStorage |
| `POSM.applySession(config)` | Restore all layer settings from config object |
| `POSM.clearSession()` | Clear workspace config from server + localStorage |
| `POSM.scheduleSave()` | Debounced save (500ms) |
| `POSM.buildConfigObject()` | Build full config snapshot (used by save and share) |

Also persisted: basemap, map center, zoom level, bookmarks.

---

## share-viewer.js

Read-only map viewer for shared links. Replaces `app.js` in `share.html`.

### Init Flow

1. Extract share ID from URL path (`/share/<id>`)
2. Fetch snapshot from `/api/share/<id>`
3. Set `POSM.CONFIG.WORKSPACES` from snapshot
4. Init basemaps, load all layers from GeoServer
5. Override `POSM.updateLegend*` functions to no-ops (prevents individual symbology calls from wiping the combined legend)
6. Apply snapshot via `POSM.applySession(wsConfig)`
7. Build Leaflet layer control (`L.control.layers`) for toggling
8. Build combined legend for all visible layers

### Key Differences from app.js

- No auth check — shared views are public
- No sidebar, filter panel, or symbology UI
- Read-only popups (no gear icon for field configuration)
- Combined legend shows all layers (not overwritten per-layer)
- `POSM.showPopup` defined locally for read-only feature popups

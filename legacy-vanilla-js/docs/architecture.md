# Architecture Overview

## System Components

POSM GIS is a web-based GIS viewer connecting to a GeoServer instance backed by PostgreSQL/PostGIS on AWS RDS.

```
+-----------+       +------------+       +------------------+
|  Browser  | <---> | serve_map  | <---> |   GeoServer      |
| (Leaflet) |       |  (proxy)   |       | (WFS/REST API)   |
+-----------+       +------------+       +------------------+
                                                  |
                                         +------------------+
                                         | PostgreSQL/PostGIS|
                                         |   (AWS RDS)      |
                                         +------------------+
```

- **Browser**: Leaflet-based map viewer with vanilla JavaScript
- **serve_map.py**: Local Python HTTP server that proxies `/geoserver/` requests to avoid CORS
- **GeoServer**: Serves spatial data via WFS (Web Feature Service)
- **PostgreSQL/PostGIS**: Spatial database on AWS RDS (us-east-2)

## Project File Structure

```
/
├── docs/                        # Documentation
├── frontend/
│   ├── index.html               # Login page
│   ├── map.html                 # Main map viewer
│   ├── admin.html               # User/group management
│   ├── css/
│   │   └── styles.css           # All application styles
│   ├── share.html               # Read-only shared map viewer
│   └── js/
│       ├── auth.js              # Authentication & user management
│       ├── config.js            # Configuration, colors, utilities
│       ├── map.js               # Leaflet map init & basemaps
│       ├── markers.js           # Point symbol SVG rendering
│       ├── arrows.js            # Arrow decorators for lines
│       ├── labels.js            # Feature label engine
│       ├── layers.js            # WFS discovery & GeoJSON loading
│       ├── symbology.js         # Symbology dispatcher & unique values
│       ├── symbology-ui.js      # Symbology UI controls & ramp picker
│       ├── symbology-classify.js # Classification algorithms
│       ├── symbology-graduated.js # Graduated color ramp symbology
│       ├── symbology-proportional.js # Proportional symbol sizing
│       ├── symbology-rules.js   # Rule-based conditional styling
│       ├── symbology-legend.js  # Legend rendering
│       ├── session.js           # Session persistence (server + localStorage)
│       ├── share-viewer.js      # Read-only shared map viewer init
│       └── app.js               # Main app init, events, UI wiring
├── configs/                     # Server-side user config JSON files (auto-created)
│   └── shares/                  # Share snapshot JSON files (auto-created, 7-day TTL)
├── postgres.py                  # Database connectivity test
├── check_crs.py                 # CRS inspection tool
├── import_gdb.py                # GDB to PostGIS importer
├── serve_map.py                 # Local proxy server
└── CLAUDE.md                    # AI assistant instructions
```

## Frontend Module Dependencies

All modules use the `window.POSM` namespace pattern:

```
(function(POSM) {
    'use strict';
    // module code
})(window.POSM);
```

### Script Load Order (map.html)

Scripts must load in this order due to dependencies:

1. **auth.js** - Namespace init, authentication
2. **config.js** - Configuration, colors, shared state
3. **map.js** - Leaflet map initialization
4. **markers.js** - Point symbol rendering
5. **arrows.js** - Arrow decorators
6. **layers.js** - Layer discovery, GeoJSON, Leaflet layers
7. **labels.js** - Feature label engine
8. **session.js** - Session persistence (server + localStorage)
9. **symbology-classify.js** - Classification algorithms
10. **symbology-legend.js** - Legend rendering
11. **symbology.js** - Dispatcher, unique values (with date grouping), shared styling
12. **symbology-graduated.js** - Graduated symbology
13. **symbology-proportional.js** - Proportional symbology
14. **symbology-rules.js** - Rule-based symbology
15. **symbology-ui.js** - Symbology UI controls (including age panel)
16. **app.js** - Main initialization, event wiring

### Dependency Graph

```
app.js (main orchestrator)
├── auth.js (user/groups)
├── config.js (colors, ramps, utilities)
├── map.js (Leaflet init, basemaps)
├── layers.js (WFS, GeoJSON, Leaflet layers)
│   ├── markers.js (point symbols)
│   ├── arrows.js (line decorators)
│   └── labels.js (feature labels)
└── symbology.js (dispatcher)
    ├── symbology-ui.js (UI controls, ramp picker, rule builder)
    ├── symbology-classify.js (classification algorithms)
    ├── symbology-graduated.js (color ramp symbology)
    ├── symbology-proportional.js (size symbology)
    ├── symbology-rules.js (conditional symbology)
    └── symbology-legend.js (legend rendering)
```

## Data Flow

```
User Login (index.html)
    |
    v
Map Viewer (map.html)
    |
    v
Discover Workspaces (auth.js -> GeoServer REST/WFS)
    |
    v
Discover Layers (layers.js -> WFS GetCapabilities per workspace)
    |
    v
Load Layer GeoJSON (layers.js -> WFS GetFeature, optional CQL_FILTER)
    |
    v
Create Leaflet Layer (layers.js -> L.geoJSON + optional MarkerCluster)
    |
    v
Apply Symbology (symbology.js dispatcher)
    |--- Unique Values -> symbology.js (supports groupByYear for date fields)
    |--- Graduated -> symbology-classify.js + symbology-graduated.js
    |--- Proportional -> symbology-proportional.js
    |--- Rules -> symbology-rules.js
    |--- Age -> app.js (computeAge) + symbology-graduated.js
    |
    v
Update Legend (symbology-legend.js)
```

## Shared State

All layer state is stored in `POSM.layerData[layerName]`:

```javascript
{
    geojson:        // Raw GeoJSON data
    leafletLayer:   // L.geoJSON layer instance
    clusterGroup:   // L.markerClusterGroup (or null)
    geomType:       // 'Point', 'LineString', 'Polygon', etc.
    color:          // Current layer color
    pointSymbol:    // 'circle', 'square', 'triangle', etc.
    fields:         // Array of attribute field names
    label:          // Display label
    fullName:       // workspace:layerName
    clustered:      // Boolean, clustering enabled
    symbology:      // Active symbology config object
    showArrows:     // Boolean, arrows on line layers
    arrowDecorators:// Array of L.polylineDecorator
    labelField:     // Active label field name (or null)
    labelMinZoom:   // Min zoom for label visibility
    _labelManager:  // Viewport-culled label manager (entries, activeMarkers, layerGroup, etc.)
    _labelLayer:    // (legacy) L.layerGroup for labels — replaced by _labelManager
    popupConfig:    // { fieldOrder: [...], hiddenFields: {...} } or null for smart default
    ageConfig:      // { field, unit, computedField } or null — computed age from date field
    activeFilter:   // Combined CQL string
    activeFilters:  // Array of individual filter objects
    filterCombineMode: // 'AND' or 'OR'
}
```

## External Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| Leaflet | 1.9.4 | Map rendering engine |
| Leaflet.markercluster | 1.5.3 | Point clustering |
| leaflet-polylinedecorator | 1.6.0 | Arrow symbols on lines |

All loaded from unpkg CDN in map.html and share.html.

## Share System Architecture

```
User clicks Share → app.js builds config snapshot
    |
    v
POST /api/share → serve_map.py generates UUID, saves configs/shares/<id>.json
    |
    v
Share modal shows URL with copy/email/WhatsApp/Teams options
    |
    v
Recipient opens /share/<id> → serve_map.py serves share.html
    |
    v
share-viewer.js fetches /api/share/<id> → gets snapshot JSON
    |
    v
Loads layers from GeoServer → applySession(wsConfig) → read-only view
```

- **Snapshot contents**: workspace name, basemap, center/zoom, per-layer config (visibility, color, symbology, filters, labels, arrows, popup config, age config)
- **Storage**: `configs/shares/<id>.json` files with `created_at` timestamp
- **Expiry**: 7-day TTL, cleanup runs on every share API request
- **Share viewer** (`share.html`): loads same POSM modules minus `symbology-ui.js` and `app.js`, uses `share-viewer.js` instead
- **Legend**: `updateLegend*` functions overridden to no-ops; `buildShareLegend()` renders all layers in a combined legend

# Development Guide

This document covers development workflows, conventions, and how to extend the POSM GIS application.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Server](#development-server)
- [Project Conventions](#project-conventions)
- [Adding a New Feature](#adding-a-new-feature)
- [Adding a New Symbology Mode](#adding-a-new-symbology-mode)
- [Adding a New Layer Control](#adding-a-new-layer-control)
- [Adding a New Sidebar Panel](#adding-a-new-sidebar-panel)
- [Working with Leaflet](#working-with-leaflet)
- [Working with GeoServer](#working-with-geoserver)
- [State Management Patterns](#state-management-patterns)
- [CSS Conventions](#css-conventions)
- [TypeScript Conventions](#typescript-conventions)
- [Troubleshooting](#troubleshooting)

---

## Getting Started

```bash
# Clone and install
cd posm-gis
npm install

# Start development server
npm run dev

# Type check (no emit)
npx tsc --noEmit

# Production build
npm run build

# Lint
npm run lint
```

The dev server runs on **port 3000** and proxies GeoServer requests to `13.58.149.42:8080`.

## Development Server

### Proxy Configuration

The Vite dev server proxies three API paths (configured in `vite.config.ts`):

| Request              | Proxied To                                |
|----------------------|-------------------------------------------|
| `/api/geoserver/*`   | `http://13.58.149.42:8080/geoserver/*`    |
| `/api/config/*`      | `http://localhost:8000/api/config/*`       |
| `/api/share/*`       | `http://localhost:8000/api/share/*`        |

The config and share proxies target a local Python server (optional for dev — the app falls back to localStorage).

### Hot Module Replacement

Vite provides HMR for all React components. CSS changes are applied instantly. Changes to `lib/` modules require a browser refresh if the module was already loaded and cached by Leaflet.

---

## Project Conventions

### File Organization

```
config/      → App configuration and constants (no logic)
types/       → TypeScript interfaces only (no implementations)
store/       → Zustand store and Leaflet registry
lib/         → Pure TypeScript logic (NO React imports)
hooks/       → React hooks that bridge store ↔ Leaflet
routes/      → Full page components (one per route)
components/  → Reusable UI components (grouped by feature)
```

### Import Rules

1. **`lib/` modules must not import React** — they are pure functions
2. **`types/` and `config/` are leaf dependencies** — imported by everything, import nothing from the app
3. **Components never call `lib/` functions directly for map mutations** — they go through hooks
4. **Components read from Zustand store** using `useStore((s) => s.specificField)` selectors

### Naming Conventions

| Category    | Convention          | Example                    |
|-------------|---------------------|----------------------------|
| Components  | PascalCase          | `LayerPanel.tsx`           |
| Hooks       | camelCase, `use*`   | `useLayers.ts`             |
| Lib modules | camelCase           | `colorUtils.ts`            |
| Types       | PascalCase          | `LayerConfig`              |
| Store actions | camelCase, verb-first | `setLayerVisibility`   |
| CSS classes | kebab-case          | `.layer-panel-search`      |

---

## Adding a New Feature

### General Pattern

1. **Define types** in `src/types/` if the feature has new data structures
2. **Add store state + actions** in `src/store/index.ts` if the feature has persistent state
3. **Write pure logic** in `src/lib/` for any non-UI computations
4. **Create a hook** in `src/hooks/` if the feature needs to bridge React ↔ Leaflet
5. **Build the component** in `src/components/`
6. **Wire it into the sidebar** or route

### Example: Adding Heatmap Support

```
1. types/symbology.ts  → Add HeatmapSymbology interface to SymbologyConfig union
2. store/index.ts      → No changes needed (symbology is already generic)
3. lib/symbology.ts    → Add applyHeatmap() function + case in applySymbology()
4. hooks/              → No new hook needed (symbology is applied via direct calls)
5. components/symbology/HeatmapPanel.tsx → New component with options UI
6. components/symbology/SymbologyPanel.tsx → Add "Heatmap" button to mode grid
7. components/legend/LegendPanel.tsx → Add heatmap legend rendering
```

---

## Adding a New Symbology Mode

1. **Define the config interface** in `src/types/symbology.ts`:

```typescript
export interface HeatmapSymbology {
  mode: 'heatmap';
  field: string;
  radius: number;
  blur: number;
}
```

2. **Add to the union type**:

```typescript
export type SymbologyConfig = UniqueSymbology | GraduatedSymbology
  | ProportionalSymbology | RuleSymbology | HeatmapSymbology;
```

3. **Implement the apply function** in `src/lib/symbology.ts`:

```typescript
export function applyHeatmap(
  leafletLayer: L.GeoJSON,
  geojson: GeoJSON.FeatureCollection,
  opts: { field: string; radius: number; blur: number }
): HeatmapSymbology {
  // Implementation...
  return { mode: 'heatmap', ...opts };
}
```

4. **Add the dispatch case** in `applySymbology()`:

```typescript
case 'heatmap':
  return applyHeatmap(leafletLayer, geojson, { ... });
```

5. **Create the UI panel** at `src/components/symbology/HeatmapPanel.tsx`

6. **Register in SymbologyPanel.tsx**: Add a button to the mode grid and conditionally render HeatmapPanel

7. **Update LegendPanel.tsx**: Add rendering for heatmap legend entries

---

## Adding a New Layer Control

Layer controls live in `src/components/sidebar/LayerItem.tsx`. To add a new per-layer control:

1. **Add state to `LayerConfig`** in `src/types/layer.ts` (if needed)
2. **Add a store action** in `src/store/index.ts` (e.g., `setLayerNewProp`)
3. **Add the control UI** inside the `LayerItem` component's render return
4. **Implement the Leaflet side effect** in a `useCallback` handler that calls the registry

Example: Adding opacity control

```typescript
// In LayerItem.tsx
const handleOpacityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  const opacity = parseFloat(e.target.value);
  const refs = getLayerRefs(name);
  if (refs) {
    refs.leafletLayer.setStyle({ opacity, fillOpacity: opacity * 0.5 });
  }
  setLayerOpacity(name, opacity);  // New store action
}, [name, setLayerOpacity]);
```

---

## Adding a New Sidebar Panel

1. **Create the component** in `src/components/sidebar/` or `src/components/{feature}/`
2. **Import and add it to `Sidebar.tsx`**:

```tsx
import { NewPanel } from '../feature/NewPanel';

// Inside the sidebar-content div:
<section className="sidebar-section sidebar-section--newfeature"
  style={{ padding: '8px 10px', borderBottom: '1px solid #2d2d44' }}>
  <h4 style={{ margin: '0 0 6px 0', fontSize: 12, textTransform: 'uppercase',
    letterSpacing: 0.8, color: '#888' }}>
    New Feature
  </h4>
  <NewPanel mapRef={mapRef} />
</section>
```

---

## Working with Leaflet

### The Imperative Pattern

All Leaflet operations happen outside React's render cycle:

```typescript
// DO: Use refs and effects
const mapRef = useRef<L.Map | null>(null);

useEffect(() => {
  const map = mapRef.current;
  if (!map) return;
  map.flyTo([lat, lng], zoom);
}, [lat, lng, zoom]);

// DON'T: Try to render Leaflet objects as JSX
// <MapContainer> or <Marker> from react-leaflet are NOT used
```

### Getting Leaflet Layer References

```typescript
import { getLayerRefs } from '../store/leafletRegistry';

const refs = getLayerRefs('workspace:layerName');
if (refs) {
  refs.leafletLayer.eachLayer((sublayer) => {
    sublayer.setStyle({ color: 'red' });
  });
}
```

### Creating Leaflet Layers

When creating new `L.geoJSON` layers, always provide both `pointToLayer` and `style`:

```typescript
const leafletLayer = L.geoJSON(geojson, {
  pointToLayer: isPoint
    ? (_feature, latlng) => createPointMarker(latlng, symbol, color, darker, 10)
    : undefined,
  style: !isPoint
    ? () => defaultStyle(geomType, color)
    : undefined,
});
```

### Invalidating Map Size

After any layout change that affects the map container (sidebar resize, toggle):

```typescript
setTimeout(() => mapRef.current?.invalidateSize(), 200);
```

---

## Working with GeoServer

### Discovering Layers

```typescript
import { discoverLayers } from '../lib/geoserver';

const layers = await discoverLayers(['workspace1', 'workspace2']);
// Returns: GeoServerLayer[] with fullName, shortName, label
```

### Fetching GeoJSON

```typescript
import { fetchLayerGeoJSON } from '../lib/geoserver';

// Without filter
const geojson = await fetchLayerGeoJSON('workspace:layerName');

// With CQL filter
const filtered = await fetchLayerGeoJSON('workspace:layerName', "STATUS = 'active'");
```

### GeoServer Error Handling

GeoServer returns XML error responses even for JSON requests. The `fetchLayerGeoJSON` function automatically detects this and throws a descriptive error. Always wrap GeoServer calls in try/catch:

```typescript
try {
  const geojson = await fetchLayerGeoJSON(layerName, cql);
} catch (err) {
  console.error('GeoServer error:', err);
  // Handle gracefully — show error in UI
}
```

---

## State Management Patterns

### Reading Store State in Components

```typescript
// Selective subscription (efficient — only re-renders when this value changes)
const basemap = useStore((s) => s.basemap);

// Multiple values (re-renders when ANY of these change)
const { layers, layerOrder } = useStore((s) => ({
  layers: s.layers,
  layerOrder: s.layerOrder,
}));
```

### Reading Store State Outside Components

```typescript
// In hooks, callbacks, or lib functions — use getState()
const currentLayers = useStore.getState().layers;
```

### Updating Store State

```typescript
// From components (via actions)
const setBasemap = useStore((s) => s.setBasemap);
setBasemap('satellite');

// From anywhere (imperative)
useStore.getState().setLayerVisibility('layer1', false);
```

### Non-Reactive Leaflet Registry

```typescript
import { getLayerRefs, setLayerRefs, removeLayerRefs } from '../store/leafletRegistry';

// Read (returns undefined if not found)
const refs = getLayerRefs('workspace:layer');

// Write (overwrites existing)
setLayerRefs('workspace:layer', { leafletLayer, clusterGroup, geojson, ... });

// Delete
removeLayerRefs('workspace:layer');
```

---

## CSS Conventions

### Dark Theme Colors

| Variable | Value      | Usage                    |
|----------|------------|--------------------------|
| BG Dark  | `#0a0a1a`  | Page background          |
| BG Card  | `#1a1a2e`  | Sidebar, cards, modals   |
| BG Input | `#0f3460`  | Form inputs              |
| Border   | `#2d2d44`  | Section dividers         |
| Text     | `#e0e0e0`  | Primary text             |
| Text Dim | `#888`     | Secondary/muted text     |
| Accent   | `#42d4f4`  | Interactive elements, highlights |
| Danger   | `#e94560`  | Delete buttons, errors   |

### Class Naming

CSS classes use BEM-lite naming: `.block-element` (no modifiers, use separate `.active` classes):

```css
.layer-panel { }
.layer-panel-search { }
.layer-search-input { }
.layer-search-clear { }
.layer-list { }
.layer-list-item { }
.layer-list-empty { }
```

### When to Use Inline Styles vs CSS Classes

- **CSS classes** for reusable patterns (defined in `App.css`)
- **Inline styles** for one-off layout adjustments, dynamic values, and self-contained components (like AdminPage)

---

## TypeScript Conventions

### Leaflet Type Casting

Some Leaflet operations require type assertions:

```typescript
// Accessing feature from sublayer
const feature = (sublayer as any).feature as GeoJSON.Feature | undefined;

// markerClusterGroup (not in @types/leaflet)
const cluster = (L as unknown as {
  markerClusterGroup: (opts: object) => L.MarkerClusterGroup;
}).markerClusterGroup({ ... });
```

### Strict Mode

The project uses TypeScript strict mode. All parameters must be typed, no implicit `any`.

### Type Imports

Use `import type` for type-only imports to help tree-shaking:

```typescript
import type { LayerConfig } from '../types/layer';
import type { SymbologyConfig } from '../types/symbology';
```

---

## Troubleshooting

### "layers is not defined" Runtime Error

If a hook references a Zustand selector outside its function body, the variable won't exist at module scope. Use `useStore.getState()` for imperative access.

### GeoServer Returns XML Instead of JSON

Check the `outputFormat` parameter in the WFS request. It should be `application/json`. The `fetchLayerGeoJSON` function handles this, but custom requests need the parameter.

### Map Doesn't Resize After Sidebar Toggle

Call `map.invalidateSize()` after the CSS transition completes:

```typescript
setTimeout(() => mapRef.current?.invalidateSize(), 200);
```

### Clustering Doesn't Disable at Max Zoom

Check `disableClusteringAtZoom` in the markerClusterGroup options. It should be set to `20` (one below MAX_ZOOM of 22 to show individual markers).

### Labels Don't Appear

Labels have a minimum zoom threshold based on feature count. Zoom in further, or check that `labelField` is set to a valid field name (not `__none__`).

### Session Not Restoring

Check that the localStorage key matches the pattern `posm_session_{username}_{workspace}`. The username and workspace must match exactly. Open browser DevTools > Application > Local Storage to inspect.

### Production Build Size

Current build output:
- **JS**: ~494 KB (148 KB gzipped)
- **CSS**: ~25 KB (8.5 KB gzipped)

Most of the JS size comes from Leaflet (~170 KB) and its plugins. The React app code is relatively small.

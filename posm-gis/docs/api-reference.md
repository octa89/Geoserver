# API Reference

Complete module-level reference for all exports in the POSM GIS application.

## Table of Contents

- [Configuration](#configuration)
- [Types](#types)
- [Store](#store)
- [Library Modules](#library-modules)
- [Hooks](#hooks)
- [Components](#components)

---

## Configuration

### `src/config/constants.ts`

| Export             | Type                          | Description                          |
|--------------------|-------------------------------|--------------------------------------|
| `GEOSERVER_URL`    | `string`                      | GeoServer API base URL               |
| `API_URL`          | `string`                      | Backend API base URL                 |
| `DEFAULT_CENTER`   | `[number, number]`            | Default map center `[41.897, -84.037]` |
| `DEFAULT_ZOOM`     | `number`                      | Default zoom level `14`              |
| `MAX_ZOOM`         | `number`                      | Maximum zoom `22`                    |
| `MAX_NATIVE_ZOOM`  | `number`                      | Max native tile zoom `19`            |
| `BASEMAPS`         | `Record<BasemapKey, BasemapConfig>` | Street, Satellite, Dark basemaps |
| `BasemapKey`       | `type`                        | `'street' \| 'satellite' \| 'dark'`   |
| `COLOR_PALETTE`    | `string[]`                    | 25 distinct colors for unique values |
| `LAYER_COLORS`     | `string[]`                    | 20 colors for layer defaults         |
| `COLOR_RAMPS`      | `Record<string, string[]>`    | 14 named gradient ramps              |
| `POINT_SYMBOLS`    | `string[]`                    | `['circle','square','triangle','diamond','star','cross']` |

### `src/config/auth.ts`

| Export                  | Signature                                           | Description                     |
|-------------------------|-----------------------------------------------------|---------------------------------|
| `AppUser`               | `interface`                                         | `{username, displayName, groups[], role}` |
| `AppGroup`              | `interface`                                         | `{id, label, workspaces[]}`     |
| `initAuth()`            | `() => Promise<void>`                               | Initialize default users/groups |
| `hashPassword(pwd)`     | `(string) => Promise<string>`                       | SHA-256 hex hash                |
| `setUserPassword(u,p)`  | `(string, string) => Promise<void>`                 | Store hashed password           |
| `removeUserPassword(u)` | `(string) => void`                                  | Delete stored password          |
| `getUsers()`            | `() => AppUser[]`                                   | Read all users from localStorage|
| `setUsers(users)`       | `(AppUser[]) => void`                               | Write all users                 |
| `getGroups()`           | `() => AppGroup[]`                                  | Read all groups                 |
| `setGroups(groups)`     | `(AppGroup[]) => void`                              | Write all groups                |
| `login(user, pwd)`      | `(string, string) => Promise<AppUser \| null>`      | Authenticate user               |
| `logout()`              | `() => void`                                        | Clear session                   |
| `getCurrentUser()`      | `() => AppUser \| null`                             | Get current session user        |
| `getUserWorkspaces(u)`  | `(AppUser) => string[]`                             | Resolve user's workspace access |
| `getSelectedWorkspace()`| `() => string \| null`                              | Get active workspace            |
| `setSelectedWorkspace()`| `(string) => void`                                  | Set active workspace            |

---

## Types

### `src/types/layer.ts`

```typescript
interface GeoServerLayer {
  fullName: string;     // "workspace:layerName"
  shortName: string;    // "layerName"
  label: string;        // Display label
}

interface LayerConfig {
  fullName: string;
  label: string;
  visible: boolean;
  color: string;
  geomType: string;     // "Point" | "MultiPoint" | "LineString" | etc.
  pointSymbol: string;
  clustered: boolean;
  showArrows: boolean;
  labelField: string | null;
  fields: string[];
  featureCount: number;
  symbology: SymbologyConfig | null;
  activeFilters: FilterDef[];
  filterCombineMode: 'AND' | 'OR';
  popupConfig: PopupConfig | null;
  ageConfig: AgeConfig | null;
}

interface FilterDef {
  cql: string;          // CQL expression: "field > 5"
  label: string;        // Human-readable: "field > 5"
}

interface PopupConfig {
  fieldOrder: string[];
  hiddenFields: Record<string, boolean>;
  titleText?: string;
  titleField?: string;
}

interface AgeConfig {
  field: string;
  unit: 'years' | 'months';
  computedField?: string;
}

interface LeafletRefs {
  leafletLayer: L.GeoJSON;
  clusterGroup: L.MarkerClusterGroup | null;
  geojson: GeoJSON.FeatureCollection;
  arrowDecorators: L.Layer[];
  labelManager: unknown;
}

interface Bookmark {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
}
```

### `src/types/symbology.ts`

```typescript
type SymbologyConfig = UniqueSymbology | GraduatedSymbology
                     | ProportionalSymbology | RuleSymbology;

interface UniqueSymbology {
  mode: 'unique';
  field: string;
  valueColorMap: Record<string, string>;
  groupByYear: boolean;
}

interface GraduatedSymbology {
  mode: 'graduated';
  field: string;
  method: 'equalInterval' | 'quantile' | 'jenks';
  nClasses: number;
  ramp: string;
  breaks: number[];
  colors: string[];
}

interface ProportionalSymbology {
  mode: 'proportional';
  field: string;
  minSize: number;
  maxSize: number;
  color?: string;
  minVal: number;
  maxVal: number;
}

interface RuleSymbology {
  mode: 'rules';
  rules: RuleDef[];
  defaultColor: string;
}

interface RuleDef {
  field: string;
  operator: string;   // "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE" | "IS NULL" | "IS NOT NULL"
  value: string;
  color: string;
}
```

### `src/types/session.ts`

```typescript
interface PerLayerConfig {
  visible: boolean;
  color: string;
  symbology: SymbologyConfig | null;
  activeFilters: FilterDef[];
  filterCombineMode: 'AND' | 'OR';
  labelField: string | null;
  clustered: boolean;
  showArrows: boolean;
}

interface WorkspaceConfig {
  basemap: string;
  center: [number, number];
  zoom: number;
  layers: Record<string, PerLayerConfig>;
  bookmarks: Bookmark[];
}
```

### `src/types/share.ts`

```typescript
interface ShareSnapshot {
  wsName: string;
  wsConfig: WorkspaceConfig;
  created_at?: number;
}

interface ShareCreateResponse {
  id: string;
  url: string;
}
```

---

## Store

### Zustand Store (`src/store/index.ts`)

**State:**

| Property                | Type                           | Default          |
|-------------------------|--------------------------------|------------------|
| `center`                | `[number, number]`             | `[41.897, -84.037]` |
| `zoom`                  | `number`                       | `14`             |
| `basemap`               | `BasemapKey`                   | `'street'`       |
| `layers`                | `Record<string, LayerConfig>`  | `{}`             |
| `layerOrder`            | `string[]`                     | `[]`             |
| `sidebarOpen`           | `boolean`                      | `true`           |
| `filterPanelOpen`       | `boolean`                      | `false`          |
| `activeSymbologyLayer`  | `string \| null`               | `null`           |
| `activeSymbologyMode`   | `string \| null`               | `null`           |
| `loading`               | `boolean`                      | `false`          |
| `loadingMessage`        | `string`                       | `''`             |
| `currentWorkspace`      | `string`                       | `''`             |
| `workspaces`            | `string[]`                     | `[]`             |
| `bookmarks`             | `Bookmark[]`                   | `[]`             |

**Actions:**

| Action                  | Signature                                      |
|-------------------------|-------------------------------------------------|
| `setCenter`             | `(center: [number, number]) => void`            |
| `setZoom`               | `(zoom: number) => void`                        |
| `setBasemap`            | `(basemap: BasemapKey) => void`                 |
| `setMapView`            | `(center, zoom) => void`                        |
| `setSidebarOpen`        | `(open: boolean) => void`                       |
| `setFilterPanelOpen`    | `(open: boolean) => void`                       |
| `setLoading`            | `(loading: boolean, message?: string) => void`  |
| `setWorkspaces`         | `(workspaces: string[]) => void`                |
| `setCurrentWorkspace`   | `(ws: string) => void`                          |
| `setLayer`              | `(name: string, config: LayerConfig) => void`   |
| `removeLayer`           | `(name: string) => void`                        |
| `setLayerVisibility`    | `(name, visible) => void`                       |
| `setLayerColor`         | `(name, color) => void`                         |
| `setLayerSymbology`     | `(name, symbology) => void`                     |
| `setLayerFilters`       | `(name, filters, mode?) => void`                |
| `setLayerLabelField`    | `(name, field) => void`                         |
| `setLayerClustered`     | `(name, clustered) => void`                     |
| `setLayerArrows`        | `(name, show) => void`                          |
| `setLayerOrder`         | `(order: string[]) => void`                     |
| `addBookmark`           | `(bookmark: Bookmark) => void`                  |
| `removeBookmark`        | `(id: string) => void`                          |
| `setBookmarks`          | `(bookmarks: Bookmark[]) => void`               |
| `resetLayers`           | `() => void`                                    |

### Leaflet Registry (`src/store/leafletRegistry.ts`)

| Export              | Signature                                           |
|---------------------|-----------------------------------------------------|
| `getLayerRefs`      | `(name: string) => LeafletLayerRefs \| undefined`   |
| `setLayerRefs`      | `(name: string, refs: LeafletLayerRefs) => void`    |
| `removeLayerRefs`   | `(name: string) => void`                            |
| `getAllLayerRefs`    | `() => Map<string, LeafletLayerRefs>`               |
| `clearRegistry`     | `() => void`                                        |

---

## Library Modules

### `src/lib/geoserver.ts`

| Export                    | Signature                                                       |
|---------------------------|-----------------------------------------------------------------|
| `discoverAllWorkspaces`   | `() => Promise<string[]>`                                       |
| `discoverWorkspaceLayers` | `(workspace: string) => Promise<GeoServerLayer[]>`              |
| `discoverLayers`          | `(workspaces: string[]) => Promise<GeoServerLayer[]>`           |
| `fetchLayerGeoJSON`       | `(fullName: string, cqlFilter?: string) => Promise<GeoJSON.FeatureCollection>` |

### `src/lib/symbology.ts`

| Export               | Signature                                                          |
|----------------------|--------------------------------------------------------------------|
| `defaultStyle`       | `(geomType, color) => L.PathOptions`                               |
| `applyStyleToLayer`  | `(layer, color, geomType, pointSymbol, radius?) => void`           |
| `applySymbology`     | `(leafletLayer, geojson, geomType, pointSymbol, config) => SymbologyConfig` |
| `applyUniqueValues`  | `(leafletLayer, geojson, geomType, pointSymbol, field, groupByYear?) => UniqueSymbology` |
| `applyGraduated`     | `(leafletLayer, geojson, geomType, pointSymbol, opts) => GraduatedSymbology` |
| `applyProportional`  | `(leafletLayer, geojson, geomType, pointSymbol, opts) => ProportionalSymbology` |
| `applyRules`         | `(leafletLayer, geojson, geomType, pointSymbol, opts) => RuleSymbology` |
| `extractYear`        | `(val: unknown) => string \| null`                                 |
| `resetSymbology`     | `(leafletLayer, geomType, color, pointSymbol) => void`             |

### `src/lib/classify.ts`

| Export                  | Signature                                          |
|-------------------------|----------------------------------------------------|
| `extractNumericValues`  | `(geojson, field) => number[]`                     |
| `classifyEqualInterval` | `(values[], n) => number[]`                       |
| `classifyQuantile`      | `(values[], n) => number[]`                       |
| `classifyJenks`         | `(values[], n) => number[]`                       |
| `classifyValue`         | `(value: number, breaks: number[]) => number`     |

### `src/lib/colorUtils.ts`

| Export               | Signature                                          |
|----------------------|----------------------------------------------------|
| `interpolateColor`   | `(c1: string, c2: string, t: number) => string`   |
| `generateRampColors` | `(rampKey: string, n: number) => string[]`         |
| `drawRamp`           | `(canvas: HTMLCanvasElement, rampKey: string) => void` |
| `darkenColor`        | `(hex: string) => string`                          |
| `isNumericField`     | `(geojson, field) => boolean`                      |
| `isDateField`        | `(geojson, field) => boolean`                      |

### `src/lib/markers.ts`

| Export              | Signature                                                      |
|---------------------|----------------------------------------------------------------|
| `pointSVG`          | `(symbol, fill, stroke, size) => string`                       |
| `createPointMarker` | `(latlng, symbolType, fillColor, borderColor, size?) => L.Marker \| L.CircleMarker` |

### `src/lib/arrows.ts`

| Export                 | Signature                                                  |
|------------------------|------------------------------------------------------------|
| `addArrowDecorators`   | `(map, layerName, leafletLayer, color) => L.Layer[]`       |
| `removeArrowDecorators`| `(map, decorators[]) => void`                              |
| `toggleArrows`         | `(map, layerName, leafletLayer, color, show, current) => L.Layer[]` |

### `src/lib/labels.ts`

| Export                   | Signature                                                  |
|--------------------------|------------------------------------------------------------|
| `computeLabelMinZoom`    | `(geojson) => number`                                      |
| `lineStringMidpoint`     | `(coords) => {lat, lng, angle}`                            |
| `buildLabelEntries`      | `(geojson, field, geomType, color) => LabelEntry[]`        |
| `createLabelMarker`      | `(entry, map) => L.Marker`                                 |
| `reconcileViewport`      | `(mgr, map) => void`                                       |
| `applyLabels`            | `(map, geojson, geomType, color, field) => LabelManager`   |
| `removeLabels`           | `(map, mgr) => void`                                       |
| `updateLabelVisibility`  | `(map, mgr, zoom, parentVisible, minZoom) => void`         |
| `initLabelMoveListener`  | `(map, getLabeledLayers) => () => void`                     |

### `src/lib/fieldUtils.ts`

| Export            | Signature                                       |
|-------------------|-------------------------------------------------|
| `extractFields`   | `(geojson) => string[]`                         |
| `detectGeomType`  | `(geojson) => string`                           |

### `src/lib/popupUtils.ts`

| Export            | Signature                                       |
|-------------------|-------------------------------------------------|
| `escapeHtml`      | `(str: string) => string`                       |
| `isImageUrl`      | `(url: string) => boolean`                      |
| `isUrl`           | `(str: string) => boolean`                      |
| `formatPopupValue`| `(val: unknown) => string`                      |
| `smartSortFields` | `(props: Record<string,unknown>) => string[]`   |

### `src/lib/configBuilder.ts`

| Export              | Signature                |
|---------------------|--------------------------|
| `buildConfigObject` | `() => { wsName: string; wsConfig: WorkspaceConfig }` |

### `src/components/filter/filterUtils.ts`

| Export              | Signature                                                    |
|---------------------|--------------------------------------------------------------|
| `FILTER_OPERATORS`  | `string[]`                                                   |
| `NULL_OPERATORS`    | `string[]`                                                   |
| `buildSingleCql`    | `(field, operator, value) => string`                         |
| `buildCqlFilter`    | `(filters: FilterDef[], mode: 'AND'\|'OR') => string`       |
| `formatFilterLabel` | `(filter: FilterDef) => string`                              |
| `makeFilterDef`     | `(field, operator, value) => FilterDef`                      |

### `src/components/popup/FeaturePopup.ts`

| Export          | Signature                                                    |
|-----------------|--------------------------------------------------------------|
| `bindPopups`    | `(leafletLayer: L.GeoJSON, layerName: string, fields: string[]) => void` |
| `unbindPopups`  | `(leafletLayer: L.GeoJSON) => void`                          |

---

## Hooks

### `src/hooks/useLayers.ts`

```typescript
function useLayers(mapRef: RefObject<L.Map | null>): {
  loadAllLayers: (workspaces: string[]) => Promise<L.LatLngBounds | null>;
}
```

### `src/hooks/useFilters.ts`

```typescript
function useFilters(mapRef: RefObject<L.Map | null>): {
  applyFilters: (layerName: string) => Promise<void>;
}
```

### `src/hooks/useSession.ts`

```typescript
function useSession(): {
  saveSession: () => Promise<void>;
  loadSession: (workspace: string) => void;
  autoSave: () => void;
  isSaving: boolean;
}
```

---

## Components

### Route Pages

| Component     | Path    | Props                           | Auth     |
|---------------|---------|----------------------------------|----------|
| `LoginPage`   | `/login`| `{onLogin: (AppUser) => void}`   | Public   |
| `MapPage`     | `/map`  | `{user: AppUser}`                | Required |
| `AdminPage`   | `/admin`| None                             | Admin    |
| `SharePage`   | `/share/:shareId` | None                    | Public   |

### Sidebar Components

| Component       | Props                              | Description              |
|-----------------|------------------------------------|--------------------------|
| `Sidebar`       | `{mapRef, user?, onLogout?}`       | Main sidebar container   |
| `LayerPanel`    | `{mapRef}`                         | Layer list + search      |
| `LayerItem`     | `{name, mapRef}`                   | Single layer controls    |
| `BookmarkPanel` | `{mapRef}`                         | Bookmark CRUD            |

### Symbology Components

| Component            | Props              | Description                 |
|----------------------|--------------------|-----------------------------|
| `SymbologyPanel`     | None               | Mode selector + sub-panels  |
| `UniqueValuesPanel`  | `{layerName}`      | Unique values config        |
| `GraduatedPanel`     | `{layerName}`      | Classification config       |
| `ProportionalPanel`  | `{layerName}`      | Proportional scaling config |
| `RulesPanel`         | `{layerName}`      | Rule builder                |
| `RampPicker`         | `{value, onChange}` | Color ramp selector        |

### Filter Components

| Component           | Props                              | Description             |
|---------------------|------------------------------------|-------------------------|
| `FilterPanel`       | `{mapRef}`                         | Filter orchestrator     |
| `FilterForm`        | `{layerName, fields[], onAdd}`     | Single filter form      |
| `ActiveFiltersList` | `{filters[], onRemove, combineMode}` | Filter chip display  |

### Other Components

| Component      | Props                | Description               |
|----------------|----------------------|---------------------------|
| `LegendPanel`  | None                 | Dynamic legend display    |
| `ShareModal`   | `{isOpen, onClose}`  | Share URL dialog          |

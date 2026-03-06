# Architecture Guide

This document describes the system architecture of the POSM GIS React application, including data flow, state management, component organization, and the dev-to-production transition.

## Table of Contents

- [System Overview](#system-overview)
- [Target Production Architecture](#target-production-architecture)
- [Development Architecture](#development-architecture)
- [Application Layers](#application-layers)
- [State Management](#state-management)
- [Data Flow](#data-flow)
- [Component Architecture](#component-architecture)
- [Routing](#routing)
- [Authentication](#authentication)
- [GeoServer Integration](#geoserver-integration)
- [Session Persistence](#session-persistence)
- [Share System](#share-system)

---

## System Overview

POSM GIS is a single-page application that visualizes geospatial data from a GeoServer instance backed by PostgreSQL/PostGIS on AWS RDS. The app discovers available map layers via WFS (Web Feature Service) capabilities, fetches GeoJSON data, and renders it on an interactive Leaflet map.

```
                          ┌─────────────────────────┐
                          │   Browser (React App)    │
                          │   React 19 + Leaflet     │
                          │   + Zustand State         │
                          └────────┬────────────────┘
                                   │
                          ┌────────▼────────────────┐
                          │   Vite Dev Server        │
                          │   Proxy /api/geoserver/* │
                          └────────┬────────────────┘
                                   │
                          ┌────────▼────────────────┐
                          │   GeoServer (EC2)        │
                          │   13.58.149.42:8080      │
                          │   WFS + GeoJSON          │
                          └────────┬────────────────┘
                                   │
                          ┌────────▼────────────────┐
                          │   PostgreSQL/PostGIS     │
                          │   AWS RDS (us-east-2)    │
                          │   Database: POSMGeoserver│
                          └─────────────────────────┘
```

## Target Production Architecture

In production, the GeoServer is locked down so browsers cannot access it directly. All requests go through Lambda proxy functions.

```
Browser (React + Leaflet)
    │
    ▼
AWS Amplify Hosting (S3 + CloudFront)
    │
    ▼
API Gateway + Lambda Functions
    ├── /api/geoserver/*  → Lambda proxy → EC2 GeoServer (VPC-only)
    ├── /api/config/*     → Lambda → DynamoDB (posm-user-configs)
    └── /api/share/*      → Lambda → DynamoDB (posm-shares, TTL auto-delete)
    │
    ▼
Cognito User Pool (authentication)
```

**Security**: GeoServer EC2 security group is locked to only allow the Lambda VPC NAT gateway IP on port 8080. No direct browser access.

## Development Architecture

During development, Vite's proxy handles routing:

| Request Path        | Proxied To                                    |
|---------------------|-----------------------------------------------|
| `/api/geoserver/*`  | `http://13.58.149.42:8080/geoserver/*`        |
| `/api/config/*`     | `http://localhost:8000/api/config/*`           |
| `/api/share/*`      | `http://localhost:8000/api/share/*`            |

- **Auth**: SHA-256 hashed passwords in `localStorage` (no external services needed)
- **Session storage**: `localStorage` (key format: `posm_session_{user}_{workspace}`)
- **Share storage**: `localStorage` (key format: `posm_share_{shareId}`)
- **User/group management**: `localStorage` (keys: `posm_users`, `posm_groups`, `posm_passwords`)

## Application Layers

The codebase is organized into distinct layers with clear dependency rules:

```
┌───────────────────────────────────────────────────────┐
│  Routes (LoginPage, MapPage, AdminPage, SharePage)    │  ← Page-level components
├───────────────────────────────────────────────────────┤
│  Components (Sidebar, Symbology, Filter, Legend, etc) │  ← UI components
├───────────────────────────────────────────────────────┤
│  Hooks (useLayers, useFilters, useSession)            │  ← React hooks bridging
│                                                        │     store ↔ Leaflet
├───────────────────────────────────────────────────────┤
│  Store (Zustand) + Leaflet Registry                   │  ← State management
├───────────────────────────────────────────────────────┤
│  Lib (geoserver, symbology, classify, markers, etc)   │  ← Pure logic (no React)
├───────────────────────────────────────────────────────┤
│  Types + Config                                        │  ← TypeScript interfaces
│                                                        │     + constants
└───────────────────────────────────────────────────────┘
```

**Dependency rules:**
- `lib/` modules have **zero React imports** — they are pure TypeScript functions
- `types/` and `config/` are leaf dependencies (imported by everything, import nothing from the app)
- `hooks/` bridge the gap between React components and imperative Leaflet operations
- `components/` read from the Zustand store and call hooks; they never call `lib/` functions directly for map mutations
- `routes/` compose components and hooks into full pages

## State Management

The application uses a **dual-store pattern** to separate serializable config from non-serializable Leaflet objects:

### Zustand Store (`src/store/index.ts`)

Holds all **serializable** application state that gets saved/loaded/shared:

| Slice          | Contents                                                    |
|----------------|-------------------------------------------------------------|
| Map state      | `center`, `zoom`, `basemap`                                 |
| Layer state    | `layers` (Record of LayerConfig), `layerOrder`              |
| UI state       | `sidebarOpen`, `filterPanelOpen`, `loading`, `loadingMessage` |
| Symbology UI   | `activeSymbologyLayer`, `activeSymbologyMode`               |
| Session        | `currentWorkspace`, `workspaces[]`, `bookmarks[]`           |

Components subscribe to specific slices using Zustand's selector pattern to minimize re-renders:

```typescript
const basemap = useStore((s) => s.basemap);  // only re-renders on basemap change
```

### Leaflet Registry (`src/store/leafletRegistry.ts`)

A plain `Map<string, LeafletLayerRefs>` that holds **non-serializable** Leaflet instances:

```typescript
interface LeafletLayerRefs {
  leafletLayer: L.GeoJSON;             // The GeoJSON layer instance
  clusterGroup: L.MarkerClusterGroup | null;  // Clustering wrapper (points only)
  geojson: GeoJSON.FeatureCollection;  // Raw GeoJSON data
  arrowDecorators: L.Layer[];          // Direction arrows
  labelManager: unknown;               // Label engine state
}
```

This registry is **not reactive** — changes to it do not trigger React re-renders. Components that need to interact with Leaflet layers call `getLayerRefs(name)` imperatively.

### Why Two Stores?

| Concern          | Zustand Store         | Leaflet Registry      |
|------------------|-----------------------|-----------------------|
| Serializable     | Yes                   | No                    |
| Triggers renders | Yes (selective)       | No                    |
| Persisted        | Yes (save/load)       | No (rebuilt on load)  |
| What it holds    | Config, UI state      | Leaflet instances     |

## Data Flow

### Layer Discovery and Loading

```
1. MapPage mounts
   │
2. getUserWorkspaces(user) → workspace list from auth groups
   │
3. useLayers.loadAllLayers(workspaces)
   │
   ├─ 4. discoverLayers(workspaces)
   │     └─ WFS GetCapabilities XML → GeoServerLayer[]
   │
   ├─ 5. Promise.allSettled(fetchLayerGeoJSON(each layer))
   │     └─ WFS GetFeature → GeoJSON FeatureCollections
   │
   ├─ 6. For each layer:
   │     ├─ Create L.geoJSON with pointToLayer/style
   │     ├─ Optionally wrap in L.markerClusterGroup
   │     ├─ Add to Leaflet map
   │     ├─ Extract fields from features
   │     ├─ Store LayerConfig → Zustand
   │     └─ Store LeafletRefs → Registry
   │
   └─ 7. Return combined bounds → map.fitBounds()
```

### Symbology Application

```
1. User selects layer + mode in SymbologyPanel
   │
2. User configures options (field, ramp, classes, etc.)
   │
3. User clicks "Apply"
   │
4. Component calls applySymbology() from lib/symbology.ts
   │  └─ Dispatches to: applyUniqueValues / applyGraduated /
   │     applyProportional / applyRules
   │     └─ Iterates leafletLayer.eachLayer() to restyle each feature
   │
5. Component calls store.setLayerSymbology(name, config)
   │  └─ Persists the symbology config for save/load/share
   │
6. LegendPanel re-renders (reads updated symbology from store)
```

### Filter Application

```
1. User adds/removes filter in FilterPanel
   │
2. FilterPanel calls store.setLayerFilters(name, filters, mode)
   │
3. FilterPanel calls useFilters.applyFilters(layerName)
   │
   ├─ 4. Build CQL string: "field1 > 5 AND field2 LIKE '%road%'"
   │
   ├─ 5. fetchLayerGeoJSON(layerName, cqlFilter)
   │     └─ WFS GetFeature with CQL_FILTER parameter
   │
   ├─ 6. Remove old Leaflet layer from map
   │
   ├─ 7. Create new L.geoJSON from filtered data
   │
   ├─ 8. Re-apply existing symbology (if any)
   │
   ├─ 9. Re-bind popups
   │
   └─ 10. Update registry + store feature count
```

### Session Save/Load

```
Save (auto, debounced 2s):
  store change → useSession.autoSave() → buildConfigObject() → localStorage

Load (on page load):
  useSession.loadSession(workspace) → localStorage → apply to Zustand store
  │
  ├─ setBasemap, setMapView (center, zoom)
  ├─ setBookmarks
  └─ For each stored layer: setLayerVisibility, setLayerColor,
     setLayerSymbology, setLayerFilters, setLayerLabelField,
     setLayerClustered, setLayerArrows
```

## Component Architecture

### Page Layout (MapPage)

```
┌─────────────────────────────────────────────────────┐
│ App Container (flex row)                             │
│ ┌──────────────┐ ┌────────────────────────────────┐ │
│ │  Sidebar      │ │  Map Container                 │ │
│ │  (resizable)  │ │  (Leaflet L.map)               │ │
│ │               │ │                                 │ │
│ │  ┌──────────┐ │ │                                 │ │
│ │  │ Header   │ │ │                                 │ │
│ │  │ Basemaps │ │ │                                 │ │
│ │  │ Layers   │ │ │                                 │ │
│ │  │ Filters  │ │ │                                 │ │
│ │  │ Symbology│ │ │                                 │ │
│ │  │ Legend   │ │ │                                 │ │
│ │  │ Bookmarks│ │ │                                 │ │
│ │  └──────────┘ │ │                                 │ │
│ └──────────────┘ └────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Sidebar Sections

| Section    | Component          | Description                              |
|------------|--------------------|------------------------------------------|
| Header     | (inline in Sidebar)| POSM GIS title, share button, user, logout |
| Basemaps   | (inline in Sidebar)| Street / Satellite / Dark toggle buttons |
| Layers     | LayerPanel         | Searchable layer list with per-layer controls |
| Filters    | FilterPanel        | CQL filter builder with AND/OR mode      |
| Symbology  | SymbologyPanel     | Mode selector + mode-specific sub-panels |
| Legend     | LegendPanel        | Dynamic legend for all visible layers    |
| Bookmarks  | BookmarkPanel      | Save/restore named map positions         |

## Routing

| Route              | Component   | Auth Required | Description                |
|--------------------|-------------|---------------|----------------------------|
| `/login`           | LoginPage   | No            | Username/password form     |
| `/map`             | MapPage     | Yes           | Main map interface         |
| `/admin`           | AdminPage   | Admin only    | User/group management      |
| `/share/:shareId`  | SharePage   | No            | Public shared map viewer   |
| `/`                | (redirect)  | —             | Redirects to /map or /login |

## Authentication

### Development Mode

Authentication uses `localStorage` for user/group/password storage and `sessionStorage` for the current session. Passwords are hashed with SHA-256 via the Web Crypto API before storage.

```
localStorage:
  posm_users      → AppUser[]         (username, displayName, groups, role)
  posm_groups     → AppGroup[]        (id, label, workspaces)
  posm_passwords  → Record<string, string>  (username → SHA-256 hex hash)

sessionStorage:
  posm_current_user     → AppUser     (current logged-in user)
  posm_selected_workspace → string    (active workspace)
```

### Production Mode (AWS Cognito)

In production, `src/config/auth.ts` will be replaced by AWS Amplify Auth backed by a Cognito User Pool. The `AppUser` interface remains the same — only the auth backend changes.

### Authorization Model

- **Users** belong to one or more **groups**
- **Groups** define which GeoServer **workspaces** are accessible
- A group with `workspaces: ['__ALL__']` grants access to all workspaces
- Only users with `role: 'admin'` can access the `/admin` route

## GeoServer Integration

All GeoServer communication happens through WFS (Web Feature Service):

### Layer Discovery

```
GET /api/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities
```

The response XML is parsed with `DOMParser` to extract layer names. If the workspace is `__ALL__`, a general capabilities request discovers all workspaces first.

### GeoJSON Fetch

```
GET /api/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature
    &typeName={workspace:layerName}
    &outputFormat=application/json
    &srsName=EPSG:4326
    &CQL_FILTER={optional CQL expression}
```

The `CQL_FILTER` parameter enables server-side filtering, so only matching features are transferred.

### Error Handling

GeoServer returns XML error responses even when the request expects JSON. The `fetchLayerGeoJSON` function detects XML responses by checking for `<?xml` or `<ows:ExceptionReport>` prefixes and throws a descriptive error.

## Session Persistence

### What Gets Saved

The `buildConfigObject()` function in `src/lib/configBuilder.ts` snapshots the full Zustand store into a `WorkspaceConfig`:

```typescript
{
  basemap: 'street',
  center: [40.758, -82.515],
  zoom: 14,
  layers: {
    'workspace:layerName': {
      visible: true,
      color: '#ff6384',
      symbology: { mode: 'unique', field: 'TYPE', ... },
      activeFilters: [{ cql: "STATUS = 'active'", label: "STATUS = active" }],
      filterCombineMode: 'AND',
      labelField: 'NAME',
      clustered: true,
      showArrows: false,
      // ... other per-layer config
    }
  },
  bookmarks: [
    { id: 'lz4x8k', name: 'Downtown', center: [41.9, -84.03], zoom: 16 }
  ]
}
```

### Auto-Save

The `useSession` hook subscribes to all Zustand store changes and debounces saves by 2 seconds. This means any UI interaction (pan, zoom, toggle visibility, change symbology) is automatically persisted.

### Storage Keys

| Key Pattern                           | Contents                    |
|---------------------------------------|-----------------------------|
| `posm_session_{username}_{workspace}` | WorkspaceConfig JSON        |
| `posm_share_{shareId}`               | ShareSnapshot JSON          |
| `posm_shares`                        | Array of share IDs (index)  |

## Share System

### Creating a Share

1. User clicks the share button in the sidebar header
2. `ShareModal` builds a config snapshot via `buildConfigObject()`
3. A random 8-character alphanumeric share ID is generated
4. The snapshot is stored in `localStorage` (dev) or DynamoDB (prod)
5. The share URL is displayed: `{origin}/share/{shareId}`
6. User can copy, open, email, WhatsApp, or Teams-share the URL

### Viewing a Share

1. Public user opens `/share/{shareId}` (no auth required)
2. `SharePage` loads the snapshot from storage
3. A full-screen Leaflet map is initialized with saved basemap/center/zoom
4. Each saved layer's GeoJSON is fetched and rendered with saved symbology
5. A floating legend panel shows the combined legend
6. A top banner shows share metadata

### Share Expiry (Production)

In production, DynamoDB shares use a TTL attribute set to 7 days from creation. DynamoDB automatically deletes expired items.

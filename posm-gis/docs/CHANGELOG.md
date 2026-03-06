# POSM GIS — Changelog

All notable changes to the POSM GIS application, organized by release/commit.

---

## [Unreleased] — Color Persistence, Legend Collapse, UX Improvements

### Fixed
- **Symbology color persistence on refresh** — User-edited colors (unique value colors, graduated colors, rule colors) now persist correctly across page reloads. Previously, `applySymbology()` was used during session restore which recomputed colors from scratch, discarding saved edits. Changed all restore paths (MapPage reconciliation, SharePage, useFilters) to use `recolorSymbology()` which applies the exact saved colors without recomputing.
- **Base layer color persistence on refresh** — When no advanced symbology is active, the saved base color is now re-applied to the Leaflet layer via `resetSymbology()` during session restore. Previously, layers always reverted to the default palette color.

### Added
- **Collapsible per-layer legend** — All three legend components (MapLegendControl, ShareLegend, LegendPanel) now support per-layer collapse/expand:
  - Click the layer title row or the chevron arrow to toggle symbology entries
  - Chevron rotates 90 degrees when collapsed (smooth CSS transition)
  - Layer title, swatch, and feature count remain visible when collapsed
  - All layers start expanded by default
  - Collapse state is UI-only (not persisted across reloads)
- **Legend scroll fix** — Mouse wheel scrolling inside the map legend (MapLegendControl) and share legend (ShareLegend) now works correctly. Previously, scroll events propagated to the Leaflet map causing zoom instead of scroll. Fixed using `L.DomEvent.disableScrollPropagation()` via callback refs.
- **DynamoDB documentation** (`docs/dynamodb.md`) — Comprehensive guide covering single-table design, item types, JSON storage convention, Lambda handlers, dev/prod duality, TTL auto-expiry, and CDK definition.
- **GeoServer routing documentation** (`docs/geoserver-routing.md`) — Detailed guide covering Vite dev proxy, production CloudFront chain, WFS protocol usage, workspace discovery, GeoJSON fetching, CQL filtering, and error handling.

### Changed
- **Default map center** — Changed from Adrian, MI (41.897, -84.037) to Mansfield, OH (40.758, -82.515)
- **Default sidebar width** — Increased from 280px to 420px

### Files Changed
| File | Change |
|------|--------|
| `src/routes/MapPage.tsx` | Use `recolorSymbology` instead of `applySymbology` for session restore; add `resetSymbology` else-branch for base color restore |
| `src/routes/SharePage.tsx` | Use `recolorSymbology` instead of `applySymbology` for share restore |
| `src/hooks/useFilters.ts` | Use `recolorSymbology` instead of `applySymbology` when re-applying symbology after filter change |
| `src/components/legend/MapLegendControl.tsx` | Per-layer collapsible legend; scroll propagation fix with `L.DomEvent` |
| `src/components/legend/ShareLegend.tsx` | Per-layer collapsible legend; scroll propagation fix with `L.DomEvent` |
| `src/components/legend/LegendPanel.tsx` | Per-layer collapsible legend in sidebar |
| `src/config/constants.ts` | Default center changed to Mansfield, OH |
| `src/components/sidebar/Sidebar.tsx` | Default sidebar width changed to 420px |
| `docs/dynamodb.md` | **New** — DynamoDB architecture documentation |
| `docs/geoserver-routing.md` | **New** — GeoServer routing documentation |

---

## [Unreleased] — Share View Enhancements

### Added
- **Share view: Labels** — Shared map views now display labels for layers that had labels enabled when the share was created. Uses the same label engine (`labels.ts`) with identical zoom thresholds, viewport culling, chunked rendering, and debounced move/zoom listeners as the main app.
- **Share view: Layer toggle** — Each layer in the share legend now has a checkbox to show/hide the layer on the map. When a layer is hidden, its labels are also removed. The layer entry in the legend dims to 40% opacity.
- **Share view: Marker clustering** — Point layers that had clustering enabled when the share was created now render with `L.MarkerClusterGroup` in the share view, using the same threshold (200 features) and settings (`disableClusteringAtZoom: 20`, `chunkedLoading: true`) as the main app.
- **Mobile legend positioning** — The share legend is raised on mobile to avoid overlap with the browser's bottom navigation bar:
  - `@media (max-width: 768px)`: `bottom: 72px`
  - `@media (max-width: 400px)`: `bottom: 80px`, `max-width: 280px`

### Files Changed
| File | Change |
|------|--------|
| `src/routes/SharePage.tsx` | Added clustering, labels, label move listener, layer toggle handler, `ShareLayerRefs` interface |
| `src/components/legend/ShareLegend.tsx` | Added `hiddenLayers` and `onToggleLayer` props, checkbox per layer, opacity dimming |
| `src/App.css` | Added `.share-legend` mobile media query rules |

---

## [0e3df84] — Labels, Color Picker, Auth DynamoDB Persistence

*Commit: 2026-03-05*

### Added

#### Legend Color Picker (Interactive Symbology Editing)
- **Clickable color swatches in legend** — Every color swatch in the legend (for Unique Values, Graduated, and Rule-Based symbology) is now clickable. Clicking opens a native `<input type="color">` picker.
- **Deferred apply pattern** — Color edits are held as "pending" state per layer. An **OK** button appears when there are pending changes. Clicking OK applies all color changes to the map at once.
- **`recolorSymbology()` function** — New function in `symbology.ts` that applies exact user-edited colors from a modified `SymbologyConfig` to the map without recomputing values/breaks. Handles unique (valueColorMap), graduated (breaks/colors), and rules (rules/defaultColor).
- **`commitSymbology()` helper** — Updates the Zustand store and calls `recolorSymbology()` + `refreshClusterAfterSymbology()` in one step.
- **`ClickableSymSwatch` component** — Reusable swatch with hidden color input and hover highlight effect.

#### DynamoDB Auth Persistence
- **Auth Lambda handler** (`amplify/functions/auth-handler/handler.ts`) — New Lambda function with 4 routes:
  - `GET /api/auth/data` — Returns users and groups from DynamoDB (never returns passwords)
  - `POST /api/auth/data` — Saves users, groups, and/or password hashes to DynamoDB
  - `POST /api/auth/login` — Server-side credential validation, returns user object or 401
  - `POST /api/auth/init` — Seeds default admin user/group/password if DynamoDB is empty
- **DynamoDB schema** — Auth data stored in the existing `posm-gis` table:
  - `PK=AUTH#GLOBAL / SK=AUTH#USERS` → `dataJson: JSON.stringify(AppUser[])`
  - `PK=AUTH#GLOBAL / SK=AUTH#GROUPS` → `dataJson: JSON.stringify(AppGroup[])`
  - `PK=AUTH#GLOBAL / SK=AUTH#PASSWORDS` → `dataJson: JSON.stringify(Record<string, string>)`
- **Dual-mode auth** (`src/config/auth.ts` rewrite):
  - Dev mode (no `VITE_DYNAMO_API_URL`): localStorage only (as before)
  - Prod mode: DynamoDB via Lambda, localStorage as cache
  - `setUsers()`, `setGroups()`, `setUserPassword()`, `removeUserPassword()` are now `async`
  - `login()` tries remote first, falls back to local validation
  - `initAuth()` seeds localStorage then syncs from DynamoDB
  - All remote calls have try/catch with graceful fallback
- **API functions** (`src/lib/api.ts`):
  - `loadAuthData()`, `saveAuthData()`, `remoteLogin()`, `initAuthRemote()`
  - Inlined `AppUser`/`AppGroup` interfaces to avoid circular imports
  - Exported `USE_REMOTE` flag
- **Backend routes** (`amplify/backend.ts`):
  - Added `authFn` NodejsFunction with table read/write access
  - Added API Gateway routes for `/api/auth/data`, `/api/auth/login`, `/api/auth/init`

#### Admin Page Enhancements
- **Self-contained admin login gate** — AdminPage has its own login form that only accepts admin-role users. No longer depends on App.tsx route guards.
- **City/Customer field** — Added `city: string` to `AppUser` interface and admin forms/tables.
- **Workspace checkboxes** — Group workspace assignment now uses checkboxes fetched from GeoServer via `discoverAllWorkspaces()` instead of free-text input.
- **Async save operations** — All `setUsers()`, `setGroups()`, `removeUserPassword()` calls are now awaited.

### Changed
- **`/admin` route** — Changed from guarded route (`user && user.role === 'admin'`) to direct `<AdminPage />` render (AdminPage handles its own auth gate)
- **`LegendPanel.tsx`** — Major rewrite: `LayerLegendBlock` component with pending state, all symbology legend renderers accept `onUpdate` callback, removed unused `LegendEntry` component

### Files Changed
| File | Change Type |
|------|-------------|
| `amplify/functions/auth-handler/handler.ts` | **New** — Auth Lambda |
| `amplify/backend.ts` | Modified — Added auth Lambda + routes |
| `src/lib/api.ts` | Modified — Added auth API functions |
| `src/config/auth.ts` | Rewritten — Dual-mode persistence |
| `src/routes/AdminPage.tsx` | Modified — Login gate, city field, workspace checkboxes |
| `src/App.tsx` | Modified — Simplified `/admin` route |
| `src/components/legend/LegendPanel.tsx` | Rewritten — Clickable swatches, deferred apply |
| `src/lib/symbology.ts` | Modified — Added `recolorSymbology()` |
| `docs/labels-and-symbology.md` | **New** — Technical documentation |

---

## [8bedf5e] — Add Manage Users Button to Login Page

### Added
- **"Manage Users" button** on the login page — Navigates to `/admin` for admin access without requiring login first (AdminPage has its own auth gate).

### Files Changed
| File | Change Type |
|------|-------------|
| `src/routes/LoginPage.tsx` | Modified — Added navigation button |

---

## [38bb392] — Mobile Responsiveness, Symbology Enhancements, Filter/Legend Improvements

### Added
- **Mobile responsive layout** — Full mobile support with hamburger menu, collapsible sidebar, touch-friendly controls
- **Map legend overlay** — Floating legend control on the map (outside sidebar) with collapse/expand
- **Arrow decorators** for line layers — Show flow direction arrows on LineString/MultiLineString layers
- **Age computation** — Compute age from a date field in years or months, displayed as a virtual field
- **Popup configuration** — Per-layer popup customization: field ordering, field visibility, custom title text/field
- **Share system** — Full share implementation with modal (Copy, Open, Email, WhatsApp, Teams buttons), SharePage viewer, ShareLegend component
- **Point symbol selector** — 6 SVG-based symbol types per point layer
- **Layer reordering** — Drag-and-drop layer order in sidebar

### Files Changed
Multiple files across components, hooks, lib, routes, and CSS.

---

## [86aae8c] — Initial Commit

### Added
- Complete POSM GIS application with React 19 + Vite + Zustand 5
- GeoServer WFS integration with workspace discovery
- Leaflet map with clustered point layers
- Four symbology modes (unique, graduated, proportional, rules)
- CQL filter system (server-side)
- Label system with viewport culling and zoom thresholds
- Session persistence to DynamoDB via Lambda
- User authentication with role-based access
- AWS Amplify Gen 2 backend (DynamoDB + Lambda + API Gateway)

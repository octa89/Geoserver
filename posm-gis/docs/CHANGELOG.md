# POSM GIS — Changelog

All notable changes to the POSM GIS application, organized by release/commit.

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

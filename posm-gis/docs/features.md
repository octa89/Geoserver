# Features Reference

Detailed documentation of all POSM GIS features, organized by functional area.

## Table of Contents

- [Workspace Selection](#workspace-selection)
- [Map Interface](#map-interface)
- [Layer Management](#layer-management)
- [Symbology System](#symbology-system)
- [Filter System](#filter-system)
- [Labels](#labels)
- [Popups](#popups)
- [Legend](#legend)
- [Bookmarks](#bookmarks)
- [Session Persistence](#session-persistence)
- [Sharing](#sharing)
- [Admin Panel](#admin-panel)
- [Authentication](#authentication)

---

## Workspace Selection

Workspaces correspond to GeoServer workspaces containing groups of related map layers. Access to workspaces is controlled by user group assignments.

### Workspace Discovery

On login, the app determines which workspaces the user can access:

1. **Admin users** (`__ALL__` access): The app discovers all available workspaces from GeoServer via the REST API (`/geoserver/rest/workspaces.json`), falling back to WFS GetCapabilities parsing if the REST endpoint is unavailable.

2. **Regular users**: Workspaces are resolved from the user's group memberships. Each group maps to specific workspace names.

### Workspace Selection Modal

A modal dialog appears when:
- **Admin users log in** — always shown, with all discovered workspaces in a dropdown
- **Users with multiple workspaces** — shown to let them pick which workspace(s) to load

The modal provides two options:
- **Load Selected**: Load only the workspace chosen in the dropdown
- **Load All Workspaces**: Load layers from all available workspaces simultaneously

When loading multiple workspaces, layer labels are prefixed with the workspace name (e.g., "POSM_GIS: Roads") to avoid name collisions.

### Workspace Bar

After a workspace is loaded, a workspace bar appears in the sidebar header showing the current workspace name. Admin users also see a **Switch** button to re-open the workspace selection modal and switch to a different workspace.

### Switching Workspaces

When switching workspaces:
1. All existing layers are removed from the map
2. The Leaflet registry is cleared
3. The Zustand store's layer state is reset
4. New layers are discovered and fetched from the selected workspace(s)
5. The map fits to the bounds of the new layers
6. The saved session for the new workspace is restored
7. Auto-save is re-initialized for the new workspace

### Single Workspace Auto-Load

Users with exactly one assigned workspace skip the modal entirely — their workspace loads automatically on login.

---

## Map Interface

### Basemap Switching

Three basemaps are available via buttons in the sidebar:

| Basemap    | Provider | Description                |
|------------|----------|----------------------------|
| Street     | OpenStreetMap | Standard road map       |
| Satellite  | Esri World Imagery | Aerial/satellite   |
| Dark       | CARTO Dark Matter | Dark-themed basemap  |

The selected basemap is persisted in the session and restored on page reload.

### Zoom Controls

- Zoom controls are positioned in the **bottom-right** corner
- Maximum zoom: **22** (tiles available up to zoom 19, then overzoomed)
- Default zoom: **14**
- Default center: **40.758, -82.515** (Mansfield, OH — configurable in `src/config/constants.ts`)

### Map Interactions

- **Pan**: Click and drag
- **Zoom**: Scroll wheel, double-click, or zoom buttons
- **Initial view**: After layers load, the map automatically fits bounds to show all layer data with 20px padding

---

## Layer Management

### Layer Discovery

On login, the app automatically discovers all available layers:

1. Reads the user's groups from auth configuration
2. Resolves groups to GeoServer workspace names
3. Sends WFS GetCapabilities request for each workspace
4. Parses XML response to extract layer names and metadata

If a user's group has `workspaces: ['__ALL__']`, a general capabilities request discovers all available workspaces.

### Layer Panel

Located in the sidebar, the layer panel provides:

- **Search**: Text filter to find layers by name (case-insensitive)
- **Visibility toggle**: Checkbox to show/hide each layer on the map
- **Color swatch**: Geometry-aware indicator (circle for points, bar for lines, rectangle for polygons)
- **Feature count**: Number of features in parentheses after the layer name
- **Cluster toggle**: (Points only) Enable/disable marker clustering
- **Label dropdown**: Select a field to display as permanent tooltips on each feature

### Marker Clustering

Point layers with more than **200 features** are automatically wrapped in `L.markerClusterGroup`:

- Clustering disables at zoom level **20** so individual markers appear at maximum zoom
- Chunked loading is enabled for performance with large datasets
- Users can toggle clustering on/off per layer via the layer panel
- When toggled, the Leaflet layer is rebuilt and re-added to the map

### Point Symbols

Six SVG-based point symbols are available:

| Symbol   | Shape                        |
|----------|------------------------------|
| circle   | Filled circle (default)      |
| square   | Filled square                |
| triangle | Filled equilateral triangle  |
| diamond  | Rotated square               |
| star     | 5-pointed star               |
| cross    | Plus symbol                  |

The `circle` symbol uses `L.circleMarker` for efficiency. All others use `L.marker` with a `DivIcon` containing inline SVG.

---

## Symbology System

The symbology panel allows users to style layers using 5 modes. Select a layer from the dropdown, choose a mode, configure options, and click Apply.

### Unique Values

Assigns a distinct color from the 25-color palette to each unique value in a selected field.

**Options:**
- **Field**: Any field from the layer's feature properties
- **Group by Year**: When enabled, date values are collapsed to their 4-digit year before coloring. All dates in the same year share a color.

**Sorting:**
- Without "Group by Year": Values sorted by frequency (most common first)
- With "Group by Year": Values sorted chronologically

### Graduated (Classified)

Classifies numeric field values into color-coded classes.

**Options:**
- **Field**: Numeric fields only (detected by sampling first 10 features)
- **Method**:
  - **Equal Interval**: Divides the value range into equal-width bins
  - **Quantile**: Each class contains approximately the same number of features
  - **Jenks (Natural Breaks)**: Minimizes within-class variance using the Fisher-Jenks DP algorithm (sampled to 1000 values for performance)
- **Number of classes**: 2 to 10 (slider)
- **Color ramp**: 14 available ramps

**Available Color Ramps:**

| Ramp Name    | Type        |
|-------------|-------------|
| Blues        | Sequential  |
| Reds         | Sequential  |
| Greens       | Sequential  |
| Oranges      | Sequential  |
| Purples      | Sequential  |
| YlOrRd       | Sequential  |
| BuGn         | Sequential  |
| RdYlGn       | Diverging   |
| RdBu         | Diverging   |
| Spectral     | Diverging   |
| Viridis      | Perceptual  |
| Inferno      | Perceptual  |
| Plasma       | Perceptual  |
| Turbo        | Perceptual  |

### Proportional (Scaled)

Scales a visual property linearly by a numeric field value.

**Options:**
- **Field**: Numeric fields only
- **Min size / Max size**: Range for the scaled property (default: 4 / 30)
- **Color**: Fixed color for all features

**Behavior by geometry type:**
- **Points**: Scales the marker radius between min and max size
- **Lines**: Scales the stroke weight
- **Polygons**: Scales fill opacity between 0.1 and 0.8

### Rule-Based

Tests each feature against an ordered list of user-defined rules. The first matching rule determines the feature's color.

**Rule definition:**
- **Field**: Any field
- **Operator**: `=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`, `IS NULL`, `IS NOT NULL`
- **Value**: Comparison value (hidden for IS NULL / IS NOT NULL)
- **Color**: Color for matching features

Unmatched features use the **default color**.

The `LIKE` operator uses SQL LIKE pattern matching (`%` = any chars, `_` = single char).

### Reset to Default

Resets all features in a layer to their default style (solid color based on geometry type) and clears the stored symbology configuration.

---

## Filter System

Filters are applied **server-side** via GeoServer CQL (Common Query Language). This means filtered-out features are never transferred to the browser, improving performance for large datasets.

### Adding Filters

1. Select a layer from the filter panel dropdown
2. Choose a field, operator, and value
3. Click "Add" (or press Enter)

**Available operators:**

| Operator     | Description              | Example CQL              |
|-------------|--------------------------|--------------------------|
| `=`         | Exact match              | `STATUS = 'active'`      |
| `!=`        | Not equal                | `TYPE != 'road'`         |
| `>`         | Greater than             | `LENGTH > 100`           |
| `<`         | Less than                | `POP < 5000`             |
| `>=`        | Greater or equal         | `YEAR >= 2020`           |
| `<=`        | Less or equal            | `SCORE <= 3.5`           |
| `LIKE`      | Pattern match            | `NAME LIKE '%Main%'`     |
| `IS NULL`   | Field is null            | `EMAIL IS NULL`          |
| `IS NOT NULL`| Field is not null       | `PHONE IS NOT NULL`      |

### Combine Mode

Multiple filters on the same layer can be combined with:
- **AND**: All filters must match (intersection)
- **OR**: Any filter can match (union)

Toggle between AND/OR using the mode buttons in the filter panel.

### Active Filters

Applied filters appear as removable chips below the filter form. Click the X button to remove a filter. When filters change, the layer is automatically re-fetched from GeoServer with the updated CQL filter.

### What Happens on Filter Change

1. CQL filter string is built from all active filters
2. Layer GeoJSON is re-fetched from GeoServer with `CQL_FILTER` parameter
3. Old Leaflet layer is removed from the map
4. New layer is created from filtered data
5. Existing symbology is re-applied
6. Popups are re-bound
7. Feature count is updated in the store

---

## Labels

Labels display a selected field's value as permanent tooltips on map features.

### How to Enable

Select a field from the label dropdown in the layer panel for any layer.

### Label Behavior

- **Points**: Labels appear above the marker
- **Lines**: Labels appear at the geographic midpoint of each line, rotated to follow the line's angle
- **Polygons**: Labels appear at the polygon's center

### Performance

The label engine uses **viewport culling** with RAF (requestAnimationFrame) chunking:
- Only labels within the current map viewport (with 20% padding) are rendered
- Labels are added/removed in batches of 50 per animation frame to avoid UI jank
- Labels automatically update on map pan/zoom (debounced 80ms)

### Zoom Threshold

Labels have a minimum zoom level based on feature count (from `computeLabelMinZoom()`):

| Feature Count | Min Zoom |
|---------------|----------|
| < 30          | 15       |
| < 100         | 16       |
| < 500         | 17       |
| < 2,000       | 18       |
| >= 2,000      | 19       |

These thresholds apply to both the main app and the share view.

---

## Popups

Clicking any feature on the map opens a styled popup showing the feature's properties.

### Popup Content

- Properties are displayed in a dark-themed HTML table
- **Images**: URLs ending in `.jpg`, `.png`, `.gif`, `.webp`, `.svg` are rendered as `<img>` tags
- **URLs**: HTTP(S) links are rendered as clickable `<a>` tags (open in new tab)
- **Text**: All other values are HTML-escaped for XSS safety

### Field Ordering

Fields are sorted using `smartSortFields()`:
1. Image URLs first (most visual impact)
2. Non-image URLs second
3. All other fields alphabetically

### Popup Styling

Popups use the `posm-popup` CSS class with the app's dark theme:
- Background: `#1a1a2e`
- Text: `#e0e0e0`
- Header color: `#42d4f4`
- Border: `rgba(66,212,244,0.3)`

---

## Legend

The legend panel automatically updates to reflect the current symbology of all visible layers.

### Legend Types by Symbology Mode

| Mode          | Legend Display                                    |
|---------------|---------------------------------------------------|
| Unique Values | Color swatch + value label for each unique value  |
| Graduated     | Color swatch + range label (e.g., "10.0 - 25.5") |
| Proportional  | Min/max size circles + field name                 |
| Rules         | Color swatch + rule description for each rule     |
| No symbology  | Single swatch with layer color + layer name       |

### Behavior

- Only visible layers appear in the legend
- Layers are listed in reverse layer order (top layer first)
- The legend updates reactively when symbology or visibility changes

### Interactive Color Editing

Every color swatch in the legend (for Unique Values, Graduated, and Rule-Based symbology) is clickable. Clicking opens a native color picker.

**Deferred Apply Pattern:**
1. User clicks a swatch → native `<input type="color">` opens
2. Color changes are held as "pending" state per layer (not yet applied to the map)
3. An **OK** button appears below the layer's legend entries
4. Clicking OK applies all pending color edits to the map at once via `recolorSymbology()`
5. If the user changes symbology from the symbology panel, pending edits are discarded

**Technical Details:**
- `ClickableSymSwatch` component: hidden color input with hover highlight
- `commitSymbology()` helper: updates Zustand store + calls `recolorSymbology()` + `refreshClusterAfterSymbology()`
- `recolorSymbology()` in `symbology.ts`: applies exact colors from a `SymbologyConfig` without recomputing values/breaks — distinct from `applySymbology()` which recomputes everything

**Layers without symbology:** The single-color swatch is also clickable and applies immediately (no OK button needed) via `resetSymbology()` with the new color.

---

## Bookmarks

Bookmarks save named map positions (center + zoom level) for quick navigation.

### Creating a Bookmark

1. Navigate the map to the desired position
2. Click "Save Bookmark" in the bookmark panel
3. Enter a name in the inline text input
4. Press Enter or click the save button

### Using a Bookmark

Click the **Go** button next to any bookmark to fly the map to that position. The map uses `flyTo()` with a 1.2-second animation duration.

### Deleting a Bookmark

Click the **X** button next to any bookmark to remove it.

### Persistence

Bookmarks are stored as part of the session config and auto-saved with all other state.

---

## Session Persistence

### Auto-Save

Every change to the application state is automatically saved after a **2-second debounce**. This includes:
- Map position (center, zoom)
- Basemap selection
- Layer visibility, symbology, filters, labels, clustering
- Bookmarks

### Manual Behavior

There is no manual save button — saving is fully automatic.

### Storage

| Environment | Storage                                          |
|-------------|--------------------------------------------------|
| Development | `localStorage` (key: `posm_session_{user}_{ws}`) |
| Production  | DynamoDB via `/api/config` Lambda endpoint       |

### Session Restore

When the map page loads:
1. Layers are discovered and loaded from GeoServer
2. The saved session is loaded from storage
3. Map state (center, zoom, basemap) is restored
4. Per-layer config (symbology, filters, labels, etc.) is applied to each layer
5. Bookmarks are restored

---

## Sharing

### Creating a Share

1. Click the share icon in the sidebar header
2. The current map state is captured as a snapshot
3. A unique share URL is generated
4. The share modal provides options:

| Action       | Description                              |
|-------------|------------------------------------------|
| **Copy**    | Copies URL to clipboard with "Copied!" feedback |
| **Open**    | Opens the share URL in a new browser tab |
| **Email**   | Opens default email client with pre-filled subject and body |
| **WhatsApp**| Opens WhatsApp web with the share URL    |
| **Teams**   | Opens Microsoft Teams with the share URL |

### What Gets Shared

The share snapshot includes:
- Basemap, center, zoom
- All visible layers with their symbology, filters, and styling
- The share is a **frozen snapshot** — changes after sharing don't affect the shared view

### Shared Map Viewer (`/share/:shareId`)

The public viewer:
- Requires **no authentication**
- Shows a full-screen Leaflet map with no sidebar
- Applies saved basemap, center, zoom
- Fetches and renders each layer with saved symbology
- Displays a floating legend panel in the bottom-left
- Shows a banner with share metadata at the top
- Shows an error screen if the share ID is invalid or expired

#### Share View: Labels

If a layer had a `labelField` set when the share was created, labels are displayed in the share view using the same label engine as the main app:
- Same zoom thresholds based on feature count (`computeLabelMinZoom()`)
- Same viewport culling, chunked rendering (50 labels/frame), and debounced move/zoom listener (80ms)
- Labels are hidden when their parent layer is toggled off
- The `initLabelMoveListener()` function manages all labeled layers' visibility and viewport reconciliation

#### Share View: Layer Toggle

Each layer in the share legend has a checkbox to show/hide the layer:
- Toggling a layer removes it from (or adds it back to) the Leaflet map
- When a layer is hidden, its labels are also removed from the map
- The legend entry dims to 40% opacity when the layer is hidden
- Toggle state is local to the viewer session (not persisted)
- Handles both clustered layers (`clusterGroup`) and non-clustered layers (`leafletLayer`)

#### Share View: Marker Clustering

Point layers that had clustering enabled (`clustered: true` in `PerLayerConfig`) are rendered with `L.MarkerClusterGroup` in the share view:
- Same threshold as the main app: clustering only applied when feature count exceeds **200**
- `disableClusteringAtZoom: 20` — individual markers appear at maximum zoom
- `chunkedLoading: true` — non-blocking cluster computation
- Clustered layers are toggled as a unit (the cluster group is added/removed, not the raw GeoJSON layer)

#### Share View: Popups

Popups in the share view are read-only and respect saved popup configuration:
- Custom title text/field
- Field ordering and hidden fields
- Image and URL rendering
- No configuration gear button (read-only)

#### Share View: Mobile Layout

The share legend is raised on mobile devices to avoid overlap with the browser's bottom navigation bar:

| Screen Width | Legend `bottom` | Additional |
|-------------|----------------|------------|
| Desktop (>768px) | `32px` | Default |
| Mobile (≤768px) | `72px` | Raised above browser bar |
| Small mobile (≤400px) | `80px` | `max-width: 280px` |

### Share Expiry

| Environment | Expiry                                           |
|-------------|--------------------------------------------------|
| Development | No auto-expiry (stays in localStorage)           |
| Production  | DynamoDB TTL: 7 days from creation (auto-delete) |

---

## Admin Panel

Accessible at `/admin`. The admin page has its own built-in login gate — it shows a login form that only accepts users with `role: 'admin'`. This means:
- The `/admin` route does **not** require being logged in to the main app first
- A "Manage Users" button on the login page links directly to `/admin`
- Non-admin users cannot access the admin panel even if they know the URL

### User Management

| Field        | Description                                |
|--------------|--------------------------------------------|
| Username     | Unique identifier (read-only when editing) |
| Display Name | Shown in the sidebar header                |
| City/Customer | City or customer name for the user        |
| Password     | SHA-256 hashed before storage              |
| Role         | `admin` or `user`                          |
| Groups       | One or more group memberships (checkboxes) |

**Restrictions:**
- Cannot delete your own account
- Password is required when creating a user, optional when editing (leave blank to keep current)
- The admin user that ships with the app (`admin` / `POSMRocksGISCentral2026`) cannot be removed from the default setup

### Group Management

| Field      | Description                                    |
|------------|------------------------------------------------|
| Group ID   | Unique identifier (read-only when editing)     |
| Label      | Human-readable group name                      |
| Workspaces | Checkboxes populated from GeoServer workspace discovery (`discoverAllWorkspaces()`). Select `__ALL__` for full access. |

### Data Persistence

User and group data is persisted to DynamoDB in production mode (when `VITE_DYNAMO_API_URL` is set):

| Data | DynamoDB Key | Storage Pattern |
|------|-------------|-----------------|
| Users | `PK=AUTH#GLOBAL / SK=AUTH#USERS` | `dataJson: JSON.stringify(AppUser[])` |
| Groups | `PK=AUTH#GLOBAL / SK=AUTH#GROUPS` | `dataJson: JSON.stringify(AppGroup[])` |
| Passwords | `PK=AUTH#GLOBAL / SK=AUTH#PASSWORDS` | `dataJson: JSON.stringify(Record<string, string>)` |

- **localStorage is used as a cache** — reads are synchronous from localStorage, writes go to both localStorage and DynamoDB
- **Passwords are never returned to the client** — the `GET /api/auth/data` endpoint only returns users and groups
- **Login validation happens server-side** — client sends SHA-256 hash to Lambda, which compares against stored hashes
- **Graceful fallback** — if DynamoDB is unreachable, all operations fall back to localStorage silently

---

## Authentication

### Login Flow

**Dev mode (no `VITE_DYNAMO_API_URL`):**
1. Navigate to `/login` (or get redirected there)
2. Enter username and password
3. Password is SHA-256 hashed client-side
4. Hash is compared against localStorage-stored hash
5. On success, the user object is stored in `sessionStorage`

**Prod mode (`VITE_DYNAMO_API_URL` set):**
1. Navigate to `/login`
2. Enter username and password
3. Password is SHA-256 hashed client-side
4. Hash is sent to `POST /api/auth/login` Lambda endpoint
5. Lambda validates against DynamoDB-stored hash
6. On success: returns `AppUser` object, stored in `sessionStorage`
7. On failure: falls back to local validation (in case Lambda not deployed)

### Logout

1. Click "Logout" in the sidebar header (or admin page)
2. Session storage is cleared (`posm_current_user`, `posm_selected_workspace`)
3. User is redirected to `/login`

### Route Protection

| Route    | Requirement          | Redirect/Gate |
|----------|---------------------|---------------|
| `/map`   | Authenticated user  | Redirect to `/login` |
| `/admin` | None (public route) | AdminPage shows its own admin login form |
| `/share` | None (public)       | — |
| `/login` | None (public)       | — |

### Default Admin Account

The application ships with one admin user. On first load, `initAuth()` creates:
- **User**: admin (role: admin, group: all_access, city: '')
- **Group**: all_access (workspaces: `__ALL__`)
- **Password**: POSMRocksGISCentral2026

In production mode, `initAuth()` also calls `POST /api/auth/init` to seed the default admin in DynamoDB if the table is empty.

Additional users and groups can be created via the admin panel.

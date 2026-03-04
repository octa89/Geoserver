# User Guide

## Login

1. Open `http://localhost:8000` in your browser
2. Select a user from the dropdown
3. Click **Sign In**

Default users:
- **Administrator** - full access to all workspaces
- **POSM User** - access to POSM_GIS workspace
- **Other User** - limited workspace access

## Map Interface

### Sidebar

The sidebar on the left contains all controls. It can be:
- **Collapsed/expanded** using the hamburger button
- **Resized** by dragging the right edge (260px to 600px)

### Basemaps

Three basemap options at the top of the sidebar:
- **Street** - OpenStreetMap (default)
- **Satellite** - Esri World Imagery
- **Dark** - CartoDB Dark Matter

Click a button to switch basemaps.

### Workspace Switching

If your account has access to multiple workspaces:
- A workspace bar appears below the header
- Click **Switch** to change workspaces
- Layers reload when switching

---

## Layers

### Layer List

All discovered layers are shown with:
- **Checkbox** - toggle visibility on/off
- **Color swatch** - shows current symbology
- **Name** - layer display name
- **Count** - number of features in parentheses

### Layer Search

Click **Filter** in the Layers header to show the search bar. Type to filter layers by name.

### Cluster Toggle (Point Layers)

Point layers show a cluster icon button. Click to toggle marker clustering on/off. Clustering groups nearby points at lower zoom levels.

### Labels

Each layer has a small dropdown to select a label field:
- Select a field to display labels on features
- Select **No labels** to remove them
- Labels automatically show/hide based on zoom level:
  - Few features: labels appear at zoom 14+
  - Many features: labels only appear at zoom 16-18
- Labels disappear when the layer is toggled off
- Styled with yellow text and dark halo for readability
- **Performance**: Only labels for features visible on screen are rendered. Panning and zooming incrementally updates labels at viewport edges rather than rebuilding all labels. This keeps the map responsive even on layers with thousands of features.

---

## Symbology

### Selecting a Layer

Choose a layer from the **Symbology** dropdown to configure its appearance.

### Symbology Modes

A grid lets you choose between five modes:

#### Unique Values
- Select any attribute field
- Each distinct value gets a unique color from the palette
- Colors are sorted by frequency (most common first)
- **Date fields**: When a date field is selected, a **Group by Year** checkbox appears (checked by default). This extracts the year from each date value, groups features by year (sorted chronologically), assigns a unique color per year, and automatically applies year labels to the map

#### Graduated
- Select a **numeric** field
- Choose a classification method:
  - **Equal Interval** - equal-width value ranges
  - **Quantile** - equal feature count per class
  - **Jenks (Natural Breaks)** - minimizes variance within classes
- Set number of classes (3-8)
- Pick a color ramp from 14 options
- Click **Apply** to render

#### Proportional
- Select a **numeric** field
- Set min and max symbol sizes
- Feature size scales linearly with the field value
- Points: radius varies; Lines: stroke width varies; Polygons: opacity varies
- Click **Apply** to render

#### Rule-Based
- Click **+ Add Rule** to create conditions
- Each rule has: Field, Operator, Value, and Color
- Supported operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`, `IS NULL`, `IS NOT NULL`
- First matching rule wins (order matters)
- Unmatched features get the default color
- Click **Apply** to render

#### Age
- Select a **date** field (e.g., install date, inspection date)
- Choose a unit: **Years** or **Months**
- Choose a classification method (Equal Interval, Quantile, Jenks)
- Set number of classes (3-8) and pick a color ramp
- Optionally check **Label features by age** to display age values on the map
- Click **Apply** to compute the age of each feature and color by age
- Click **Remove Age** to clear the computed age field and reset styling

### Point Symbols

For point layers, a **Symbol** dropdown appears:
- Circle, Square, Triangle, Diamond, Star, Cross

### Line Arrows

For line layers, a **Show arrowheads** checkbox appears to display directional arrows.

### Reset

Click **Reset to Default Style** to clear all symbology and return to the default appearance.

### Legend

The Legend section updates automatically when symbology is applied, showing the color/size mapping.

---

## Attribute Filters

### Opening the Filter Panel

Click the **Filter** button in the Layers section header to open the filter panel.

### Creating a Filter

1. Select a **Layer**
2. Select a **Field** (autocomplete suggestions appear as you type values)
3. Select an **Operator**
4. Enter a **Value** (or select from suggestions)
5. Click **Apply Filter**

### Operators

| Operator | Description |
|----------|-------------|
| `=` | Exact match |
| `!=` | Not equal |
| `>` `<` `>=` `<=` | Numeric comparison |
| `CONTAINS` | Case-insensitive substring match |
| `LIKE` | Pattern match (use `%` as wildcard) |
| `ILIKE` | Case-insensitive pattern match |
| `IS NULL` | Field has no value |
| `IS NOT NULL` | Field has a value |
| `BETWEEN` | Value range (shows two inputs) |

### Date Fields

Date fields are auto-detected. When selected:
- The value input switches to a **calendar date picker**
- The `BETWEEN` operator shows two date pickers (from/to)

### Multiple Filters

You can stack multiple filters on the same layer:
- After applying a filter, select another field and apply again
- Choose **AND** or **OR** to combine filters
- Each active filter appears as a badge that can be individually removed

### Clearing Filters

- Click the **x** on individual filter badges to remove one
- Click **Clear Filter** to remove all filters from the selected layer

---

## Popups

Click on any feature to see its attributes in a popup.

### Smart Field Ordering

By default, fields are ordered with the most useful information first:
1. **Image URL fields** — shown at the top as inline thumbnails
2. **Link URL fields** — shown next as clickable hyperlinks
3. **All other fields** — alphabetical order

### Configuring Popup Fields

Click the **gear icon** (⚙) in the popup header to customize which fields appear and in what order:
- **Drag** rows up/down to reorder fields
- **Uncheck** the checkbox to hide a field from the popup
- Click **Reset to Default** to restore the smart ordering
- Click **Done** to save your configuration

Field configuration is saved per layer and persists across sessions.

### Special Value Handling

- **URLs** are displayed as clickable hyperlinks
- **Image URLs** (`.jpg`, `.png`, `.gif`, `.webp`, `.svg`, `.bmp`, `.tiff`, `.avif`) are displayed as inline images in the popup

---

## Keyboard & Navigation

- **Zoom**: Mouse scroll or zoom buttons (bottom-right)
- **Pan**: Click and drag the map
- **Zoom control**: Located at the bottom-right corner

---

## Bookmarks

Save named map locations to quickly jump back to them later.

### Adding a Bookmark

1. Navigate to the desired map position and zoom level
2. In the **Bookmarks** sidebar section, enter a name
3. Click **+ Add**

### Using Bookmarks

- Click any bookmark name to fly to that saved location
- The zoom level badge shows the saved zoom
- Click **x** to delete a bookmark

Bookmarks persist across sessions.

---

## Sharing a Map View

Share the current map state (filters, symbology, labels, view position) with anyone via a read-only link. No login required for recipients.

### Creating a Share Link

1. Set up the map as desired (filters, symbology, labels, basemap, zoom)
2. Click the **link icon** (&#128279;) in the sidebar header
3. A share modal appears with the generated URL

### Share Modal Options

| Action | Description |
|--------|-------------|
| **Copy** | One-click copy URL to clipboard (shows "Copied!" confirmation) |
| **Open** | Opens the shared map in a new browser tab |
| **Email** | Opens your email client with the link pre-filled |
| **WhatsApp** | Opens WhatsApp share dialog with the link |
| **Teams** | Opens Microsoft Teams share dialog |

You can also click the URL field to select all text manually.

Close the modal by clicking **Close**, clicking outside it, or pressing **Escape**.

### What Gets Shared

The share link captures a complete snapshot:
- Map center and zoom level
- Active basemap
- Layer visibility
- All active filters (CQL expressions)
- Symbology (unique values, graduated, proportional, rules)
- Labels and arrow decorators
- Popup configuration
- Age calculator settings

### Shared View

Recipients see a simplified read-only interface:
- Full-screen map with the same styling and filters
- Top bar showing "SHARED VIEW" badge and workspace name
- Leaflet layer control (top-right) to toggle layers
- Combined legend (bottom-left) showing all layer symbology
- Clickable features with read-only popups

### Share Link Expiry

Share links expire automatically after **7 days**. Expired links show a "Share not found or expired" message.

---

## Saving Settings

Click the **Save Settings** button at the bottom of the sidebar to persist all current settings (symbology, filters, labels, visibility, popup config, age config, map position, basemap, bookmarks) to the server. Settings are also auto-saved on most changes. On next login, your session is automatically restored.

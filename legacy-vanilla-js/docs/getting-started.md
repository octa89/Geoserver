# Getting Started

## Prerequisites

- Python 3.8+
- A running GeoServer instance with WFS enabled
- PostgreSQL/PostGIS database (for data import)

## Installation

### 1. Python Dependencies

```bash
pip install psycopg2-binary geopandas shapely sqlalchemy fiona
```

### 2. Start the Local Server

```bash
python serve_map.py
```

This starts a local HTTP server on port 8000 that:
- Serves the frontend files from `/frontend`
- Proxies `/geoserver/` requests to the configured GeoServer instance

### 3. Open the Application

Navigate to `http://localhost:8000` in your browser.

## Configuration

### GeoServer URL

Edit `frontend/js/config.js` to change the GeoServer endpoint:

```javascript
POSM.CONFIG = {
    GEOSERVER_URL: '/geoserver',  // proxied through serve_map.py
    // ...
};
```

The proxy target is configured in `serve_map.py`:

```python
GEOSERVER_URL = 'http://13.58.149.42:8080/geoserver'
```

### Default Map Center

Edit `frontend/js/map.js` to change the initial map position:

```javascript
POSM.map = L.map('map', { center: [41.897, -84.037], zoom: 14 });
```

### Users and Groups

Default demo users are defined in `frontend/js/auth.js`. For custom users:
1. Log in as admin
2. Navigate to `admin.html`
3. Create groups with workspace assignments
4. Create users assigned to groups

## Data Import

### Import Esri File Geodatabase (.gdb)

```bash
python import_gdb.py
```

Interactive prompts will guide you through:
1. Path to .gdb folder
2. Database connection test
3. Layer selection
4. Optional CRS reprojection
5. Import execution with progress reporting

### Check CRS of a GIS File

```bash
python check_crs.py
```

Enter the path to a .gdb file to inspect coordinate reference systems, feature counts, and bounds for each layer.

### Test Database Connection

```bash
python postgres.py
```

Lists all spatial tables in the PostGIS database.

## Accessing the Map Viewer

1. **Login** at `http://localhost:8000` - select a user from the dropdown
2. **Workspace selection** - if your user has multiple workspaces, choose one or load all
3. **Map viewer** loads with all available layers checked on by default
4. Use the sidebar to manage layers, apply symbology, and filter data

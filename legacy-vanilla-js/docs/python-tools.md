# Python Tools

## serve_map.py - Local Development Server

HTTP server that serves the frontend and proxies GeoServer requests.

### Usage

```bash
python serve_map.py
```

Access at `http://localhost:8000`

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GEOSERVER_URL` | `http://13.58.149.42:8080/geoserver` | Target GeoServer instance |
| Port | `8000` | Local server port |

### How It Works

- Requests to `/geoserver/*` are proxied to the actual GeoServer
- All other requests serve files from the `frontend/` directory
- CORS headers are added to all responses
- Handles HTTP errors and timeouts

---

## postgres.py - Database Connectivity Test

Tests connection to the PostGIS database and lists spatial tables.

### Usage

```bash
pip install psycopg2-binary
python postgres.py
```

### Output

Displays:
- PostgreSQL version
- All spatial tables with schema, table name, geometry column, geometry type, and SRID
- Full list of database tables

### Connection Details

| Parameter | Value |
|-----------|-------|
| Host | `posmgeoserver.cj9ocfmsdigb.us-east-2.rds.amazonaws.com` |
| Database | `POSMGeoserver` |
| Port | 5432 |

**Note**: Credentials are hardcoded. Migrate to environment variables for production use.

---

## import_gdb.py - Geodatabase Importer

Interactive tool to import Esri File Geodatabase (.gdb) layers into PostGIS.

### Usage

```bash
pip install geopandas shapely sqlalchemy fiona
python import_gdb.py
```

### Import Process

1. **Enter .gdb path** - validates the folder exists and has .gdb extension
2. **Database connection test** - verifies PostgreSQL and PostGIS availability
3. **Layer listing** - shows all layers with feature counts
4. **Layer selection** - choose specific layers or "all"
5. **CRS selection** - optionally reproject to a target EPSG code
6. **Import execution** - imports with progress and error handling

### Data Cleaning

The importer automatically handles:

| Issue | Action |
|-------|--------|
| Null/empty geometries | Removed (count reported) |
| Invalid geometries | Fixed with `make_valid()` |
| Special characters in column names | Sanitized to lowercase alphanumeric |
| Mixed-type columns | Converted to strings |
| Single geometries | Promoted to Multi* types for PostGIS consistency |

### Import Settings

- Chunk size: 500 features per batch
- Table creation: replaces existing tables (`if_exists='replace'`)
- Geometry column: `geometry`

### Summary Report

After import, displays:
- Number of layers successfully imported
- Number of layers skipped (empty)
- Number of layers that failed (with error details)

---

## check_crs.py - CRS Inspector

Inspects coordinate reference systems in GIS data files.

### Usage

```bash
pip install fiona
python check_crs.py
```

### Output Per Layer

- Layer name
- Feature count
- CRS (Coordinate Reference System)
- CRS WKT (Well-Known Text)
- Spatial bounds

### Use Case

Run before importing data to verify the source CRS and decide if reprojection is needed.

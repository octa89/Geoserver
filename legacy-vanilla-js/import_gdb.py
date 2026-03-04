import os
import sys
import warnings
import fiona
import geopandas as gpd
import pandas as pd
from shapely.geometry import MultiPoint, MultiLineString, MultiPolygon
from shapely.validation import make_valid
from sqlalchemy import create_engine, text

# Suppress the pyogrio OpenFileGDB driver warning
warnings.filterwarnings("ignore", message=".*driver OpenFileGDB does not support open option.*")

# Database configuration (same as postgres.py)
db_host = "posmgeoserver.cj9ocfmsdigb.us-east-2.rds.amazonaws.com"
db_name = "POSMGeoserver"
db_user = "postgres"
db_pass = "POSMGeoServer2026GIS!"
db_port = 5432

DB_URL = f"postgresql+psycopg2://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"


def test_db_connection(engine):
    """Test database connection before starting import."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("Database connection: OK")
    except Exception as e:
        print(f"Database connection FAILED: {e}")
        sys.exit(1)

    # Check that PostGIS extension is available
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT PostGIS_Version()"))
            version = result.scalar()
        print(f"PostGIS version: {version}")
    except Exception:
        print("WARNING: PostGIS extension not found. Attempting to create it...")
        try:
            with engine.connect() as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
                conn.commit()
            print("PostGIS extension created successfully.")
        except Exception as e:
            print(f"ERROR: Could not enable PostGIS: {e}")
            sys.exit(1)


def clean_column_names(gdf):
    """Sanitize column names for PostgreSQL (lowercase, no special chars)."""
    rename_map = {}
    for col in gdf.columns:
        clean = col.lower().replace(" ", "_").replace("-", "_").replace(".", "_")
        # Remove any remaining non-alphanumeric chars except underscores
        clean = "".join(c if c.isalnum() or c == "_" else "_" for c in clean)
        # Avoid starting with a digit
        if clean and clean[0].isdigit():
            clean = f"col_{clean}"
        rename_map[col] = clean
    gdf = gdf.rename(columns=rename_map)

    # Handle duplicate column names after cleaning
    seen = {}
    final_cols = []
    for col in gdf.columns:
        if col in seen:
            seen[col] += 1
            final_cols.append(f"{col}_{seen[col]}")
        else:
            seen[col] = 0
            final_cols.append(col)
    gdf.columns = final_cols

    return gdf


def clean_geometries(gdf):
    """Fix null, empty, and invalid geometries."""
    original_count = len(gdf)

    # Drop rows where geometry is completely null/NaN
    gdf = gdf[gdf.geometry.notna()].copy()
    null_dropped = original_count - len(gdf)
    if null_dropped > 0:
        print(f"    Dropped {null_dropped} rows with null geometry")

    if gdf.empty:
        return gdf

    # Drop rows with empty geometries
    empty_mask = gdf.geometry.is_empty
    if empty_mask.any():
        count = empty_mask.sum()
        gdf = gdf[~empty_mask].copy()
        print(f"    Dropped {count} rows with empty geometry")

    if gdf.empty:
        return gdf

    # Fix invalid geometries using make_valid
    invalid_mask = ~gdf.geometry.is_valid
    if invalid_mask.any():
        count = invalid_mask.sum()
        print(f"    Fixing {count} invalid geometries with make_valid...")
        gdf.loc[invalid_mask, "geometry"] = gdf.loc[invalid_mask, "geometry"].apply(make_valid)

    return gdf


def promote_to_multi(gdf):
    """Promote single geometries to multi to avoid PostGIS type conflicts."""
    if gdf.empty:
        return gdf

    geom_types = [gt for gt in gdf.geometry.geom_type.unique() if isinstance(gt, str)]

    if not geom_types:
        return gdf

    needs_promotion = any(gt in ("Point", "LineString", "Polygon") for gt in geom_types)

    if needs_promotion:
        def _promote(geom):
            if geom is None:
                return geom
            if geom.geom_type == "Point":
                return MultiPoint([geom])
            if geom.geom_type == "LineString":
                return MultiLineString([geom])
            if geom.geom_type == "Polygon":
                return MultiPolygon([geom])
            return geom

        gdf["geometry"] = gdf.geometry.apply(_promote)

    return gdf


def sanitize_data_types(gdf):
    """Fix column data types that cause issues with PostgreSQL."""
    for col in gdf.columns:
        if col == "geometry":
            continue
        # Convert mixed-type object columns to string
        if gdf[col].dtype == "object":
            gdf[col] = gdf[col].astype(str).replace("None", None).replace("nan", None)
        # Convert datetime with timezone issues
        if pd.api.types.is_datetime64_any_dtype(gdf[col]):
            gdf[col] = pd.to_datetime(gdf[col], errors="coerce")
    return gdf


def import_layer(gdf, layer_name, engine, target_epsg=None):
    """Import a single GeoDataFrame to PostGIS with full error handling."""

    print(f"  Features read: {len(gdf)}")
    print(f"  Original CRS: {gdf.crs}")
    print(f"  Geometry type: {gdf.geometry.geom_type.unique().tolist() if not gdf.empty else 'N/A'}")

    if gdf.empty:
        print("  SKIPPED (empty layer, no features).")
        return False

    # Clean geometries (null, empty, invalid)
    gdf = clean_geometries(gdf)
    if gdf.empty:
        print("  SKIPPED (all geometries were null/empty).")
        return False

    # Reproject if requested
    if target_epsg:
        if gdf.crs is None:
            print(f"  WARNING: Layer has no CRS defined, cannot reproject. Importing as-is.")
        else:
            gdf = gdf.to_crs(epsg=target_epsg)
            print(f"  Reprojected to EPSG:{target_epsg}")

    # Promote to multi geometries
    gdf = promote_to_multi(gdf)

    # Clean column names for PostgreSQL
    gdf = clean_column_names(gdf)

    # Fix problematic data types
    gdf = sanitize_data_types(gdf)

    # Build table name
    table_name = layer_name.lower().replace(" ", "_").replace("-", "_")
    table_name = "".join(c if c.isalnum() or c == "_" else "_" for c in table_name)
    print(f"  Writing to table: {table_name} ({len(gdf)} features)...")

    gdf.to_postgis(
        name=table_name,
        con=engine,
        if_exists="replace",
        index=False,
        chunksize=500,
    )
    print(f"  SUCCESS ({len(gdf)} features written).")
    return True


def main():
    # --- Step 1: Get .gdb path ---
    gdb_path = input("Enter the full path to the .gdb folder: ").strip().strip('"').strip("'")

    if not os.path.exists(gdb_path):
        print(f"Error: path does not exist: {gdb_path}")
        sys.exit(1)

    if not gdb_path.lower().endswith(".gdb"):
        print(f"Warning: path does not end with .gdb — are you sure this is a File Geodatabase?")
        confirm = input("Continue anyway? (y/n): ").strip().lower()
        if confirm != "y":
            sys.exit(0)

    # --- Step 2: Test DB connection ---
    engine = create_engine(DB_URL)
    test_db_connection(engine)

    # --- Step 3: List layers ---
    try:
        layers = fiona.listlayers(gdb_path)
    except Exception as e:
        print(f"Error reading geodatabase: {e}")
        sys.exit(1)

    if not layers:
        print("No layers found in the geodatabase.")
        sys.exit(1)

    print(f"\nFound {len(layers)} layer(s):\n")
    for i, name in enumerate(layers, 1):
        print(f"  {i}. {name}")

    # --- Step 4: Select layers ---
    print("\nEnter layer numbers separated by commas (e.g. 1,3,5)")
    print("Or type 'all' to import every layer.")
    selection = input("Selection: ").strip()

    if selection.lower() == "all":
        selected = layers
    else:
        try:
            indices = [int(x.strip()) for x in selection.split(",")]
            for i in indices:
                if i < 1 or i > len(layers):
                    print(f"Error: layer number {i} is out of range (1-{len(layers)}).")
                    sys.exit(1)
            selected = [layers[i - 1] for i in indices]
        except ValueError:
            print("Invalid input. Please enter numbers separated by commas.")
            sys.exit(1)

    print(f"\nWill import: {', '.join(selected)}")

    # --- Step 5: Target CRS ---
    epsg_input = input(
        "\nTarget EPSG code (e.g. 4326 for WGS84), or press Enter to keep original: "
    ).strip()
    target_epsg = None
    if epsg_input:
        try:
            target_epsg = int(epsg_input)
        except ValueError:
            print("Invalid EPSG code. Must be a number (e.g. 4326).")
            sys.exit(1)

    # --- Step 6: Import each layer ---
    results = {"success": [], "skipped": [], "failed": []}

    for layer_name in selected:
        print(f"\n{'='*50}")
        print(f"  Layer: {layer_name}")
        print(f"{'='*50}")

        try:
            gdf = gpd.read_file(gdb_path, layer=layer_name)
            imported = import_layer(gdf, layer_name, engine, target_epsg)
            if imported:
                results["success"].append(layer_name)
            else:
                results["skipped"].append(layer_name)
        except Exception as e:
            print(f"  FAILED: {e}")
            results["failed"].append((layer_name, str(e)))

    # --- Summary ---
    print(f"\n{'='*50}")
    print("IMPORT SUMMARY")
    print(f"{'='*50}")
    print(f"  Imported: {len(results['success'])} layers")
    for name in results["success"]:
        print(f"    - {name}")
    if results["skipped"]:
        print(f"  Skipped:  {len(results['skipped'])} layers (empty)")
        for name in results["skipped"]:
            print(f"    - {name}")
    if results["failed"]:
        print(f"  Failed:   {len(results['failed'])} layers")
        for name, err in results["failed"]:
            print(f"    - {name}: {err}")
    print()


if __name__ == "__main__":
    main()

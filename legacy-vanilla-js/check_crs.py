import fiona

gdb_path = input("Enter the full path to the .gdb folder: ").strip().strip('"')

layers = fiona.listlayers(gdb_path)
for layer_name in layers:
    try:
        with fiona.open(gdb_path, layer=layer_name) as src:
            crs = src.crs
            count = len(src)
            try:
                bounds = src.bounds
            except Exception:
                bounds = "Could not compute"
            print(f"\n  Layer: {layer_name}")
            print(f"  Features: {count}")
            print(f"  CRS: {crs}")
            print(f"  CRS WKT: {src.crs_wkt[:200] if src.crs_wkt else 'N/A'}...")
            print(f"  Bounds: {bounds}")
    except Exception as e:
        print(f"\n  Layer: {layer_name} - ERROR: {e}")

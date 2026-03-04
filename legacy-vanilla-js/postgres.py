import os
import psycopg2

# Database configuration — use environment variables or a .env file
db_host = os.environ.get("DB_HOST", "your-rds-host.amazonaws.com")
db_name = os.environ.get("DB_NAME", "POSMGeoserver")
db_user = os.environ.get("DB_USER", "postgres")
db_pass = os.environ.get("DB_PASS", "")
db_port = int(os.environ.get("DB_PORT", "5432"))

try:
    connection = psycopg2.connect(
        host=db_host,
        port=db_port,
        database=db_name,
        user=db_user,
        password=db_pass
    )

    print("✅ Connected to the database")

    cursor = connection.cursor()
    cursor.execute("SELECT version();")
    db_version = cursor.fetchone()
    print(f"PostgreSQL version: {db_version[0]}\n")

    # List all spatial layers (tables with a geometry column)
    cursor.execute("""
        SELECT f_table_schema, f_table_name, f_geometry_column, type, srid
        FROM geometry_columns
        ORDER BY f_table_schema, f_table_name;
    """)
    rows = cursor.fetchall()

    if rows:
        print(f"Found {len(rows)} spatial layer(s):\n")
        print(f"  {'Schema':<15} {'Table':<35} {'Geom Column':<20} {'Type':<20} {'SRID'}")
        print(f"  {'-'*15} {'-'*35} {'-'*20} {'-'*20} {'-'*6}")
        for schema, table, geom_col, geom_type, srid in rows:
            print(f"  {schema:<15} {table:<35} {geom_col:<20} {geom_type:<20} {srid}")
    else:
        print("No spatial layers found in the database.")

    # Also list ALL tables in the database (spatial or not)
    print(f"\n--- All tables in the database ---\n")
    cursor.execute("""
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
          AND table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name;
    """)
    tables = cursor.fetchall()
    if tables:
        for schema, table in tables:
            print(f"  {schema:<15} {table}")
    else:
        print("  No tables found.")

    cursor.close()
    connection.close()

except Exception as e:
    print("❌ Error connecting to database:")
    print(e)
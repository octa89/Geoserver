# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This project connects to a remote PostgreSQL/PostGIS database (AWS RDS) that backs a POSM GeoServer instance. The codebase currently consists of a single Python connectivity script.

## Key Details

- **Database**: PostgreSQL with PostGIS on AWS RDS (us-east-2)
- **Database name**: POSMGeoserver
- **Python dependency**: `psycopg2` (PostgreSQL adapter)

## Running

```bash
pip install psycopg2-binary
python postgres.py
```

## Security Note

`postgres.py` contains hardcoded database credentials. These should be migrated to environment variables or a `.env` file (with `python-dotenv`) and the credentials removed from source.

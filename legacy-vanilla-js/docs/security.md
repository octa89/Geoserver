# Security Notes

## Authentication Model

The current authentication system is a **demo/development implementation** using browser localStorage and sessionStorage. It does **not** provide real security.

### How It Works

- Users and groups are stored in `localStorage` (persists across sessions)
- The current user is stored in `sessionStorage` (cleared when browser closes)
- There is **no password validation** - selecting a username logs you in
- The `requireAuth()` guard only checks if a user is set in sessionStorage

### Implications

- Any user can access the application by selecting a username
- There is no server-side authentication
- Workspace access control is enforced client-side only (can be bypassed)
- Suitable only for internal/demo use behind a network firewall

### Recommendations for Production

1. Implement server-side authentication (OAuth 2.0, LDAP, or JWT)
2. Use GeoServer's built-in security for workspace-level access control
3. Add a proper login API endpoint with password hashing
4. Use HTTPS for all connections
5. Set secure, httpOnly cookies instead of localStorage

---

## Database Credentials

### Current State

`postgres.py` and `import_gdb.py` contain **hardcoded database credentials**:

```python
# Example from postgres.py (DO NOT use in production)
host="posmgeoserver.cj9ocfmsdigb.us-east-2.rds.amazonaws.com"
user="..."
password="..."
```

### Recommended Fix

Use environment variables with `python-dotenv`:

```bash
pip install python-dotenv
```

Create a `.env` file (add to `.gitignore`):

```env
DB_HOST=posmgeoserver.cj9ocfmsdigb.us-east-2.rds.amazonaws.com
DB_NAME=POSMGeoserver
DB_USER=your_username
DB_PASSWORD=your_password
DB_PORT=5432
```

Update Python scripts:

```python
from dotenv import load_dotenv
import os

load_dotenv()

conn = psycopg2.connect(
    host=os.getenv('DB_HOST'),
    database=os.getenv('DB_NAME'),
    user=os.getenv('DB_USER'),
    password=os.getenv('DB_PASSWORD'),
    port=os.getenv('DB_PORT', 5432)
)
```

---

## GeoServer Proxy

`serve_map.py` acts as a CORS proxy for development. In production:

1. Configure GeoServer's CORS settings directly
2. Use a reverse proxy (nginx, Apache) instead of the Python proxy
3. Restrict GeoServer access to authorized users
4. Enable HTTPS between all components

---

## Data Exposure

- All WFS layer data is fetched as GeoJSON to the browser
- Full attribute tables are accessible to anyone with map access
- CQL filters are applied server-side but the client can modify them
- Consider GeoServer's data security policies for sensitive spatial data

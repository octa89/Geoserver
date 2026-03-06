# GeoServer Routing

This document describes how POSM GIS routes requests to GeoServer across development and production environments, including the proxy chain, WFS protocol usage, and error handling.

## Table of Contents

- [Overview](#overview)
- [Development Proxy (Vite)](#development-proxy-vite)
- [Production Proxy Chain](#production-proxy-chain)
- [WFS Protocol Usage](#wfs-protocol-usage)
- [Workspace Discovery](#workspace-discovery)
- [GeoJSON Fetching](#geojson-fetching)
- [CQL Server-Side Filtering](#cql-server-side-filtering)
- [Error Handling](#error-handling)
- [Environment Variables](#environment-variables)

---

## Overview

The React app never talks to GeoServer directly. All GeoServer requests go through `/api/geoserver/*`, which is proxied differently depending on the environment:

```
Browser (React App)
    |
    | fetch("/api/geoserver/...")
    |
    +-- DEV:  Vite dev server proxy --> EC2 GeoServer (18.225.234.98:8080)
    |
    +-- PROD: Amplify rewrite --> CloudFront (d1ka5igkln6d3r.cloudfront.net)
                                      --> EC2 GeoServer (18.225.234.98:8080)
```

This abstraction means the client code (`src/lib/geoserver.ts`) uses a single base URL (`VITE_GEOSERVER_BASE`, defaults to `/api/geoserver`) regardless of environment.

---

## Development Proxy (Vite)

In development, the Vite dev server proxies GeoServer requests to avoid CORS issues. Configured in `vite.config.ts`:

```typescript
proxy: {
  '/api/geoserver': {
    target: 'http://18.225.234.98:8080',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/geoserver/, '/geoserver'),
  },
}
```

**Request flow:**
```
Browser: GET /api/geoserver/POSM_GIS/wfs?service=WFS&request=GetCapabilities
    |
    v
Vite proxy strips "/api/geoserver" prefix, rewrites to "/geoserver"
    |
    v
EC2: GET http://18.225.234.98:8080/geoserver/POSM_GIS/wfs?service=WFS&request=GetCapabilities
```

The dev server also proxies two other API paths (for config/share), but those go to `localhost:8000` or the Amplify sandbox, not GeoServer:

| Path | Target | Purpose |
|------|--------|---------|
| `/api/geoserver/*` | `http://18.225.234.98:8080` | GeoServer WFS |
| `/api/config/*` | `http://localhost:8000` | Session config (local Python server or Amplify sandbox) |
| `/api/share/*` | `http://localhost:8000` | Share snapshots |

---

## Production Proxy Chain

In production, requests go through a multi-hop chain:

```
Browser
    |
    | GET /api/geoserver/POSM_GIS/wfs?...
    |
    v
AWS Amplify Hosting (rewrite rule)
    |
    | Rewrites /api/geoserver/* to CloudFront origin
    |
    v
CloudFront (d1ka5igkln6d3r.cloudfront.net)
    |
    | Provides HTTPS termination (avoids mixed-content blocking)
    | Caches responses at edge locations
    |
    v
EC2 GeoServer (18.225.234.98:8080)
    |
    | /geoserver/POSM_GIS/wfs?...
    |
    v
PostgreSQL/PostGIS (AWS RDS, us-east-2)
```

**Why CloudFront?**
- Amplify Hosting serves the React app over HTTPS
- Browsers block mixed content (HTTPS page loading HTTP resources)
- The EC2 GeoServer runs on HTTP (port 8080)
- CloudFront provides HTTPS in front of the HTTP GeoServer, solving the mixed-content issue
- CloudFront also caches WFS responses at edge locations, reducing load on the EC2 instance

---

## WFS Protocol Usage

All GeoServer communication uses the **WFS (Web Feature Service)** protocol. No WMS (raster tiles) is used — all rendering happens client-side in Leaflet.

### Endpoints Used

| Operation | WFS Request | Response Format |
|-----------|-------------|-----------------|
| Layer discovery | `GetCapabilities` | XML |
| Feature data | `GetFeature` | GeoJSON (`application/json`) |

### Base URL Construction

The `GEOSERVER_BASE` is resolved from the environment:

```typescript
const GEOSERVER_BASE = import.meta.env.VITE_GEOSERVER_BASE || '/api/geoserver';
```

Workspace-specific requests include the workspace in the URL path:
- Capabilities: `{GEOSERVER_BASE}/{workspace}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`
- Features: `{GEOSERVER_BASE}/{workspace}/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName={workspace:layer}&outputFormat=application/json&srsName=EPSG:4326`

---

## Workspace Discovery

Two methods are attempted in order:

### 1. REST API (preferred)

```
GET /api/geoserver/rest/workspaces.json
Authorization: Basic {base64(admin:geoserver)}
```

Returns a JSON list of workspace names. Requires GeoServer admin credentials (`VITE_GS_ADMIN_USER` / `VITE_GS_ADMIN_PASS`).

### 2. WFS GetCapabilities (fallback)

```
GET /api/geoserver/wfs?service=WFS&version=1.1.0&request=GetCapabilities
```

Parses the XML response to extract workspace prefixes from `FeatureType` names (e.g., `POSM_GIS:Roads` -> workspace `POSM_GIS`).

### Per-Workspace Layer Discovery

Once workspaces are known, each workspace's layers are discovered via:

```
GET /api/geoserver/{workspace}/wfs?service=WFS&version=1.1.0&request=GetCapabilities
```

The XML response is parsed with `DOMParser` to extract `FeatureType` elements, yielding `{ name, title }` pairs for each layer.

When loading multiple workspaces simultaneously, layer labels are prefixed with the workspace name (e.g., `POSM_GIS: Roads`) to avoid name collisions.

---

## GeoJSON Fetching

Each layer's feature data is fetched as GeoJSON:

```
GET /api/geoserver/{workspace}/wfs
    ?service=WFS
    &version=1.0.0
    &request=GetFeature
    &typeName={workspace:layerName}
    &outputFormat=application/json
    &srsName=EPSG:4326
```

**Key parameters:**
- `version=1.0.0` — Used for GetFeature (better GeoJSON compatibility)
- `outputFormat=application/json` — Returns GeoJSON FeatureCollection
- `srsName=EPSG:4326` — Ensures coordinates are in WGS84 (lat/lng)
- `typeName` — Fully qualified layer name (`workspace:layerName`)

All layers are fetched in parallel using `Promise.allSettled()`, so a single layer failure doesn't block the others.

---

## CQL Server-Side Filtering

When filters are active on a layer, the `CQL_FILTER` parameter is appended to the WFS request:

```
GET /api/geoserver/{workspace}/wfs
    ?service=WFS&version=1.0.0&request=GetFeature
    &typeName={workspace:layer}
    &outputFormat=application/json
    &srsName=EPSG:4326
    &CQL_FILTER=STATUS%20%3D%20%27active%27%20AND%20LENGTH%20%3E%20100
```

CQL (Common Query Language) is GeoServer's filter language. Filters are built client-side from the user's filter definitions:

| User Filter | CQL Expression |
|-------------|----------------|
| `STATUS = active` | `STATUS = 'active'` |
| `LENGTH > 100` | `LENGTH > 100` |
| `NAME LIKE %Main%` | `NAME LIKE '%Main%'` |
| `EMAIL IS NULL` | `EMAIL IS NULL` |

Multiple filters are combined with `AND` or `OR` (user-selectable).

**Why server-side filtering?**
- Only matching features are transferred over the network
- Reduces payload size significantly for large datasets
- GeoServer leverages PostGIS spatial indexes for fast filtering
- The client doesn't need to hold unfiltered data in memory

---

## Error Handling

GeoServer has a quirk: it sometimes returns **HTTP 200 with an XML error body** instead of a proper HTTP error status. The `fetchLayerGeoJSON()` function handles this:

1. Checks the `Content-Type` header for `xml` or `text/`
2. Checks if the response body starts with `<`
3. If XML is detected, parses it looking for `<ExceptionText>` or `<ServiceException>` elements
4. Throws a descriptive error with the extracted message

```typescript
// Example error response from GeoServer (HTTP 200!):
// <?xml version="1.0" encoding="UTF-8"?>
// <ows:ExceptionReport>
//   <ows:Exception>
//     <ows:ExceptionText>Could not find feature type POSM_GIS:NonExistent</ows:ExceptionText>
//   </ows:Exception>
// </ows:ExceptionReport>
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_GEOSERVER_BASE` | `/api/geoserver` | Base path for all GeoServer requests. Works for both dev (Vite proxy) and prod (Amplify rewrite). |
| `VITE_GS_ADMIN_USER` | `admin` | GeoServer REST API username (used only for workspace discovery via REST). |
| `VITE_GS_ADMIN_PASS` | `geoserver` | GeoServer REST API password. |

These are only needed client-side. The GeoServer EC2 instance itself has no special POSM GIS configuration — it's a standard GeoServer connected to a PostGIS database on AWS RDS.

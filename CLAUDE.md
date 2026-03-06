# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

POSM GIS is a React-based web map viewer that connects to a GeoServer WFS backend (backed by PostgreSQL/PostGIS on AWS RDS). It supports multi-workspace layer discovery, advanced symbology, filtering, labeling, sharing, and session persistence via DynamoDB.

## Repository Structure

- **`posm-gis/`** — Active React app (Vite + React 19 + TypeScript + Zustand 5)
- **`posm-gis/amplify/`** — AWS Amplify Gen 2 CDK backend (DynamoDB + Lambda + API Gateway)
- **`legacy-vanilla-js/`** — Archived original vanilla JS app (not actively developed)

## Build & Dev Commands

All commands run from `posm-gis/`:

```bash
npm ci                # Install dependencies
npm run dev           # Dev server on port 3000 (Vite, proxies /api/geoserver)
npm run build         # Production build (tsc -b && vite build)
npm run lint          # ESLint
npm run preview       # Preview production build locally
npx ampx sandbox      # Deploy Amplify backend (Lambda + DynamoDB) for dev
```

No test framework is configured.

## Architecture

### Key Design Principle: Imperative Leaflet Outside React

All Leaflet objects (L.GeoJSON, L.MarkerClusterGroup, arrow decorators, label managers) live in `leafletRegistry.ts` — a plain ES6 `Map<string, LeafletLayerRefs>` completely outside React/Zustand. The Zustand store only holds serializable config. All Leaflet mutations happen in hooks and effects, never in render.

### Data Flow

1. MapPage initializes Leaflet map on a div ref
2. Workspace selected → `loadAllLayers()` orchestrates: WFS GetCapabilities → parallel GeoJSON fetches → build Leaflet layers → restore session from DynamoDB → reconcile visual state
3. Auto-save subscribes to Zustand changes, debounced 2s, writes to DynamoDB via Lambda

### Store (`src/store/index.ts`)

Zustand 5 store with `layers: Record<string, LayerConfig>`, `layerOrder`, map state (center/zoom/basemap), UI state, bookmarks. Exposed at `window.__POSM` for debugging.

### Leaflet Registry (`src/store/leafletRegistry.ts`)

Non-reactive map of `layerName → { leafletLayer, clusterGroup, geojson, arrowDecorators, labelManager }`. Must be updated alongside Zustand when rebuilding layers.

### Key Hooks

- **`useLayers`** — Layer discovery + GeoJSON loading + Leaflet layer creation
- **`useSession`** — Save/load/auto-save to DynamoDB (localStorage fallback in dev)
- **`useFilters`** — CQL filter application: re-fetches GeoJSON, rebuilds Leaflet layer, re-applies symbology/labels/popups

## Backend (Amplify Gen 2)

**DynamoDB single-table** (`posm-gis`): PK+SK strings, pay-per-request.
- Config items: `PK=USER#{username}` / `SK=CONFIG#{workspace}`
- Share items: `PK=SHARE#{id}` / `SK=SHARE#{id}` (7-day TTL)

**Critical**: Config stored as `configJson: JSON.stringify(config)` to avoid DynamoDB marshalling issues with deeply nested symbology objects. Both Lambda handlers (config-handler, share-handler) use this pattern.

**Lambda functions**: Node 20, 256MB, 10s timeout. Routes: GET/POST `/api/config`, POST `/api/share`, GET `/api/share/{shareId}`.

## Known Patterns & Gotchas

### Clustered Point Symbology

When point layers are clustered in a `MarkerClusterGroup`, calling `setStyle()` on individual CircleMarkers updates internal options but doesn't visually refresh. After any symbology change on a potentially clustered layer, call `refreshClusterAfterSymbology(refs)` from `symbology.ts` which clears and re-adds the GeoJSON layer to the cluster group.

### Auto-Save Suppression

`suppressAutoSave()` / `unsuppressAutoSave()` in useSession guard the async load→restore sequence against React StrictMode double-invocation saving stale/empty state to DynamoDB.

### Dev/Prod Duality

- `lib/api.ts`: If `VITE_DYNAMO_API_URL` is absent, falls back to localStorage
- `lib/geoserver.ts`: `VITE_GEOSERVER_BASE` defaults to `/api/geoserver` (Vite proxy in dev, Amplify rewrite in prod)

### GeoServer Proxy Chain (Production)

App requests `/api/geoserver/*` → Amplify rewrite → CloudFront (`d1ka5igkln6d3r.cloudfront.net`) → EC2 GeoServer (`18.225.234.98:8080`). CloudFront provides HTTPS to avoid mixed-content blocking.

## Type System

- **`LayerConfig`** (`types/layer.ts`) — Core per-layer state including symbology, filters, popups, age config
- **`SymbologyConfig`** (`types/symbology.ts`) — Discriminated union: unique | graduated | proportional | rules
- **`WorkspaceConfig`** (`types/session.ts`) — Serialized session persisted to DynamoDB

## Routes

- `/login` — Local auth login (localStorage-based, planned Cognito migration)
- `/map` — Main map view (requires auth)
- `/share/:shareId` — Read-only public shared map (no auth)
- `/admin` — User/group management (admin role only)

## Auth System (`src/config/auth.ts`)

Currently localStorage-based (dev): users, groups, and SHA-256 hashed passwords stored client-side. `AppUser` has `role: 'admin' | 'user'` and `groups: string[]`. Groups map to allowed GeoServer workspaces (`'__ALL__'` = unrestricted). Production will use AWS Cognito.

## Vite Dev Proxy

`vite.config.ts` proxies three paths in dev:
- `/api/geoserver` → EC2 GeoServer (`18.225.234.98:8080`)
- `/api/config` → `localhost:8000` (local Python server or Amplify sandbox)
- `/api/share` → `localhost:8000`

## Environment Variables

```
VITE_GEOSERVER_BASE=/api/geoserver          # GeoServer proxy path (default works for dev+prod)
VITE_DYNAMO_API_URL=https://xxx.execute-api  # API Gateway URL (required for save/load/share)
VITE_GS_ADMIN_USER=admin                     # GeoServer REST admin (optional, for workspace discovery)
VITE_GS_ADMIN_PASS=geoserver                 # GeoServer REST password (optional)
```

## Additional Documentation

Detailed docs live in `posm-gis/docs/`: `architecture.md`, `deployment.md`, `development.md`, `features.md`, `api-reference.md`, `labels-and-symbology.md`.

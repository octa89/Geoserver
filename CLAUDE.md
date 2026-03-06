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
- Auth items: `PK=AUTH#GLOBAL` / `SK=AUTH#USERS|AUTH#GROUPS|AUTH#PASSWORDS`

**Critical**: Config stored as `configJson: JSON.stringify(config)` to avoid DynamoDB marshalling issues with deeply nested symbology objects. Auth data uses `dataJson` with the same pattern. All Lambda handlers follow this convention.

**Lambda functions**: Node 20, 256MB, 10s timeout.
- `config-handler`: GET/POST `/api/config`
- `share-handler`: POST `/api/share`, GET `/api/share/{shareId}`
- `auth-handler`: GET/POST `/api/auth/data`, POST `/api/auth/login`, POST `/api/auth/init`

## Known Patterns & Gotchas

### Clustered Point Symbology

When point layers are clustered in a `MarkerClusterGroup`, calling `setStyle()` on individual CircleMarkers updates internal options but doesn't visually refresh. After any symbology change on a potentially clustered layer, call `refreshClusterAfterSymbology(refs)` from `symbology.ts` which clears and re-adds the GeoJSON layer to the cluster group.

### `recolorSymbology()` vs `applySymbology()`

`applySymbology()` recomputes everything from scratch (breaks, color maps) — use for initial apply and session restore. `recolorSymbology()` applies exact colors from a modified config without recomputing — use for legend color editing. The legend's deferred-apply pattern uses `recolorSymbology()` via `commitSymbology()`.

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

- `/login` — Login page (public)
- `/map` — Main map view (requires auth)
- `/share/:shareId` — Read-only public shared map (no auth, supports labels, clustering, layer toggle)
- `/admin` — User/group management (public route, but page has its own admin login gate)

## Auth System (`src/config/auth.ts`)

Dual-mode persistence: localStorage in dev, DynamoDB in prod (when `VITE_DYNAMO_API_URL` is set).

- `AppUser` has `{username, displayName, city, groups[], role}` where `role: 'admin' | 'user'`
- Groups map to allowed GeoServer workspaces (`'__ALL__'` = unrestricted)
- Passwords are SHA-256 hashed client-side; in prod, login validation happens server-side in Lambda
- `getUsers()`/`getGroups()` are synchronous (read from localStorage cache); `setUsers()`/`setGroups()` are async (write localStorage + DynamoDB)
- `initAuth()` seeds localStorage with defaults, then syncs from DynamoDB in prod mode

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

Detailed docs live in `posm-gis/docs/`: `architecture.md`, `deployment.md`, `development.md`, `features.md`, `api-reference.md`, `labels-and-symbology.md`, `CHANGELOG.md`.

---

## Rules for Claude — Do's and Don'ts

### DO

- **Always run `npm run build`** after making changes to verify TypeScript compiles and there are no errors. This is the primary verification since there are no tests.
- **Read files before editing.** Never modify a file you haven't read first. Understand existing patterns before changing them.
- **Follow the dual-mode pattern** for any new persistence features: localStorage fallback in dev, DynamoDB via Lambda in prod. Check `USE_REMOTE` from `lib/api.ts`.
- **Call `refreshClusterAfterSymbology(refs)`** after ANY symbology change on a layer that might be clustered. This is mandatory — cluster groups cache marker visuals.
- **Call `removeLabels(map, mgr)`** before destroying/rebuilding a Leaflet layer that has labels. Orphaned label markers will persist on the map otherwise.
- **Store DynamoDB data as `JSON.stringify()`** in a single string attribute (`configJson` or `dataJson`). Never store deeply nested objects directly — DynamoDB marshalling breaks on complex symbology configs.
- **Use `recolorSymbology()`** when applying user color edits from the legend. Use `applySymbology()` only for initial apply or session restore (it recomputes everything).
- **Keep `getUsers()`/`getGroups()` synchronous** — they read from localStorage (the cache). Only the write functions (`setUsers`, `setGroups`) are async.
- **Ask before pushing** to remote. Wait for explicit user approval before `git push`.
- **Ask before running destructive commands** (`git reset --hard`, `rm -rf`, dropping data, etc.).
- **Match existing code style** — inline styles for React components (no CSS modules), TypeScript strict mode, Zustand 5 patterns.
- **Update `posm-gis/docs/`** when adding significant features. Keep `CHANGELOG.md`, `features.md`, and `api-reference.md` in sync.
- **Pause Dropbox** (or warn the user to pause it) before running `npx ampx sandbox` — Dropbox locks `.amplify/artifacts/` and causes `EBUSY` errors during CDK bundling.

### DON'T

- **Don't put Leaflet objects in Zustand.** Leaflet instances (`L.Map`, `L.GeoJSON`, `L.MarkerClusterGroup`, `LabelManager`) belong in `leafletRegistry.ts`, never in the store. The store only holds serializable config.
- **Don't make `getUsers()`/`getGroups()` async.** They must stay synchronous — dozens of call sites depend on this. localStorage is the cache; DynamoDB sync happens in the background after writes.
- **Don't return passwords from `GET /api/auth/data`.** The auth Lambda must never send password hashes to the client. Login validation happens server-side.
- **Don't import `auth.ts` from `api.ts`** — this creates a circular dependency. `api.ts` has its own inline `AppUser`/`AppGroup` interfaces.
- **Don't use `applySymbology()` for legend color edits** — it recomputes breaks/color maps from scratch, discarding user edits. Use `recolorSymbology()` instead.
- **Don't forget the share view** when adding new per-layer features. If a feature is saved in `PerLayerConfig` (labels, clustering, symbology, filters, popups), it should also work in `SharePage.tsx`.
- **Don't skip `--no-verify` or `--no-gpg-sign`** on git commits unless explicitly asked.
- **Don't create `.md` documentation files** unless explicitly requested.
- **Don't add tests** — no test framework is configured. Use `npm run build` for verification.
- **Don't amend commits** — always create new commits unless explicitly asked to amend.
- **Don't modify `legacy-vanilla-js/`** — it's archived and not actively developed.
- **Don't over-engineer** — keep solutions minimal. No unnecessary abstractions, no speculative future-proofing, no extra error handling for scenarios that can't happen.

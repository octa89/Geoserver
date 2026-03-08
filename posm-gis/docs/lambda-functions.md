# Lambda Functions Guide

This document explains the three AWS Lambda functions that power the POSM GIS backend, how they connect to DynamoDB, and how to deploy and troubleshoot them.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [DynamoDB Single-Table Design](#dynamodb-single-table-design)
3. [Lambda Functions](#lambda-functions)
   - [config-handler](#1-config-handler)
   - [share-handler](#2-share-handler)
   - [auth-handler](#3-auth-handler)
4. [API Gateway Routes](#api-gateway-routes)
5. [Frontend API Layer (Dual-Mode)](#frontend-api-layer-dual-mode)
6. [Deployment Workflow](#deployment-workflow)
   - [Local Development (Sandbox)](#local-development-sandbox)
   - [Production Deployment](#production-deployment)
7. [Request/Response Examples](#requestresponse-examples)
8. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
Browser (React App)
    |
    | HTTPS
    v
API Gateway (HTTP API)
    |
    |--- /api/config      --> config-handler Lambda
    |--- /api/share       --> share-handler Lambda
    |--- /api/auth/*      --> auth-handler Lambda
    |
    v
DynamoDB (single table: "posm-gis")
```

All three Lambda functions:
- Run on **Node.js 20** runtime
- Have **256 MB** memory and **10 second** timeout
- Share a single DynamoDB table (`posm-gis`)
- Receive the table name via the `TABLE_NAME` environment variable
- Return CORS headers (`Access-Control-Allow-Origin: *`) on every response
- Store complex nested data as `JSON.stringify()` in a single string attribute to avoid DynamoDB marshalling issues

The infrastructure is defined in `amplify/backend.ts` using AWS CDK (via Amplify Gen 2).

---

## DynamoDB Single-Table Design

The `posm-gis` table uses a composite key (`PK` + `SK`, both strings) with pay-per-request billing and TTL enabled on the `ttl` attribute.

| Access Pattern | PK | SK | Data Attribute | Description |
|---|---|---|---|---|
| User config | `USER#{username}` | `CONFIG#{workspace}` | `configJson` (string) | Saved map session (layers, symbology, filters, center/zoom) |
| Share snapshot | `SHARE#{shareId}` | `SHARE#{shareId}` | `configJson` (string) | Read-only map snapshot, auto-expires via TTL (7 days) |
| Users list | `AUTH#GLOBAL` | `AUTH#USERS` | `dataJson` (string) | Array of all user objects |
| Groups list | `AUTH#GLOBAL` | `AUTH#GROUPS` | `dataJson` (string) | Array of all group objects |
| Password hashes | `AUTH#GLOBAL` | `AUTH#PASSWORDS` | `dataJson` (string) | Map of `{ username: sha256hash }` |

**Critical convention:** All complex data is stored as `JSON.stringify(data)` in a single string attribute (`configJson` or `dataJson`). This avoids DynamoDB's marshalling limitations with deeply nested objects like symbology color maps. The Lambda functions `JSON.parse()` on read and `JSON.stringify()` on write.

---

## Lambda Functions

### 1. config-handler

**File:** `amplify/functions/config-handler/handler.ts`

Manages per-user, per-workspace map session configs. The React app auto-saves the current map state (layers, visibility, symbology, filters, center/zoom, basemap) every 2 seconds via this endpoint.

#### What it does

| Operation | Method | Description |
|---|---|---|
| Get config | `GET /api/config?username=X&workspace=Y` | Returns the saved workspace config for a specific user |
| List workspaces | `GET /api/config?username=X` | Lists all saved workspace names for a user |
| Save config | `POST /api/config` | Upserts a workspace config |

#### Data flow

1. User opens the map and selects a workspace
2. Frontend calls `GET /api/config?username=admin&workspace=my_workspace` to restore the previous session
3. As the user interacts (pan, zoom, toggle layers, change symbology), the Zustand store updates
4. A debounced auto-save (2s) calls `POST /api/config` with the full `WorkspaceConfig` object
5. The Lambda stores it as `configJson: JSON.stringify(config)` in DynamoDB

#### DynamoDB item structure

```json
{
  "PK": "USER#admin",
  "SK": "CONFIG#my_workspace",
  "username": "admin",
  "workspace": "my_workspace",
  "configJson": "{\"center\":[40.7,-74],\"zoom\":12,\"basemap\":\"street\",\"layers\":{...},\"layerOrder\":[...]}",
  "updatedAt": "2026-03-06T15:30:00.000Z"
}
```

---

### 2. share-handler

**File:** `amplify/functions/share-handler/handler.ts`

Creates and retrieves read-only map share links. Shares are public (no auth required to view) and auto-expire after 7 days via DynamoDB TTL.

#### What it does

| Operation | Method | Description |
|---|---|---|
| Create share | `POST /api/share` | Saves a snapshot of the current map, returns a share ID |
| Load share | `GET /api/share/{shareId}` | Returns the snapshot (public, no auth) |

#### Data flow

1. User clicks "Share" in the app
2. Frontend calls `POST /api/share` with `{ username, wsName, wsConfig }`
3. Lambda generates an 8-character hex ID (`randomBytes(4).toString('hex')`)
4. Lambda stores the snapshot with a TTL of 7 days from now
5. Lambda returns `{ id: "a1b2c3d4", url: "/share/a1b2c3d4" }`
6. Anyone with the link visits `/share/a1b2c3d4`
7. The SharePage component calls `GET /api/share/a1b2c3d4` to load the snapshot
8. The map renders in read-only mode with all saved layers, symbology, labels, and popups

#### DynamoDB item structure

```json
{
  "PK": "SHARE#a1b2c3d4",
  "SK": "SHARE#a1b2c3d4",
  "shareId": "a1b2c3d4",
  "createdBy": "admin",
  "wsName": "my_workspace",
  "configJson": "{\"center\":[40.7,-74],\"zoom\":12,...}",
  "createdAt": "2026-03-06T15:30:00.000Z",
  "ttl": 1741884600
}
```

The `ttl` attribute is a Unix epoch timestamp. DynamoDB automatically deletes the item after this time.

---

### 3. auth-handler

**File:** `amplify/functions/auth-handler/handler.ts`

Manages users, groups, and authentication. Unlike config and share, auth uses a single Lambda with multiple sub-routes.

#### What it does

| Operation | Method + Path | Description |
|---|---|---|
| Get users & groups | `GET /api/auth/data` | Returns `{ users, groups }` — **never** returns passwords |
| Save users/groups/passwords | `POST /api/auth/data` | Upserts any combination of users, groups, passwords |
| Login | `POST /api/auth/login` | Validates `{ username, passwordHash }` server-side |
| Init seed | `POST /api/auth/init` | Seeds default admin user if DynamoDB is empty |

#### Data flow — Login

1. User enters username + password on `/login`
2. Frontend hashes the password with SHA-256 client-side
3. Frontend calls `POST /api/auth/login` with `{ username, passwordHash }`
4. Lambda fetches `AUTH#PASSWORDS` and `AUTH#USERS` from DynamoDB in parallel
5. Lambda compares the hash — returns the user object on match, 401 on failure
6. **Passwords never leave the Lambda** — `GET /api/auth/data` intentionally skips `AUTH#PASSWORDS`

#### Data flow — Admin management

1. Admin navigates to `/admin` and logs in
2. Admin adds/edits users or groups via the UI
3. Frontend calls `POST /api/auth/data` with `{ users: [...], groups: [...] }`
4. When setting a password: `POST /api/auth/data` with `{ passwords: { "jsmith": "sha256hash..." } }`
5. Lambda writes each provided field as a separate DynamoDB item in parallel

#### Data flow — First-time setup

1. On app load, `initAuth()` in `src/config/auth.ts` calls `POST /api/auth/init` with a default password hash
2. Lambda checks if `AUTH#USERS` exists in DynamoDB
3. If empty, it seeds: default admin user, default "Full Access" group, and the default admin password hash
4. Returns `{ seeded: true }` or `{ seeded: false }` if data already exists

#### DynamoDB item structures

**Users:**
```json
{
  "PK": "AUTH#GLOBAL",
  "SK": "AUTH#USERS",
  "dataJson": "[{\"username\":\"admin\",\"displayName\":\"Administrator\",\"city\":\"\",\"groups\":[\"all_access\"],\"role\":\"admin\"}]",
  "updatedAt": "2026-03-06T15:30:00.000Z"
}
```

**Groups:**
```json
{
  "PK": "AUTH#GLOBAL",
  "SK": "AUTH#GROUPS",
  "dataJson": "[{\"id\":\"all_access\",\"label\":\"Full Access\",\"workspaces\":[\"__ALL__\"]}]",
  "updatedAt": "2026-03-06T15:30:00.000Z"
}
```

**Passwords (server-side only, never sent to client):**
```json
{
  "PK": "AUTH#GLOBAL",
  "SK": "AUTH#PASSWORDS",
  "dataJson": "{\"admin\":\"8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918\"}",
  "updatedAt": "2026-03-06T15:30:00.000Z"
}
```

---

## API Gateway Routes

Defined in `amplify/backend.ts`. The HTTP API Gateway (`posm-gis-api`) routes requests to the appropriate Lambda:

| Route | Methods | Lambda |
|---|---|---|
| `/api/config` | GET, POST | config-handler |
| `/api/share` | POST | share-handler |
| `/api/share/{shareId}` | GET | share-handler |
| `/api/auth/data` | GET, POST | auth-handler |
| `/api/auth/login` | POST | auth-handler |
| `/api/auth/init` | POST | auth-handler |

CORS is configured at the API Gateway level (all origins, GET/POST/OPTIONS, 24h max-age). Each Lambda also returns CORS headers as a fallback.

---

## Frontend API Layer (Dual-Mode)

**File:** `src/lib/api.ts`

The frontend uses a dual-mode persistence layer controlled by the `VITE_DYNAMO_API_URL` environment variable:

| Mode | When | Persistence | How it works |
|---|---|---|---|
| **Dev** | `VITE_DYNAMO_API_URL` not set | localStorage | All data stored locally, no Lambda calls |
| **Prod** | `VITE_DYNAMO_API_URL` is set | DynamoDB via Lambda | All calls go through API Gateway |

This means you can develop the frontend without any AWS infrastructure — localStorage simulates the backend.

**Key functions in `api.ts`:**

| Function | Dev behavior | Prod behavior |
|---|---|---|
| `saveConfig()` | `localStorage.setItem()` | `POST /api/config` |
| `loadConfig()` | `localStorage.getItem()` | `GET /api/config?username=X&workspace=Y` |
| `createShareLink()` | Random ID + localStorage | `POST /api/share` |
| `loadShareSnapshot()` | `localStorage.getItem()` | `GET /api/share/{shareId}` |
| `saveAuthData()` | `localStorage.setItem()` | `POST /api/auth/data` |
| `loadAuthData()` | `localStorage.getItem()` | `GET /api/auth/data` |
| `remoteLogin()` | Not used (local hash compare) | `POST /api/auth/login` |
| `initAuthRemote()` | No-op | `POST /api/auth/init` |

---

## Deployment Workflow

### Local Development (Sandbox)

The Amplify sandbox deploys real AWS resources (DynamoDB, Lambda, API Gateway) for development.

**Prerequisites:**
- AWS CLI configured with credentials
- Node.js 20+
- npm

**Steps:**

```bash
# 1. Navigate to the project
cd posm-gis

# 2. Install dependencies
npm ci

# 3. IMPORTANT: Pause Dropbox sync on the project folder!
#    Dropbox locks .amplify/artifacts/ and causes EBUSY errors during CDK bundling.

# 4. Deploy the sandbox backend
npx ampx sandbox

# 5. The command outputs an API Gateway URL like:
#    https://abc123xyz.execute-api.us-east-2.amazonaws.com
#    Copy this URL.

# 6. Create/update your .env file:
echo "VITE_DYNAMO_API_URL=https://abc123xyz.execute-api.us-east-2.amazonaws.com" > .env.local

# 7. Start the dev server (in a separate terminal)
npm run dev

# 8. The app now uses real Lambda + DynamoDB instead of localStorage
```

**What `npx ampx sandbox` creates:**
- A DynamoDB table named `posm-gis`
- Three Lambda functions (`posm-config-handler`, `posm-share-handler`, `posm-auth-handler`)
- An HTTP API Gateway with all routes configured
- IAM roles granting Lambda read/write access to the table

**Tearing down the sandbox:**

Press `Ctrl+C` in the terminal running `npx ampx sandbox`, or run:

```bash
npx ampx sandbox delete
```

This deletes all sandbox resources **except** the DynamoDB table (it has `RemovalPolicy.RETAIN`).

### Production Deployment

Production uses AWS Amplify Hosting, which automatically builds and deploys on git push.

**Steps:**

```bash
# 1. Ensure your changes build locally
npm run build

# 2. Commit your changes
git add -A
git commit -m "Your commit message"

# 3. Push to the main branch (triggers Amplify build pipeline)
git push origin main
```

**What happens on push:**
1. Amplify detects the push and starts a build
2. CDK synthesizes the CloudFormation template from `amplify/backend.ts`
3. Lambda functions are bundled (esbuild, minified) and deployed
4. API Gateway routes are updated
5. The React app is built (`npm run build`) and deployed to CloudFront
6. The Amplify rewrite rule sends `/api/*` requests to the API Gateway

**Updating a Lambda function:**

1. Edit the handler file (e.g., `amplify/functions/config-handler/handler.ts`)
2. Run `npm run build` to verify TypeScript compiles
3. If using sandbox: `npx ampx sandbox` will hot-reload the Lambda automatically
4. For production: commit and push — Amplify rebuilds and redeploys

**Environment variables for production:**

Set these in the Amplify Console under App Settings > Environment Variables:

| Variable | Value | Description |
|---|---|---|
| `VITE_DYNAMO_API_URL` | `https://xxx.execute-api.us-east-2.amazonaws.com` | API Gateway URL |
| `VITE_GEOSERVER_BASE` | `/api/geoserver` | GeoServer proxy path (default works) |
| `VITE_GS_ADMIN_USER` | `admin` | GeoServer REST admin (optional) |
| `VITE_GS_ADMIN_PASS` | `geoserver` | GeoServer REST password (optional) |

---

## Request/Response Examples

### Config — Save a workspace session

```bash
curl -X POST https://YOUR_API_URL/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "workspace": "my_workspace",
    "config": {
      "center": [40.7128, -74.006],
      "zoom": 12,
      "basemap": "street",
      "layers": {
        "my_workspace:buildings": {
          "visible": true,
          "color": "#e6194b",
          "symbology": null,
          "activeFilters": [],
          "labelField": null
        }
      },
      "layerOrder": ["my_workspace:buildings"]
    }
  }'
```

**Response (200):**
```json
{ "success": true }
```

### Config — Load a workspace session

```bash
curl "https://YOUR_API_URL/api/config?username=admin&workspace=my_workspace"
```

**Response (200):**
```json
{
  "center": [40.7128, -74.006],
  "zoom": 12,
  "basemap": "street",
  "layers": {
    "my_workspace:buildings": {
      "visible": true,
      "color": "#e6194b",
      "symbology": null,
      "activeFilters": [],
      "labelField": null
    }
  },
  "layerOrder": ["my_workspace:buildings"]
}
```

**Response (404) — no saved config:**
```json
{ "error": "Config not found" }
```

### Config — List saved workspaces for a user

```bash
curl "https://YOUR_API_URL/api/config?username=admin"
```

**Response (200):**
```json
[
  { "workspace": "my_workspace", "updatedAt": "2026-03-06T15:30:00.000Z" },
  { "workspace": "test_data", "updatedAt": "2026-03-05T10:00:00.000Z" }
]
```

### Share — Create a share link

```bash
curl -X POST https://YOUR_API_URL/api/share \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "wsName": "my_workspace",
    "wsConfig": {
      "center": [40.7128, -74.006],
      "zoom": 12,
      "basemap": "satellite",
      "layers": { "my_workspace:pipes": { "visible": true, "color": "#3cb44b" } },
      "layerOrder": ["my_workspace:pipes"]
    }
  }'
```

**Response (201):**
```json
{
  "id": "a1b2c3d4",
  "url": "/share/a1b2c3d4"
}
```

### Share — Load a share snapshot

```bash
curl "https://YOUR_API_URL/api/share/a1b2c3d4"
```

**Response (200):**
```json
{
  "shareId": "a1b2c3d4",
  "wsName": "my_workspace",
  "wsConfig": {
    "center": [40.7128, -74.006],
    "zoom": 12,
    "basemap": "satellite",
    "layers": { "my_workspace:pipes": { "visible": true, "color": "#3cb44b" } },
    "layerOrder": ["my_workspace:pipes"]
  },
  "createdAt": "2026-03-06T15:30:00.000Z",
  "createdBy": "admin"
}
```

**Response (404) — expired or invalid:**
```json
{ "error": "Share not found or expired" }
```

### Auth — Get users and groups

```bash
curl "https://YOUR_API_URL/api/auth/data"
```

**Response (200):**
```json
{
  "users": [
    {
      "username": "admin",
      "displayName": "Administrator",
      "city": "",
      "groups": ["all_access"],
      "role": "admin"
    },
    {
      "username": "jsmith",
      "displayName": "John Smith",
      "city": "Miami",
      "groups": ["field_team"],
      "role": "user"
    }
  ],
  "groups": [
    { "id": "all_access", "label": "Full Access", "workspaces": ["__ALL__"] },
    { "id": "field_team", "label": "Field Team", "workspaces": ["water_network", "sewer"] }
  ]
}
```

Note: passwords are **never** included in this response.

### Auth — Save users (from admin panel)

```bash
curl -X POST https://YOUR_API_URL/api/auth/data \
  -H "Content-Type: application/json" \
  -d '{
    "users": [
      { "username": "admin", "displayName": "Administrator", "city": "", "groups": ["all_access"], "role": "admin" },
      { "username": "jsmith", "displayName": "John Smith", "city": "Miami", "groups": ["field_team"], "role": "user" }
    ]
  }'
```

**Response (200):**
```json
{ "success": true }
```

### Auth — Set a password

```bash
# The password hash is SHA-256 of the plaintext password.
# Example: SHA-256("mypassword") = "89e01536ac207279409d4de1e5253e01f4a1769e696db0d6062ca9b8f56767c8"

curl -X POST https://YOUR_API_URL/api/auth/data \
  -H "Content-Type: application/json" \
  -d '{
    "passwords": {
      "jsmith": "89e01536ac207279409d4de1e5253e01f4a1769e696db0d6062ca9b8f56767c8"
    }
  }'
```

**Response (200):**
```json
{ "success": true }
```

### Auth — Login

```bash
curl -X POST https://YOUR_API_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "jsmith",
    "passwordHash": "89e01536ac207279409d4de1e5253e01f4a1769e696db0d6062ca9b8f56767c8"
  }'
```

**Response (200) — success:**
```json
{
  "user": {
    "username": "jsmith",
    "displayName": "John Smith",
    "city": "Miami",
    "groups": ["field_team"],
    "role": "user"
  }
}
```

**Response (401) — invalid credentials:**
```json
{ "error": "Invalid credentials" }
```

### Auth — Initialize (seed default admin)

```bash
curl -X POST https://YOUR_API_URL/api/auth/init \
  -H "Content-Type: application/json" \
  -d '{
    "defaultPasswordHash": "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918"
  }'
```

**Response (200) — first time:**
```json
{ "seeded": true }
```

**Response (200) — data already exists:**
```json
{ "seeded": false }
```

---

## Troubleshooting

### Dropbox EBUSY errors during `npx ampx sandbox`

**Symptom:** Build fails with `EBUSY: resource busy or locked` on files in `.amplify/artifacts/`.

**Cause:** Dropbox is syncing the output directory while CDK is writing to it.

**Fix:** Pause Dropbox sync on the project folder before running `npx ampx sandbox`. Resume it after the sandbox is running.

### DynamoDB marshalling errors with nested objects

**Symptom:** Saving a config with complex symbology (large `valueColorMap` objects) fails or returns corrupted data.

**Cause:** DynamoDB's native marshalling struggles with deeply nested objects.

**Fix:** This is already handled — all data is stored as `JSON.stringify()` in a single string attribute. If you add a new Lambda or data type, follow the same pattern: `configJson: JSON.stringify(data)` on write, `JSON.parse(item.configJson)` on read. Never store deeply nested objects as native DynamoDB Maps.

### CORS errors in the browser

**Symptom:** Browser console shows `Access to fetch has been blocked by CORS policy`.

**Cause:** CORS is configured at two levels — API Gateway and Lambda response headers. If one is missing or misconfigured, CORS fails.

**Fix:**
1. Verify the API Gateway CORS config in `amplify/backend.ts` includes `allowOrigins: ['*']`
2. Verify every Lambda response includes the `CORS_HEADERS` object
3. Verify OPTIONS preflight is handled (each Lambda returns 200 for `method === 'OPTIONS'`)

### Lambda timeout (10s)

**Symptom:** API calls fail with 504 Gateway Timeout.

**Cause:** The Lambda took longer than 10 seconds. This can happen with very large config objects.

**Fix:** Check CloudWatch Logs for the specific Lambda. If the config is too large, consider splitting it or increasing the timeout in `amplify/backend.ts`:

```typescript
timeout: Duration.seconds(30), // increase from 10
```

### Config not loading after deploy

**Symptom:** App loads but shows no saved session. Console shows `loadConfig failed: HTTP 403`.

**Cause:** The Lambda function doesn't have permission to read the DynamoDB table.

**Fix:** Verify `table.grantReadWriteData(configFn)` exists in `amplify/backend.ts` for all three Lambda functions.

### Share links expire after 7 days

**This is by design.** Share items have a `ttl` attribute set to 7 days from creation. DynamoDB automatically deletes expired items. To change the expiry, modify `SHARE_TTL_DAYS` in `amplify/functions/share-handler/handler.ts`.

### Passwords not working after migration

**Symptom:** Users can't log in after switching from dev (localStorage) to prod (DynamoDB).

**Cause:** Passwords exist in localStorage but haven't been synced to DynamoDB.

**Fix:** Use the admin panel (`/admin`) to reset passwords for all users. The admin panel writes to DynamoDB in prod mode.

### Viewing Lambda logs

```bash
# View recent logs for a specific Lambda
aws logs tail /aws/lambda/posm-config-handler --follow

# View logs for the last hour
aws logs tail /aws/lambda/posm-share-handler --since 1h

# View auth handler logs
aws logs tail /aws/lambda/posm-auth-handler --since 1h
```

### Testing a Lambda locally (without sandbox)

You can't run the Lambda functions directly, but you can test the endpoints with curl against the sandbox API URL:

```bash
# Set your sandbox URL
export API=https://abc123xyz.execute-api.us-east-2.amazonaws.com

# Test config save
curl -X POST $API/api/config \
  -H "Content-Type: application/json" \
  -d '{"username":"test","workspace":"test_ws","config":{"center":[0,0],"zoom":5}}'

# Test config load
curl "$API/api/config?username=test&workspace=test_ws"

# Test auth init
curl -X POST $API/api/auth/init \
  -H "Content-Type: application/json" \
  -d '{"defaultPasswordHash":"test"}'
```

---

## File Reference

| File | Purpose |
|---|---|
| `amplify/backend.ts` | Main CDK stack: DynamoDB table, all 3 Lambdas, API Gateway, routes, IAM permissions |
| `amplify/functions/config-handler/handler.ts` | Config Lambda source code |
| `amplify/functions/config-handler/resource.ts` | Config Lambda Amplify definition |
| `amplify/functions/share-handler/handler.ts` | Share Lambda source code |
| `amplify/functions/share-handler/resource.ts` | Share Lambda Amplify definition |
| `amplify/functions/auth-handler/handler.ts` | Auth Lambda source code |
| `amplify/data/resource.ts` | DynamoDB table definition (standalone, used by `backend.ts`) |
| `amplify/api/resource.ts` | API Gateway definition (standalone, used by `backend.ts`) |
| `src/lib/api.ts` | Frontend API layer (dual-mode: localStorage dev / Lambda prod) |
| `src/config/auth.ts` | Frontend auth logic (calls `api.ts` functions) |

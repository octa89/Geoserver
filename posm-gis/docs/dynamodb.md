# DynamoDB Architecture

This document describes how POSM GIS uses Amazon DynamoDB for all server-side persistence, including session configs, shared map snapshots, and authentication data.

## Table of Contents

- [Overview](#overview)
- [Single-Table Design](#single-table-design)
- [Item Types](#item-types)
- [Data Storage Convention](#data-storage-convention)
- [Client-Side Abstraction](#client-side-abstraction)
- [Lambda Handlers](#lambda-handlers)
- [Dev vs Prod Duality](#dev-vs-prod-duality)
- [TTL and Auto-Expiry](#ttl-and-auto-expiry)
- [CDK Definition](#cdk-definition)

---

## Overview

All persistent data in POSM GIS lives in a **single DynamoDB table** named `posm-gis`. The table uses a generic `PK` (partition key) + `SK` (sort key) schema with pay-per-request billing. This single-table design avoids managing multiple tables and keeps IAM permissions simple — each Lambda only needs `dynamodb:GetItem`, `PutItem`, and `Query` on one table.

```
posm-gis (DynamoDB Table)
  PK (String) — Partition key
  SK (String) — Sort key
  ttl (Number) — Optional TTL for auto-expiry (shares)
```

---

## Single-Table Design

The table stores three categories of data, distinguished by their PK/SK key patterns:

| Category | PK Pattern | SK Pattern | Purpose |
|----------|-----------|------------|---------|
| User configs | `USER#{username}` | `CONFIG#{workspace}` | Per-user, per-workspace session state |
| Shares | `SHARE#{id}` | `SHARE#{id}` | Public read-only map snapshots |
| Auth | `AUTH#GLOBAL` | `AUTH#USERS` / `AUTH#GROUPS` / `AUTH#PASSWORDS` | User accounts, groups, password hashes |

Each Lambda handler only accesses the key patterns it needs:
- `config-handler` reads/writes `USER#*` items
- `share-handler` reads/writes `SHARE#*` items
- `auth-handler` reads/writes `AUTH#GLOBAL` items

---

## Item Types

### User Config Items

Stores the full workspace session for a user: map position, basemap, layer visibility, symbology, filters, labels, clustering, popups, bookmarks, and layer order.

```
PK: USER#admin
SK: CONFIG#POSM_GIS
configJson: "{\"basemap\":\"street\",\"center\":[40.758,-82.515],\"zoom\":14,\"layers\":{...},\"bookmarks\":[...]}"
updatedAt: "2026-03-06T12:00:00.000Z"
```

**Key fields:**
- `configJson` (String) — `JSON.stringify()` of `WorkspaceConfig`
- `updatedAt` (String) — ISO 8601 timestamp of last save

### Share Items

Frozen snapshots of a map view, accessible publicly without authentication. Automatically deleted after 7 days via DynamoDB TTL.

```
PK: SHARE#a1b2c3d4
SK: SHARE#a1b2c3d4
wsName: "POSM_GIS"
configJson: "{\"basemap\":\"street\",\"center\":[40.758,-82.515],\"layers\":{...}}"
createdAt: 1741276800
createdBy: "admin"
ttl: 1741881600
```

**Key fields:**
- `wsName` (String) — Workspace name
- `configJson` (String) — `JSON.stringify()` of `WorkspaceConfig`
- `createdAt` (Number) — Unix epoch seconds
- `createdBy` (String) — Username who created the share
- `ttl` (Number) — Unix epoch + 604800 (7 days), triggers DynamoDB auto-deletion

### Auth Items

Three items under the `AUTH#GLOBAL` partition store all authentication data:

**Users:**
```
PK: AUTH#GLOBAL
SK: AUTH#USERS
dataJson: "[{\"username\":\"admin\",\"displayName\":\"Admin\",\"city\":\"\",\"groups\":[\"all_access\"],\"role\":\"admin\"}]"
```

**Groups:**
```
PK: AUTH#GLOBAL
SK: AUTH#GROUPS
dataJson: "[{\"id\":\"all_access\",\"label\":\"All Access\",\"workspaces\":[\"__ALL__\"]}]"
```

**Passwords:**
```
PK: AUTH#GLOBAL
SK: AUTH#PASSWORDS
dataJson: "{\"admin\":\"a1b2c3...SHA256hash\"}"
```

---

## Data Storage Convention

All complex/nested data is stored as a **single JSON string attribute** (`configJson` or `dataJson`). This is a deliberate design choice:

**Why not store nested objects directly?**

DynamoDB marshalls nested JavaScript objects into its internal `M` (Map), `L` (List), `S` (String), `N` (Number) attribute types. This marshalling breaks on deeply nested symbology configs because:
- The `valueColorMap` in unique symbology can have hundreds of keys
- Graduated symbology has nested arrays of breaks and colors
- Rule-based symbology has arrays of rule objects with mixed types
- DynamoDB's 400KB item limit applies to the marshalled representation, which is larger than the raw JSON

Storing as `JSON.stringify()` avoids all marshalling issues, stays compact, and makes the Lambda code simpler — just `JSON.parse()` on read, `JSON.stringify()` on write.

**Convention across all Lambda handlers:**
```typescript
// Write
const item = {
  PK: { S: pk },
  SK: { S: sk },
  configJson: { S: JSON.stringify(config) },  // never raw object
};

// Read
const config = JSON.parse(item.configJson.S);
```

---

## Client-Side Abstraction

The client never talks to DynamoDB directly. All persistence goes through `src/lib/api.ts`, which provides a dual-mode abstraction:

| Function | Dev Mode (no `VITE_DYNAMO_API_URL`) | Prod Mode (`VITE_DYNAMO_API_URL` set) |
|----------|-------------------------------------|---------------------------------------|
| `saveConfig()` | `localStorage.setItem()` | `POST /api/config` -> Lambda -> DynamoDB |
| `loadConfig()` | `localStorage.getItem()` | `GET /api/config?username=X&workspace=Y` -> Lambda -> DynamoDB |
| `createShareLink()` | `localStorage.setItem()` | `POST /api/share` -> Lambda -> DynamoDB |
| `loadShareSnapshot()` | `localStorage.getItem()` | `GET /api/share/{id}` -> Lambda -> DynamoDB |
| `saveAuthData()` | `localStorage.setItem()` | `POST /api/auth/data` -> Lambda -> DynamoDB |
| `loadAuthData()` | `localStorage.getItem()` | `GET /api/auth/data` -> Lambda -> DynamoDB |
| `remoteLogin()` | Not used | `POST /api/auth/login` -> Lambda validates against DynamoDB |
| `initAuthRemote()` | No-op | `POST /api/auth/init` -> Lambda seeds DynamoDB if empty |

The `USE_REMOTE` boolean flag (`!!VITE_DYNAMO_API_URL`) determines which path is taken at runtime. This allows full local development with zero AWS dependencies.

### localStorage as Cache

In production mode, auth data (`getUsers()`, `getGroups()`) is **read synchronously from localStorage** (the cache). Writes (`setUsers()`, `setGroups()`) update both localStorage and DynamoDB in parallel. This keeps the synchronous read API that dozens of call sites depend on while ensuring data durability in DynamoDB.

---

## Lambda Handlers

All Lambda functions are Node.js 20, 256MB, 10-second timeout. They use the AWS SDK v3 `@aws-sdk/client-dynamodb` for DynamoDB operations.

### config-handler (`/api/config`)

**`GET /api/config?username=X&workspace=Y`**
1. Builds key: `PK=USER#{username}`, `SK=CONFIG#{workspace}`
2. `GetItem` from DynamoDB
3. `JSON.parse(configJson)` and returns the `WorkspaceConfig`

**`POST /api/config`**
1. Receives `{ username, workspace, config }` in request body
2. `JSON.stringify(config)` into `configJson`
3. `PutItem` to DynamoDB with `updatedAt` timestamp

### share-handler (`/api/share`)

**`POST /api/share`**
1. Receives `{ username, wsName, wsConfig }` in request body
2. Generates random 8-character alphanumeric share ID
3. `PutItem` with `PK=SHARE#{id}`, `SK=SHARE#{id}`, 7-day `ttl`
4. Returns `{ id }` to the client

**`GET /api/share/{shareId}`**
1. Extracts `shareId` from path parameter
2. `GetItem` with `PK=SHARE#{id}`, `SK=SHARE#{id}`
3. `JSON.parse(configJson)` and returns `{ wsName, wsConfig, createdAt }`

### auth-handler (`/api/auth/*`)

**`GET /api/auth/data`**
1. Batch `GetItem` for `AUTH#USERS` and `AUTH#GROUPS` sort keys
2. Returns `{ users, groups }` — **never returns passwords**

**`POST /api/auth/data`**
1. Receives `{ users?, groups?, passwords? }` in request body
2. Writes each provided field to its respective `AUTH#GLOBAL` item
3. Passwords are stored as `dataJson: JSON.stringify(Record<username, SHA256hash>)`

**`POST /api/auth/login`**
1. Receives `{ username, passwordHash }` in request body
2. Reads `AUTH#PASSWORDS` from DynamoDB
3. Compares submitted hash against stored hash
4. Returns `{ user: AppUser }` on match, HTTP 401 on mismatch

**`POST /api/auth/init`**
1. Receives `{ defaultPasswordHash }` in request body
2. Checks if `AUTH#USERS` exists in DynamoDB
3. If empty, seeds default admin user, all_access group, and password

---

## Dev vs Prod Duality

| Concern | Dev (no `VITE_DYNAMO_API_URL`) | Prod (`VITE_DYNAMO_API_URL` set) |
|---------|-------------------------------|----------------------------------|
| Session configs | `localStorage` key: `posm_session_{user}_{ws}` | DynamoDB `USER#{user}` / `CONFIG#{ws}` |
| Shares | `localStorage` key: `posm_share_{id}` | DynamoDB `SHARE#{id}` / `SHARE#{id}` with 7-day TTL |
| Users | `localStorage` key: `posm_users` | DynamoDB `AUTH#GLOBAL` / `AUTH#USERS` |
| Groups | `localStorage` key: `posm_groups` | DynamoDB `AUTH#GLOBAL` / `AUTH#GROUPS` |
| Passwords | `localStorage` key: `posm_passwords` | DynamoDB `AUTH#GLOBAL` / `AUTH#PASSWORDS` |
| Login validation | Client-side hash comparison | Server-side in Lambda (hash never exposed to client) |

All transitions between dev and prod are controlled by a single environment variable. No code changes are needed.

---

## TTL and Auto-Expiry

Share items have a `ttl` attribute set to `createdAt + 604800` (7 days in seconds). DynamoDB's Time-to-Live feature automatically deletes expired items in the background. The deletion is eventually consistent (may take up to 48 hours after expiry), but expired items are filtered out by the share-handler on read.

The TTL attribute is enabled on the table via the CDK definition:

```typescript
const table = new dynamodb.Table(stack, 'PosmGisTable', {
  // ...
  timeToLiveAttribute: 'ttl',
});
```

Config and auth items have no TTL — they persist indefinitely.

---

## CDK Definition

The entire backend is defined in `amplify/backend.ts` as a single CDK stack (`posm-api-stack`):

```
posm-api-stack
  +-- DynamoDB Table (posm-gis)
  |     PK (String) + SK (String), PAY_PER_REQUEST, TTL on "ttl"
  |
  +-- Lambda: posm-config-handler
  |     Entry: amplify/functions/config-handler/handler.ts
  |     Env: TABLE_NAME=posm-gis
  |
  +-- Lambda: posm-share-handler
  |     Entry: amplify/functions/share-handler/handler.ts
  |     Env: TABLE_NAME=posm-gis
  |
  +-- Lambda: posm-auth-handler
  |     Entry: amplify/functions/auth-handler/handler.ts
  |     Env: TABLE_NAME=posm-gis
  |
  +-- HTTP API Gateway (posm-gis-api)
        CORS: *, GET/POST/OPTIONS
        Routes:
          GET/POST /api/config       -> config-handler
          POST     /api/share        -> share-handler
          GET      /api/share/{id}   -> share-handler
          GET/POST /api/auth/data    -> auth-handler
          POST     /api/auth/login   -> auth-handler
          POST     /api/auth/init    -> auth-handler
```

All three Lambdas are granted `ReadWriteData` on the table. The API Gateway has open CORS for all origins (intended to be restricted in production).

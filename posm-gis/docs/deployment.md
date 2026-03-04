# Deployment Guide

This document covers deploying POSM GIS to AWS Amplify with DynamoDB, Cognito, and Lambda backend services.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Architecture Overview](#architecture-overview)
- [DynamoDB Tables](#dynamodb-tables)
- [Lambda Functions](#lambda-functions)
- [Cognito User Pool](#cognito-user-pool)
- [Amplify Hosting](#amplify-hosting)
- [GeoServer Security](#geoserver-security)
- [Environment Variables](#environment-variables)
- [Migration from Dev to Production](#migration-from-dev-to-production)

---

## Prerequisites

- AWS account with admin access
- AWS CLI configured (`aws configure`)
- Node.js 18+ and npm
- Amplify CLI (`npm install -g @aws-amplify/cli`)

---

## Architecture Overview

```
CloudFront (CDN)
    │
    ▼
S3 Bucket (React build)
    │
    ▼
API Gateway (REST)
    ├── /api/geoserver/*  → GeoServer Proxy Lambda
    ├── /api/config/*     → Config API Lambda
    └── /api/share/*      → Share API Lambda
    │
    ├── Cognito Authorizer (for /api/config and /api/geoserver)
    │
    ▼
Lambda Functions (VPC)
    │
    ├── GeoServer EC2 (private, VPC-only access)
    ├── DynamoDB (posm-user-configs, posm-shares)
    └── S3 (posm-configs-overflow, for configs > 350KB)
```

---

## DynamoDB Tables

### Table: `posm-user-configs`

Stores user workspace configurations (basemap, symbology, filters, bookmarks).

| Attribute      | Type   | Key  | Description                          |
|----------------|--------|------|--------------------------------------|
| `PK`           | String | Hash | `USER#{username}`                    |
| `SK`           | String | Range| `CONFIG#{workspaceName}`             |
| `configData`   | String | —    | JSON string of WorkspaceConfig       |
| `updatedAt`    | String | —    | ISO 8601 timestamp                   |
| `userId`       | String | —    | Cognito user sub                     |

**Overflow handling**: Configs under 350KB are stored directly in `configData`. Configs over 350KB are stored in S3 at `s3://posm-configs-overflow/{userId}/{workspace}.json`, and `configData` holds `{"$ref":"s3://..."}`. The Lambda handles this transparently.

### Table: `posm-shares`

Stores shared map snapshots with automatic expiry.

| Attribute      | Type   | Key  | Description                          |
|----------------|--------|------|--------------------------------------|
| `PK`           | String | Hash | `SHARE#{shareId}`                    |
| `wsName`       | String | —    | Workspace name                       |
| `wsConfig`     | String | —    | JSON config snapshot                 |
| `createdAt`    | Number | —    | Unix epoch seconds                   |
| `TTL`          | Number | —    | Unix epoch + 604800 (7 days)         |
| `createdBy`    | String | —    | Username                             |

**TTL**: DynamoDB automatically deletes items when `TTL` is past. This replaces the manual `_cleanup_expired_shares()` from the legacy Python server.

### Create Tables (AWS CLI)

```bash
# User configs table
aws dynamodb create-table \
  --table-name posm-user-configs \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-2

# Shares table (with TTL)
aws dynamodb create-table \
  --table-name posm-shares \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-2

# Enable TTL on shares table
aws dynamodb update-time-to-live \
  --table-name posm-shares \
  --time-to-live-specification Enabled=true,AttributeName=TTL \
  --region us-east-2
```

---

## Lambda Functions

### GeoServer Proxy Lambda

**Path**: `/api/geoserver/*`
**Auth**: Cognito authorizer (authenticated users only)
**Timeout**: 30 seconds
**Memory**: 256 MB

Forwards requests to the GeoServer EC2 instance. Handles:
- WFS GetCapabilities (XML)
- WFS GetFeature (GeoJSON)
- Binary responses (images for WMS if needed)

**Key considerations:**
- Lambda response size limit: Use API Gateway v2 (10MB) or response streaming for large GeoJSON
- VPC: Lambda must be in the same VPC as GeoServer, or route through a NAT Gateway with Elastic IP

### Config API Lambda

**Path**: `/api/config/{username}/{workspace}`
**Auth**: Cognito authorizer
**Methods**: GET, POST

- **GET**: Read workspace config from DynamoDB, resolve S3 `$ref` if overflow
- **POST**: Write workspace config, overflow to S3 if > 350KB

### Share API Lambda

**Path**: `/api/share` (POST), `/api/share/{shareId}` (GET)
**Auth**: POST requires Cognito auth, GET is public

- **POST**: Generate share ID, store snapshot in DynamoDB with 7-day TTL
- **GET**: Read share snapshot (public, no auth)

---

## Cognito User Pool

### Setup

Create a Cognito User Pool to replace the localStorage-based auth:

```bash
aws cognito-idp create-user-pool \
  --pool-name posm-gis-users \
  --policies '{"PasswordPolicy":{"MinimumLength":8,"RequireUppercase":true,"RequireLowercase":true,"RequireNumbers":true}}' \
  --auto-verified-attributes email \
  --region us-east-2
```

### Migrating Users

Create a seed script to migrate users from the dev localStorage format to Cognito:

```bash
# Create the admin user
aws cognito-idp admin-create-user \
  --user-pool-id {pool-id} \
  --username admin \
  --user-attributes Name=custom:role,Value=admin Name=custom:groups,Value=all_access \
  --temporary-password TempPass123! \
  --region us-east-2

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id {pool-id} \
  --username admin \
  --password POSMRocksGISCentral2026 \
  --permanent \
  --region us-east-2
```

### Custom Attributes

| Attribute       | Type   | Description                     |
|-----------------|--------|---------------------------------|
| `custom:role`   | String | `admin` or `user`               |
| `custom:groups` | String | Comma-separated group IDs       |

---

## Amplify Hosting

### Initialize Amplify

```bash
cd posm-gis
amplify init
```

### Build Settings

The Amplify build specification:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

### SPA Routing

Add a rewrite rule for client-side routing:

| Source Pattern | Target        | Type |
|----------------|---------------|------|
| `</^[^.]+$\|\.(?!(css\|gif\|ico\|jpg\|js\|png\|txt\|svg\|woff\|woff2\|ttf\|map\|json)$)([^.]+$)/>` | `/index.html` | 200 |

This ensures that direct navigation to `/map`, `/admin`, or `/share/{id}` serves the React app.

---

## GeoServer Security

### Current State (Development)

GeoServer at `13.58.149.42:8080` is publicly accessible. The Vite dev server proxies requests through `/api/geoserver`.

### Production Lockdown

1. **Move GeoServer to a private subnet** (or keep it in a public subnet but restrict the security group)
2. **Lambda VPC configuration**: Place Lambda functions in the same VPC with a NAT Gateway
3. **Assign Elastic IP** to the NAT Gateway
4. **Update EC2 security group**: Only allow inbound port 8080 from the NAT Gateway Elastic IP

```bash
# Get the NAT Gateway Elastic IP
NAT_IP=$(aws ec2 describe-nat-gateways --query 'NatGateways[0].NatGatewayAddresses[0].PublicIp' --output text)

# Update security group
aws ec2 authorize-security-group-ingress \
  --group-id {geoserver-sg-id} \
  --protocol tcp \
  --port 8080 \
  --cidr ${NAT_IP}/32

# Remove the old 0.0.0.0/0 rule
aws ec2 revoke-security-group-ingress \
  --group-id {geoserver-sg-id} \
  --protocol tcp \
  --port 8080 \
  --cidr 0.0.0.0/0
```

After this, browsers cannot reach GeoServer directly. All requests must go through the Lambda proxy, which authenticates via Cognito.

---

## Environment Variables

### Lambda Environment

```bash
GEOSERVER_URL=http://10.0.1.xx:8080    # Private IP within VPC
DYNAMODB_CONFIGS_TABLE=posm-user-configs
DYNAMODB_SHARES_TABLE=posm-shares
S3_CONFIGS_BUCKET=posm-configs-overflow
SHARE_TTL_DAYS=7
```

### Amplify Frontend

```bash
VITE_API_URL=/api                       # API Gateway endpoint
VITE_AWS_REGION=us-east-2
VITE_COGNITO_USER_POOL_ID=us-east-2_xxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxx
```

---

## Migration from Dev to Production

### What Changes

| Concern      | Development                    | Production                          |
|-------------|--------------------------------|-------------------------------------|
| Auth        | localStorage SHA-256           | Cognito User Pool                   |
| Sessions    | localStorage                   | DynamoDB (posm-user-configs)        |
| Shares      | localStorage                   | DynamoDB (posm-shares) + TTL        |
| GeoServer   | Direct proxy via Vite          | Lambda proxy in VPC                 |
| Hosting     | Vite dev server                | S3 + CloudFront via Amplify         |
| User mgmt   | localStorage + Admin page      | Cognito + Admin page                |

### Files That Change

| File              | Change Needed                                    |
|-------------------|--------------------------------------------------|
| `src/config/auth.ts` | Replace localStorage auth with `@aws-amplify/auth` |
| `src/hooks/useSession.ts` | Replace localStorage with `/api/config` fetch |
| `src/components/share/ShareModal.tsx` | Replace localStorage with `/api/share` POST |
| `src/routes/SharePage.tsx` | Replace localStorage with `/api/share` GET |
| `src/routes/AdminPage.tsx` | Replace localStorage CRUD with Cognito admin API |
| `.env` | Add Cognito pool ID and client ID |

### What Stays the Same

All library modules (`lib/*`), component logic, Zustand store, Leaflet integration, and the entire UI remain unchanged. The migration only affects the data persistence layer.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Lambda cold starts (100-300ms) on GeoServer proxy | Provisioned concurrency or Lambda function URLs |
| Lambda 6MB response limit for large WFS GeoJSON | Use API Gateway v2 (10MB limit) or Lambda response streaming |
| DynamoDB 400KB item limit for large configs | S3 overflow pattern (transparent to client) |
| Cognito user migration complexity | Seed script + CSV import tool |
| GeoServer VPC networking | Test with VPC Lambda before locking down security group |

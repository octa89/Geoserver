# POSM GIS

A web-based GIS map viewer for POSM (Point of Service Management) that connects to a GeoServer/PostGIS backend. Users can visualize, style, filter, and share geospatial layers through an interactive Leaflet map.

## Project Structure

```
.
├── posm-gis/               # React app (current)
│   ├── amplify/             # AWS Amplify backend (Lambda + DynamoDB)
│   ├── src/
│   │   ├── components/      # UI components (sidebar, symbology, filters, legend, popups)
│   │   ├── config/          # Auth config, constants, basemaps
│   │   ├── hooks/           # React hooks (useLayers, useSession, useFilters)
│   │   ├── lib/             # Core logic (symbology, markers, labels, GeoServer API)
│   │   ├── routes/          # Page components (MapPage, SharePage, LoginPage, AdminPage)
│   │   ├── store/           # Zustand state management + Leaflet registry
│   │   └── types/           # TypeScript type definitions
│   └── docs/                # Architecture and feature documentation
│
├── legacy-vanilla-js/       # Original vanilla JS frontend (archived)
│   ├── frontend/            # HTML + JS + CSS
│   ├── configs/             # JSON config files
│   ├── docs/                # Legacy documentation
│   └── *.py                 # Python utility scripts
│
└── CLAUDE.md                # AI assistant instructions
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 7.3 |
| Mapping | Leaflet 1.9.4, leaflet.markercluster |
| State | Zustand 5.0 |
| Routing | React Router 7 |
| Backend | AWS Amplify Gen 2 (CDK) |
| Database | DynamoDB (single-table design) |
| Serverless | AWS Lambda (config + share handlers) |
| Geospatial | GeoServer WFS/WMS, PostGIS on AWS RDS |

## Features

- **Multi-workspace support** with user-based access control
- **Layer management** — discover, toggle, reorder GeoServer layers
- **Symbology** — Unique values, graduated, proportional, and rule-based styling
- **CQL Filters** — Query features by attribute with AND/OR logic
- **Labels** — Dynamic viewport-culled labels with zoom-dependent visibility
- **Popups** — Configurable feature popups with drag-to-reorder fields
- **Bookmarks** — Save and recall map views
- **Auto-save** — Debounced session persistence to DynamoDB
- **Share** — Generate read-only public links with full map state snapshot
- **Marker clustering** — Automatic clustering for large point layers (>200 features)
- **Arrow decorators** — Directional arrows for line layers

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- AWS account (for Amplify backend)
- GeoServer instance with WFS enabled

### Development

```bash
cd posm-gis
npm install
```

Create a `.env` file:

```env
VITE_GEOSERVER_URL=https://your-geoserver.com/geoserver
VITE_DYNAMO_API_URL=https://your-api-gateway.amazonaws.com
```

Start the dev server:

```bash
npm run dev
```

### Amplify Backend

```bash
npx ampx sandbox
```

This deploys the DynamoDB table and Lambda functions for config/share persistence.

### Build

```bash
npm run build
```

## Architecture

### DynamoDB Single-Table Design

| Entity | PK | SK |
|--------|----|----|
| User Config | `USER#{username}` | `CONFIG#{workspace}` |
| Share | `SHARE#{shareId}` | `SHARE#{shareId}` |

Configs are stored as JSON strings (`configJson` attribute) to avoid DynamoDB marshalling limits with deeply nested objects.

### Key Data Flow

1. **Layer Discovery**: WFS GetCapabilities -> layer list
2. **GeoJSON Fetch**: WFS GetFeature -> FeatureCollection
3. **Leaflet Rendering**: L.geoJSON with pointToLayer/style
4. **Symbology**: applySymbology() restyles sublayers based on field values
5. **Session Save**: Zustand store -> buildConfigObject() -> POST /api/config -> DynamoDB
6. **Share**: buildConfigObject() -> POST /api/share -> DynamoDB (7-day TTL)

## Legacy App

The `legacy-vanilla-js/` folder contains the original vanilla JavaScript implementation. It is archived for reference and is not actively maintained. See `legacy-vanilla-js/docs/` for its documentation.

## License

Private — POSM Software

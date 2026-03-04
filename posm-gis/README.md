# POSM GIS

A modern GIS web application for visualizing, styling, filtering, and sharing geospatial data from GeoServer. Built with React 19, TypeScript, Leaflet, and Zustand, designed for deployment on AWS Amplify.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (port 3000)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Default Credentials

| Username | Password                    | Role  |
|----------|-----------------------------|-------|
| admin    | POSMRocksGISCentral2026     | admin |

The admin user has access to all workspaces and the admin panel at `/admin`.

## Project Overview

POSM GIS connects to a GeoServer instance backed by PostgreSQL/PostGIS on AWS RDS. It discovers available layers via WFS GetCapabilities, fetches GeoJSON data, and renders it on an interactive Leaflet map with:

- **5 symbology modes** - Unique Values, Graduated, Proportional, Rules, Default
- **Server-side CQL filtering** - Filter features before they leave GeoServer
- **Marker clustering** - Automatic clustering for large point datasets (threshold: 200 features)
- **Viewport-culled labels** - RAF-chunked label rendering for performance
- **Session persistence** - Auto-save every 2 seconds to localStorage (DynamoDB in production)
- **Shareable map snapshots** - Public viewer with combined legend, no auth required
- **User/group management** - Admin panel for managing access to GeoServer workspaces
- **Map bookmarks** - Save and fly to named map positions
- **Arrow decorators** - Direction indicators on line features

## Tech Stack

| Layer            | Technology                                      |
|------------------|-------------------------------------------------|
| UI Framework     | React 19.2 + TypeScript 5.9                     |
| Build Tool       | Vite 7.3                                        |
| Mapping          | Leaflet 1.9.4 (imperative, not react-leaflet)   |
| Clustering       | leaflet.markercluster 1.5.3                     |
| Arrow Decorators | leaflet-polylinedecorator 1.6.0                 |
| State Management | Zustand 5.0                                     |
| Routing          | React Router 7.13                               |
| Auth (dev)       | SHA-256 hashed passwords in localStorage         |
| Auth (prod)      | AWS Cognito via Amplify Auth                     |
| Backend (prod)   | AWS Lambda + API Gateway + DynamoDB              |
| Hosting (prod)   | AWS Amplify Hosting (S3 + CloudFront)            |

## Why Plain Leaflet (Not react-leaflet)?

The application uses imperative Leaflet APIs extensively: `layer.setStyle()`, `layer.setIcon()`, `L.markerClusterGroup`, `L.polylineDecorator`, and viewport-culled label managers with `requestAnimationFrame` chunking. These patterns fight against react-leaflet's declarative model. Keeping imperative Leaflet in `useRef`/`useEffect` is more pragmatic and faithful to the original vanilla JS codebase.

## Available Scripts

| Command           | Description                              |
|-------------------|------------------------------------------|
| `npm run dev`     | Start Vite dev server on port 3000       |
| `npm run build`   | TypeScript check + production build      |
| `npm run lint`    | Run ESLint                               |
| `npm run preview` | Preview the production build locally     |

## Environment Variables

Create a `.env` file in the project root (one is already provided):

```bash
# GeoServer instance URL (proxied through Vite in dev, Lambda in prod)
VITE_GEOSERVER_URL=http://13.58.149.42:8080/geoserver

# API base path (for config and share endpoints)
VITE_API_URL=/api

# AWS region for Amplify services
VITE_AWS_REGION=us-east-2
```

## Project Structure

```
posm-gis/
├── src/
│   ├── main.tsx                     # React entry point
│   ├── App.tsx                      # Router + auth guard
│   ├── App.css                      # Global dark theme styles
│   ├── config/
│   │   ├── auth.ts                  # Authentication system
│   │   └── constants.ts             # Colors, basemaps, GeoServer URLs
│   ├── types/                       # TypeScript interfaces
│   ├── store/                       # Zustand store + Leaflet registry
│   ├── lib/                         # Pure logic modules (no React)
│   ├── hooks/                       # React hooks (layers, filters, session)
│   ├── routes/                      # Page components
│   └── components/                  # UI components (sidebar, symbology, etc.)
├── docs/                            # Detailed documentation
├── .env                             # Environment variables
├── vite.config.ts                   # Dev server + proxy config
└── package.json
```

## Documentation

| Document | Description |
|----------|-------------|
| [docs/architecture.md](docs/architecture.md) | System architecture, data flow, state management |
| [docs/features.md](docs/features.md) | Detailed feature reference with usage |
| [docs/api-reference.md](docs/api-reference.md) | Module-level API reference (all exports and signatures) |
| [docs/deployment.md](docs/deployment.md) | AWS Amplify deployment guide |
| [docs/development.md](docs/development.md) | Developer guide, conventions, adding new features |

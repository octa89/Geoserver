import type { FeatureCollection } from 'geojson';

const GEOSERVER_BASE = import.meta.env.VITE_GEOSERVER_BASE || '/api/geoserver';

// GeoServer REST admin credentials (needed for /rest/ endpoints)
const GS_ADMIN_USER = import.meta.env.VITE_GS_ADMIN_USER || 'admin';
const GS_ADMIN_PASS = import.meta.env.VITE_GS_ADMIN_PASS || 'geoserver';

export interface GeoServerLayer {
  shortName: string;
  fullName: string;
  label: string;
  workspace: string;
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

/**
 * Parse a WFS GetCapabilities XML response and extract FeatureType entries.
 * Returns an array of { name, title } pairs.
 */
function parseCapabilitiesXml(
  xmlText: string
): Array<{ name: string; title: string }> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const featureTypes = Array.from(
    doc.getElementsByTagNameNS('*', 'FeatureType')
  );

  return featureTypes.map((ft) => {
    const nameEl = ft.getElementsByTagNameNS('*', 'Name')[0];
    const titleEl = ft.getElementsByTagNameNS('*', 'Title')[0];
    return {
      name: nameEl?.textContent?.trim() ?? '',
      title: titleEl?.textContent?.trim() ?? '',
    };
  });
}

/**
 * Extract an error message from a GeoServer XML error response.
 * GeoServer may return HTTP 200 with an XML body containing either:
 * - <ExceptionText> (OWS Exception Report)
 * - <ServiceException> (WFS 1.0 style)
 */
function extractXmlError(xmlText: string): string | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');

    const exceptionText =
      doc.getElementsByTagNameNS('*', 'ExceptionText')[0] ??
      doc.getElementsByTagNameNS('*', 'ServiceException')[0];

    return exceptionText?.textContent?.trim() ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Discover all available workspaces from GeoServer.
 * Tries the REST API first, falls back to WFS GetCapabilities parsing.
 */
export async function discoverAllWorkspaces(): Promise<string[]> {
  // Try REST API first (requires GeoServer admin credentials)
  try {
    const resp = await fetch(`${GEOSERVER_BASE}/rest/workspaces.json`, {
      headers: {
        'Authorization': 'Basic ' + btoa(`${GS_ADMIN_USER}:${GS_ADMIN_PASS}`),
        'Accept': 'application/json',
      },
    });
    if (resp.ok) {
      const data = await resp.json();
      const workspaces = data?.workspaces?.workspace;
      if (Array.isArray(workspaces)) {
        return workspaces.map((w: { name: string }) => w.name).sort();
      }
    }
  } catch {
    // REST API not available, try WFS fallback
  }

  // Fallback: parse WFS GetCapabilities to extract workspace prefixes
  try {
    const resp = await fetch(
      `${GEOSERVER_BASE}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`
    );
    if (resp.ok) {
      const xmlText = await resp.text();
      const types = parseCapabilitiesXml(xmlText);
      const wsSet = new Set<string>();
      for (const t of types) {
        const colonIdx = t.name.indexOf(':');
        if (colonIdx !== -1) {
          wsSet.add(t.name.substring(0, colonIdx));
        }
      }
      return Array.from(wsSet).sort();
    }
  } catch {
    // Both methods failed
  }

  return [];
}

/**
 * Fetch WFS GetCapabilities for a single workspace and return its layer list.
 */
export async function discoverWorkspaceLayers(
  workspace: string
): Promise<GeoServerLayer[]> {
  const url =
    `${GEOSERVER_BASE}/${workspace}/wfs` +
    `?service=WFS&version=1.1.0&request=GetCapabilities`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `GetCapabilities failed for workspace "${workspace}": HTTP ${response.status}`
    );
  }

  const xmlText = await response.text();
  const types = parseCapabilitiesXml(xmlText);

  return types
    .filter((t) => t.name)
    .map((t) => {
      // GeoServer typically returns names as "workspace:shortName"
      const colonIdx = t.name.indexOf(':');
      const shortName =
        colonIdx !== -1 ? t.name.substring(colonIdx + 1) : t.name;

      return {
        shortName,
        fullName: t.name,
        label: t.title || shortName,
        workspace,
      };
    });
}

/**
 * Discover layers across multiple workspaces in parallel.
 * When more than one workspace is provided the label is prefixed with the
 * workspace name to avoid collisions in UI lists.
 */
export async function discoverLayers(
  workspaces: string[]
): Promise<GeoServerLayer[]> {
  const results = await Promise.allSettled(
    workspaces.map((ws) => discoverWorkspaceLayers(ws))
  );

  const layers: GeoServerLayer[] = [];
  const multiWorkspace = workspaces.length > 1;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const layer of result.value) {
        layers.push(
          multiWorkspace
            ? { ...layer, label: `${layer.workspace}: ${layer.label}` }
            : layer
        );
      }
    }
    // Silently skip failed workspaces; callers can add their own error handling
  }

  return layers;
}

/**
 * Fetch GeoJSON features for a fully-qualified WFS layer name.
 *
 * The workspace is inferred from the `fullName` (e.g. "posm:roads" -> "posm").
 * An optional CQL_FILTER can be passed for server-side filtering.
 *
 * Throws if the server returns an XML error body (GeoServer 200 + XML trick).
 */
export async function fetchLayerGeoJSON(
  fullName: string,
  cqlFilter?: string
): Promise<FeatureCollection> {
  // Derive workspace from fullName ("workspace:layer" format)
  const colonIdx = fullName.indexOf(':');
  const workspace = colonIdx !== -1 ? fullName.substring(0, colonIdx) : '';

  const workspacePath = workspace ? `/${workspace}` : '';

  let url =
    `${GEOSERVER_BASE}${workspacePath}/wfs` +
    `?service=WFS&version=1.0.0&request=GetFeature` +
    `&typeName=${encodeURIComponent(fullName)}` +
    `&outputFormat=application/json` +
    `&srsName=EPSG:4326`;

  if (cqlFilter) {
    url += `&CQL_FILTER=${encodeURIComponent(cqlFilter)}`;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `WFS GetFeature failed for "${fullName}": HTTP ${response.status}`
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();

  // GeoServer may return HTTP 200 with an XML error body instead of JSON
  if (
    contentType.includes('xml') ||
    contentType.includes('text/') ||
    text.trimStart().startsWith('<')
  ) {
    const xmlError = extractXmlError(text);
    throw new Error(
      xmlError
        ? `GeoServer error for "${fullName}": ${xmlError}`
        : `GeoServer returned an unexpected non-JSON response for "${fullName}"`
    );
  }

  const geojson: FeatureCollection = JSON.parse(text);
  return geojson;
}

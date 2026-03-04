import type { FeatureCollection } from 'geojson';

/**
 * Extract a deduplicated, alphabetically-sorted list of property field names
 * found across the first 50 features of the collection.
 */
export function extractFields(geojson: FeatureCollection): string[] {
  const fieldSet = new Set<string>();

  const limit = Math.min(50, geojson.features.length);
  for (let i = 0; i < limit; i++) {
    const props = geojson.features[i].properties;
    if (props && typeof props === 'object') {
      for (const key of Object.keys(props)) {
        fieldSet.add(key);
      }
    }
  }

  return Array.from(fieldSet).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
}

/**
 * Return the geometry type of the first feature that has a non-null geometry,
 * or 'Unknown' if none is found.
 *
 * GeoJSON geometry types: 'Point', 'MultiPoint', 'LineString',
 * 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'
 */
export function detectGeomType(geojson: FeatureCollection): string {
  for (const feature of geojson.features) {
    if (feature.geometry && feature.geometry.type) {
      return feature.geometry.type;
    }
  }
  return 'Unknown';
}

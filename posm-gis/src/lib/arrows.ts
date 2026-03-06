import L from 'leaflet';
import 'leaflet-polylinedecorator';

/**
 * Add arrowhead decorators along all line segments of a GeoJSON layer.
 *
 * Arrows are placed at the 100% offset (end of each segment) using
 * leaflet-polylinedecorator, which extends L globally with
 * L.polylineDecorator and L.Symbol.arrowHead.
 *
 * Returns the array of decorator layers added to the map.
 */
export function addArrowDecorators(
  map: L.Map,
  _layerName: string,
  leafletLayer: L.GeoJSON,
  color: string
): L.Layer[] {
  const decorators: L.Layer[] = [];

  leafletLayer.eachLayer((sublayer) => {
    // Only decorate polyline-like layers
    if (
      !(sublayer instanceof L.Polyline) &&
      !(sublayer instanceof L.Polygon)
    ) {
      return;
    }

    // leaflet-polylinedecorator extends L with polylineDecorator at runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const LD = L as any;

    if (typeof LD.polylineDecorator !== 'function') {
      console.warn('leaflet-polylinedecorator is not available on L');
      return;
    }

    const decorator: L.Layer = LD.polylineDecorator(sublayer, {
      patterns: [
        {
          offset: '50%',
          repeat: 0,
          symbol: LD.Symbol.arrowHead({
            pixelSize: 12,
            polygon: false,
            pathOptions: {
              color,
              weight: 2,
              opacity: 0.9,
            },
          }),
        },
      ],
    });

    decorator.addTo(map);
    decorators.push(decorator);
  });

  return decorators;
}

/**
 * Remove an array of decorator layers from the map.
 */
export function removeArrowDecorators(
  map: L.Map,
  decorators: L.Layer[]
): void {
  for (const dec of decorators) {
    if (map.hasLayer(dec)) {
      map.removeLayer(dec);
    }
  }
}

/**
 * Toggle arrow decorators on or off.
 *
 * - If show=true, removes any existing decorators for this layer and adds
 *   fresh ones, returning the new array.
 * - If show=false, removes all existing decorators and returns an empty array.
 *
 * Always pass `currentDecorators` so stale decorators are cleaned up
 * before re-adding.
 */
export function toggleArrows(
  map: L.Map,
  layerName: string,
  leafletLayer: L.GeoJSON,
  color: string,
  show: boolean,
  currentDecorators: L.Layer[]
): L.Layer[] {
  // Always clean up existing decorators first
  removeArrowDecorators(map, currentDecorators);

  if (!show) {
    return [];
  }

  return addArrowDecorators(map, layerName, leafletLayer, color);
}

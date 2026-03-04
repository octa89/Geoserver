import L from 'leaflet';

/**
 * Generate an SVG string for a point symbol.
 *
 * Supported symbolTypes: 'circle', 'square', 'triangle', 'diamond', 'star', 'cross'
 * The viewBox is always 0 0 100 100 so that size is controlled by the container.
 */
export function pointSVG(
  symbolType: string,
  fill: string,
  stroke: string,
  size: number
): string {
  const sw = Math.max(2, Math.round(size * 0.1)); // stroke-width scales with size
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"`;

  let inner: string;

  switch (symbolType) {
    case 'square':
      inner = `<rect x="10" y="10" width="80" height="80" ${common} />`;
      break;

    case 'triangle': {
      // Equilateral-ish triangle pointing up
      const pts = '50,8 92,92 8,92';
      inner = `<polygon points="${pts}" ${common} />`;
      break;
    }

    case 'diamond': {
      const pts = '50,5 95,50 50,95 5,50';
      inner = `<polygon points="${pts}" ${common} />`;
      break;
    }

    case 'star': {
      // 5-point star using outer radius 46 and inner radius 19
      const cx = 50;
      const cy = 50;
      const outerR = 46;
      const innerR = 19;
      const points: string[] = [];
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        points.push(
          `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`
        );
      }
      inner = `<polygon points="${points.join(' ')}" ${common} />`;
      break;
    }

    case 'cross': {
      // Two overlapping rectangles forming a + shape
      inner = [
        `<rect x="38" y="8" width="24" height="84" ${common} />`,
        `<rect x="8" y="38" width="84" height="24" ${common} />`,
      ].join('');
      break;
    }

    default:
      // circle
      inner = `<circle cx="50" cy="50" r="42" ${common} />`;
      break;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${inner}</svg>`;
}

/**
 * Create a Leaflet marker for a point feature.
 *
 * - 'circle' -> L.circleMarker (native canvas rendering, most performant)
 * - all others -> L.marker with a DivIcon containing the SVG string
 */
export function createPointMarker(
  latlng: L.LatLng,
  symbolType: string,
  fillColor: string,
  borderColor: string,
  size: number = 10
): L.CircleMarker | L.Marker {
  if (symbolType === 'circle') {
    return L.circleMarker(latlng, {
      radius: size / 2,
      fillColor,
      color: borderColor,
      weight: Math.max(1, Math.round(size * 0.1)),
      fillOpacity: 0.85,
      opacity: 1,
    });
  }

  const svg = pointSVG(symbolType, fillColor, borderColor, size);

  const icon = L.divIcon({
    html: svg,
    className: 'posm-point-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

  return L.marker(latlng, { icon });
}

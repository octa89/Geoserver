(function(POSM) {
    'use strict';

    POSM.pointSVG = function(symbolType, fill, stroke, size) {
        var s = size, h = s / 2;
        switch (symbolType) {
            case 'square':
                return '<svg width="' + s + '" height="' + s + '"><rect x="1" y="1" width="' + (s-2) + '" height="' + (s-2) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.5"/></svg>';
            case 'triangle':
                return '<svg width="' + s + '" height="' + s + '"><polygon points="' + h + ',1 ' + (s-1) + ',' + (s-1) + ' 1,' + (s-1) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.5"/></svg>';
            case 'diamond':
                return '<svg width="' + s + '" height="' + s + '"><polygon points="' + h + ',1 ' + (s-1) + ',' + h + ' ' + h + ',' + (s-1) + ' 1,' + h + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.5"/></svg>';
            case 'star': {
                var pts = [];
                for (var i = 0; i < 5; i++) {
                    var aOuter = (i * 72 - 90) * Math.PI / 180;
                    var aInner = ((i * 72) + 36 - 90) * Math.PI / 180;
                    pts.push((h + (h-1)*Math.cos(aOuter)) + ',' + (h + (h-1)*Math.sin(aOuter)));
                    pts.push((h + (h*0.4)*Math.cos(aInner)) + ',' + (h + (h*0.4)*Math.sin(aInner)));
                }
                return '<svg width="' + s + '" height="' + s + '"><polygon points="' + pts.join(' ') + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1"/></svg>';
            }
            case 'cross': {
                var t = s * 0.28;
                return '<svg width="' + s + '" height="' + s + '"><rect x="' + ((s-t)/2) + '" y="1" width="' + t + '" height="' + (s-2) + '" rx="1" fill="' + fill + '" stroke="' + stroke + '" stroke-width="0.8"/><rect x="1" y="' + ((s-t)/2) + '" width="' + (s-2) + '" height="' + t + '" rx="1" fill="' + fill + '" stroke="' + stroke + '" stroke-width="0.8"/></svg>';
            }
            default:
                return '<svg width="' + s + '" height="' + s + '"><circle cx="' + h + '" cy="' + h + '" r="' + (h-1) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.5"/></svg>';
        }
    };

    POSM.createPointMarker = function(latlng, symbolType, fillColor, borderColor, size) {
        size = size || 14;
        var half = size / 2;
        if (!symbolType || symbolType === 'circle') {
            return L.circleMarker(latlng, {
                radius: half, fillColor: fillColor, color: borderColor,
                weight: 1.5, opacity: 1, fillOpacity: 0.7
            });
        }
        var svg = POSM.pointSVG(symbolType, fillColor, borderColor, size);
        var icon = L.divIcon({
            html: svg,
            className: 'custom-point-icon',
            iconSize: [size, size],
            iconAnchor: [half, half]
        });
        return L.marker(latlng, { icon: icon });
    };

})(window.POSM);

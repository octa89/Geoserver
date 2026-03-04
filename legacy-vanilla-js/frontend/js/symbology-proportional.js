(function(POSM) {
    'use strict';

    // opts: { field, minSize, maxSize }
    POSM.applyProportional = function(layerName, opts) {
        var info = POSM.layerData[layerName];
        if (!info || !info.geojson) return;

        var field = opts.field;
        var minSize = opts.minSize || 4;
        var maxSize = opts.maxSize || 24;

        // Get value range
        var values = POSM.extractNumericValues(info.geojson, field);
        if (values.length === 0) return;

        var minVal = values[0];
        var maxVal = values[values.length - 1];
        var range = maxVal - minVal;

        // Store symbology
        info.symbology = { mode: 'proportional', field: field, minSize: minSize, maxSize: maxSize, minVal: minVal, maxVal: maxVal };
        POSM.state.activeSymbology = { layerName: layerName, mode: 'proportional' };

        var isPoint = (info.geomType === 'Point' || info.geomType === 'MultiPoint');
        var isLine = (info.geomType === 'LineString' || info.geomType === 'MultiLineString');
        var baseColor = info.color || '#3388ff';

        info.leafletLayer.eachLayer(function(layer) {
            var props = layer.feature.properties || {};
            var val = props[field];
            var n = (val === null || val === undefined) ? NaN : Number(val);

            if (isNaN(n)) {
                // Unclassifiable: default small size
                if (isPoint && layer.setStyle) {
                    layer.setStyle({ radius: minSize, fillColor: '#888', color: '#555', fillOpacity: 0.6 });
                } else if (isLine && layer.setStyle) {
                    layer.setStyle({ weight: 1, color: '#888', opacity: 0.6 });
                }
                return;
            }

            var t = range > 0 ? (n - minVal) / range : 0.5;
            t = Math.max(0, Math.min(1, t));

            if (isPoint) {
                var radius = minSize + t * (maxSize - minSize);
                if (layer.setRadius) {
                    layer.setRadius(radius);
                    layer.setStyle({ fillColor: baseColor, color: POSM.darkenColor(baseColor), fillOpacity: 0.7 });
                } else if (layer.setIcon) {
                    var sz = Math.round(radius * 2);
                    var svg = '<svg width="' + sz + '" height="' + sz + '"><circle cx="' + (sz/2) + '" cy="' + (sz/2) + '" r="' + (sz/2 - 1) + '" fill="' + baseColor + '" fill-opacity="0.7" stroke="' + POSM.darkenColor(baseColor) + '" stroke-width="1"/></svg>';
                    layer.setIcon(L.divIcon({
                        html: svg,
                        className: 'custom-point-icon',
                        iconSize: [sz, sz],
                        iconAnchor: [sz/2, sz/2]
                    }));
                }
            } else if (isLine && layer.setStyle) {
                var weight = minSize + t * (maxSize - minSize);
                layer.setStyle({ weight: weight, color: baseColor, opacity: 0.8 });
            } else if (layer.setStyle) {
                // Polygon: vary opacity
                var opacity = 0.2 + t * 0.6;
                layer.setStyle({ fillColor: baseColor, color: POSM.darkenColor(baseColor), weight: 2, fillOpacity: opacity, opacity: 1 });
            }
        });

        // Rebuild arrows if active
        if (info.showArrows) {
            POSM.removeArrowDecorators(layerName);
            POSM.addArrowDecorators(layerName);
        }

        // Legend
        POSM.updateLegendProportional(minVal, maxVal, minSize, maxSize, field, baseColor);

        // Update swatch
        var swatchEl = document.getElementById('swatch-' + layerName);
        if (swatchEl) {
            swatchEl.innerHTML = POSM.createSwatchSVG(info.geomType, baseColor, info.pointSymbol);
        }
    };

})(window.POSM);

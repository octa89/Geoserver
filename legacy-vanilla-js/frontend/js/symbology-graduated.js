(function(POSM) {
    'use strict';

    // opts: { field, method, nClasses, ramp }
    POSM.applyGraduated = function(layerName, opts) {
        var info = POSM.layerData[layerName];
        if (!info || !info.geojson) return;

        var field = opts.field;
        var method = opts.method || 'equalInterval';
        var nClasses = opts.nClasses || 5;
        var ramp = opts.ramp || 'Blues';

        // Extract numeric values
        var values = POSM.extractNumericValues(info.geojson, field);
        if (values.length === 0) return;

        // Classify
        var breaks;
        switch (method) {
            case 'quantile': breaks = POSM.classifyQuantile(values, nClasses); break;
            case 'jenks':    breaks = POSM.classifyJenks(values, nClasses); break;
            default:         breaks = POSM.classifyEqualInterval(values, nClasses); break;
        }

        // Generate colors
        var colors = POSM.generateRampColors(ramp, nClasses);

        // Store symbology
        info.symbology = { mode: 'graduated', field: field, method: method, nClasses: nClasses, ramp: ramp, breaks: breaks, colors: colors };
        POSM.state.activeSymbology = { layerName: layerName, mode: 'graduated' };

        // Restyle
        var sym = info.pointSymbol || 'circle';
        info.leafletLayer.eachLayer(function(layer) {
            var props = layer.feature.properties || {};
            var val = props[field];
            var n = (val === null || val === undefined) ? NaN : Number(val);
            var color;
            if (isNaN(n)) {
                color = '#888'; // unclassifiable
            } else {
                var classIdx = POSM.classifyValue(n, breaks);
                color = colors[classIdx] || '#888';
            }
            POSM._applyStyleToLayer(layer, color, info.geomType, sym);
        });

        // Rebuild arrows if active
        if (info.showArrows) {
            POSM.removeArrowDecorators(layerName);
            POSM.addArrowDecorators(layerName);
        }

        // Update legend
        POSM.updateLegendGraduated(breaks, colors, field, info.geomType);

        // Update swatch
        var swatchEl = document.getElementById('swatch-' + layerName);
        if (swatchEl) {
            var usedColors = colors.slice(0, 4);
            swatchEl.innerHTML = POSM.createMultiSwatchSVG(info.geomType, usedColors);
        }
    };

})(window.POSM);

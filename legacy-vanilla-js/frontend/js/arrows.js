(function(POSM) {
    'use strict';

    POSM.addArrowDecorators = function(layerName) {
        var info = POSM.layerData[layerName];
        if (!info || !info.leafletLayer) return;
        if (!info.arrowDecorators) info.arrowDecorators = [];

        info.leafletLayer.eachLayer(function(layer) {
            if (layer.getLatLngs) {
                var lineColor = (layer.options && layer.options.color) || info.color || '#3388ff';
                var dec = L.polylineDecorator(layer, {
                    patterns: [{
                        offset: '100%',
                        repeat: 0,
                        symbol: L.Symbol.arrowHead({
                            pixelSize: 12,
                            polygon: true,
                            pathOptions: {
                                fillOpacity: 1,
                                weight: 0,
                                color: lineColor
                            }
                        })
                    }]
                });
                dec.addTo(POSM.map);
                info.arrowDecorators.push(dec);
            }
        });
    };

    POSM.removeArrowDecorators = function(layerName) {
        var info = POSM.layerData[layerName];
        if (!info || !info.arrowDecorators) return;
        info.arrowDecorators.forEach(function(d) { POSM.map.removeLayer(d); });
        info.arrowDecorators = [];
    };

    POSM.toggleArrows = function(layerName, show) {
        var info = POSM.layerData[layerName];
        if (!info) return;
        info.showArrows = show;

        if (show) {
            POSM.addArrowDecorators(layerName);
        } else {
            POSM.removeArrowDecorators(layerName);
        }
    };

})(window.POSM);

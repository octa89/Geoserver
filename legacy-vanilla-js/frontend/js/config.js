// ---- POSM Namespace ----
window.POSM = window.POSM || {};

(function(POSM) {
    'use strict';

    // ---- CONFIGURATION ----
    POSM.CONFIG = {
        GEOSERVER_URL: '/geoserver',
        WORKSPACES: [],  // populated at runtime from user's group

        // Build WFS URL for a given workspace
        wfsUrl: function(workspace) {
            return this.GEOSERVER_URL + '/' + workspace + '/wfs';
        },
        wfsCapsUrl: function(workspace) {
            return this.wfsUrl(workspace) + '?service=WFS&version=1.1.0&request=GetCapabilities';
        },

        // Legacy getters (use first workspace as default)
        get WORKSPACE() {
            return this.WORKSPACES[0] || 'POSM_GIS';
        },
        get WFS_URL() {
            return this.wfsUrl(this.WORKSPACE);
        },
        get WFS_CAPS_URL() {
            return this.wfsCapsUrl(this.WORKSPACE);
        }
    };

    // ---- COLOR PALETTE (25 distinct colors) ----
    POSM.COLOR_PALETTE = [
        '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
        '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990',
        '#dcbeff', '#9A6324', '#fffac8', '#800000', '#aaffc3',
        '#808000', '#ffd8b1', '#000075', '#a9a9a9', '#e6beff',
        '#1abc9c', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6'
    ];

    // Default colors per layer
    POSM.LAYER_COLORS = [
        '#3388ff', '#e6194b', '#3cb44b', '#f58231', '#911eb4',
        '#42d4f4', '#f032e6', '#469990', '#e74c3c', '#2ecc71',
        '#9b59b6', '#4363d8', '#bfef45', '#800000', '#808000',
        '#000075', '#9A6324', '#1abc9c', '#aaffc3', '#ffd8b1'
    ];

    // ---- SHARED STATE ----
    POSM.layerData = {};
    POSM.state = {
        activeSymbology: null,
        layerIndex: 0
    };

    // ---- COLOR RAMPS (14 ramps, each 2-4 hex stops) ----
    POSM.COLOR_RAMPS = {
        Blues:      ['#deebf7', '#3182bd'],
        Reds:       ['#fee0d2', '#de2d26'],
        Greens:     ['#e5f5e0', '#31a354'],
        Oranges:    ['#feedde', '#e6550d'],
        Purples:    ['#efedf5', '#756bb1'],
        YlOrRd:     ['#ffffb2', '#fd8d3c', '#bd0026'],
        YlGnBu:     ['#edf8b1', '#7fcdbb', '#2c7fb8'],
        RdYlGn:     ['#d73027', '#fee08b', '#1a9850'],
        Spectral:   ['#d53e4f', '#fee08b', '#3288bd'],
        Viridis:    ['#440154', '#21918c', '#fde725'],
        Plasma:     ['#0d0887', '#cc4778', '#f0f921'],
        Greys:      ['#f0f0f0', '#636363'],
        PinkYellow: ['#c51b7d', '#f7f7f7', '#4d9221'],
        CyanDark:   ['#00ffff', '#003366']
    };

    // ---- COLOR INTERPOLATION ----
    POSM.interpolateColor = function(c1, c2, t) {
        var r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
        var r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
        var r = Math.round(r1 + (r2 - r1) * t);
        var g = Math.round(g1 + (g2 - g1) * t);
        var b = Math.round(b1 + (b2 - b1) * t);
        return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
    };

    POSM.generateRampColors = function(rampKey, n) {
        var stops = POSM.COLOR_RAMPS[rampKey];
        if (!stops) stops = POSM.COLOR_RAMPS.Blues;
        if (n <= 1) return [stops[0]];
        var colors = [];
        for (var i = 0; i < n; i++) {
            var t = i / (n - 1);
            var segCount = stops.length - 1;
            var seg = Math.min(Math.floor(t * segCount), segCount - 1);
            var localT = (t * segCount) - seg;
            colors.push(POSM.interpolateColor(stops[seg], stops[seg + 1], localT));
        }
        return colors;
    };

    POSM.drawRamp = function(canvas, rampKey) {
        var stops = POSM.COLOR_RAMPS[rampKey];
        if (!stops || !canvas) return;
        var ctx = canvas.getContext('2d');
        var w = canvas.width, h = canvas.height;
        var grad = ctx.createLinearGradient(0, 0, w, 0);
        stops.forEach(function(c, i) {
            grad.addColorStop(i / (stops.length - 1), c);
        });
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    };

    POSM.isNumericField = function(geojson, field) {
        if (!geojson || !geojson.features) return false;
        var count = 0, numeric = 0;
        for (var i = 0; i < geojson.features.length && count < 100; i++) {
            var val = geojson.features[i].properties ? geojson.features[i].properties[field] : null;
            if (val === null || val === undefined || val === '') continue;
            count++;
            if (typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '')) numeric++;
        }
        return count > 0 && (numeric / count) > 0.8;
    };

    // ---- DATE FIELD DETECTION ----
    var DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
    POSM.isDateField = function(geojson, field) {
        if (!geojson || !geojson.features) return false;
        var count = 0, dateCount = 0;
        for (var i = 0; i < geojson.features.length && count < 100; i++) {
            var val = geojson.features[i].properties ? geojson.features[i].properties[field] : null;
            if (val === null || val === undefined || val === '') continue;
            count++;
            var s = String(val);
            if (DATE_RE.test(s) && !isNaN(new Date(s).getTime())) dateCount++;
        }
        return count > 0 && (dateCount / count) > 0.8;
    };

    // ---- COLOR UTILITY ----
    POSM.darkenColor = function(hex) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        var factor = 0.6;
        return '#' +
            Math.round(r * factor).toString(16).padStart(2, '0') +
            Math.round(g * factor).toString(16).padStart(2, '0') +
            Math.round(b * factor).toString(16).padStart(2, '0');
    };

})(window.POSM);

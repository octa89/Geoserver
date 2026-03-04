(function(POSM) {
    'use strict';

    // Extract sorted numeric values from a GeoJSON field
    POSM.extractNumericValues = function(geojson, field) {
        if (!geojson || !geojson.features) return [];
        var vals = [];
        geojson.features.forEach(function(f) {
            var v = f.properties ? f.properties[field] : null;
            if (v === null || v === undefined || v === '') return;
            var n = Number(v);
            if (!isNaN(n)) vals.push(n);
        });
        vals.sort(function(a, b) { return a - b; });
        return vals;
    };

    // Equal Interval: divide range into n equal classes
    POSM.classifyEqualInterval = function(values, n) {
        if (values.length === 0) return [];
        var min = values[0], max = values[values.length - 1];
        var step = (max - min) / n;
        var breaks = [min];
        for (var i = 1; i < n; i++) {
            breaks.push(min + step * i);
        }
        breaks.push(max);
        return breaks;
    };

    // Quantile: each class has roughly equal count
    POSM.classifyQuantile = function(values, n) {
        if (values.length === 0) return [];
        var breaks = [values[0]];
        for (var i = 1; i < n; i++) {
            var idx = Math.round(i * values.length / n) - 1;
            breaks.push(values[Math.min(idx, values.length - 1)]);
        }
        breaks.push(values[values.length - 1]);
        return breaks;
    };

    // Jenks Natural Breaks (Fisher-Jenks DP)
    POSM.classifyJenks = function(values, n) {
        if (values.length === 0) return [];
        if (values.length <= n) {
            var b = [values[0]];
            for (var x = 1; x < values.length; x++) b.push(values[x]);
            return b;
        }

        // Sample if too large
        var data = values;
        if (data.length > 1000) {
            var sampled = [];
            var step = data.length / 1000;
            for (var s = 0; s < 1000; s++) {
                sampled.push(data[Math.floor(s * step)]);
            }
            data = sampled;
        }

        var len = data.length;
        var lowerClassLimits = [];
        var varianceCombinations = [];

        for (var i = 0; i <= len; i++) {
            var row1 = [], row2 = [];
            for (var j = 0; j <= n; j++) {
                row1.push(0);
                row2.push(Infinity);
            }
            lowerClassLimits.push(row1);
            varianceCombinations.push(row2);
        }

        for (var ci = 1; ci <= n; ci++) {
            varianceCombinations[0][ci] = 0;
            lowerClassLimits[1][ci] = 1;
        }

        for (var l = 2; l <= len; l++) {
            var sumZ = 0, sumZ2 = 0, w = 0;
            for (var m = 1; m <= l; m++) {
                var lowerIdx = l - m + 1;
                var val = data[lowerIdx - 1];
                w++;
                sumZ += val;
                sumZ2 += val * val;
                var variance = sumZ2 - (sumZ * sumZ) / w;

                if (lowerIdx > 1) {
                    for (var k = 2; k <= n; k++) {
                        var prevVar = varianceCombinations[lowerIdx - 1][k - 1];
                        if (prevVar + variance < varianceCombinations[l][k]) {
                            lowerClassLimits[l][k] = lowerIdx;
                            varianceCombinations[l][k] = prevVar + variance;
                        }
                    }
                }
            }
            lowerClassLimits[l][1] = 1;
            varianceCombinations[l][1] = sumZ2 - (sumZ * sumZ) / w;
        }

        // Extract breaks
        var kClass = [];
        for (var q = 0; q <= n; q++) kClass.push(0);
        kClass[n] = len;
        var k2 = n;
        while (k2 > 1) {
            kClass[k2 - 1] = lowerClassLimits[kClass[k2]][k2] - 1;
            k2--;
        }

        var breaks = [data[0]];
        for (var r = 1; r < n; r++) {
            breaks.push(data[kClass[r]]);
        }
        breaks.push(data[len - 1]);
        return breaks;
    };

    // Determine class index for a given value
    POSM.classifyValue = function(value, breaks) {
        for (var i = 1; i < breaks.length; i++) {
            if (value <= breaks[i]) return i - 1;
        }
        return breaks.length - 2;
    };

})(window.POSM);

(function(POSM) {
    'use strict';

    // ---- SVG SWATCH for layer panel ----
    POSM.createSwatchSVG = function(geomType, color, symbolType) {
        var c = color || '#3388ff';
        var border = POSM.darkenColor(c);
        if (geomType === 'Point' || geomType === 'MultiPoint') {
            return POSM.pointSVG(symbolType || 'circle', c, border, 18);
        } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
            return '<svg width="20" height="14"><polyline points="0,11 8,3 20,11" fill="none" stroke="' + c + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        } else {
            return '<svg width="18" height="16"><rect x="1" y="1" width="16" height="14" rx="2" fill="' + c + '" fill-opacity="0.5" stroke="' + border + '" stroke-width="1.5"/></svg>';
        }
    };

    // ---- MULTI-COLOR SWATCH (when symbology applied) ----
    POSM.createMultiSwatchSVG = function(geomType, colors) {
        var cols = colors.slice(0, 4);
        if (geomType === 'Point' || geomType === 'MultiPoint') {
            if (cols.length === 1) return POSM.createSwatchSVG(geomType, cols[0]);
            var parts = cols.map(function(c, i) {
                var cx = 9 + (i < 2 ? (i === 0 ? -3 : 3) : (i === 2 ? 3 : -3));
                var cy = 9 + (i < 2 ? -3 : 3);
                return '<circle cx="' + cx + '" cy="' + cy + '" r="4" fill="' + c + '" stroke="' + POSM.darkenColor(c) + '" stroke-width="0.8"/>';
            });
            return '<svg width="18" height="18">' + parts.join('') + '</svg>';
        } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
            var lines = cols.map(function(c, i) {
                var y = 2 + i * 3;
                return '<line x1="0" y1="' + y + '" x2="20" y2="' + y + '" stroke="' + c + '" stroke-width="2" stroke-linecap="round"/>';
            });
            return '<svg width="20" height="14">' + lines.join('') + '</svg>';
        } else {
            var w = 16 / cols.length;
            var rects = cols.map(function(c, i) {
                return '<rect x="' + (1 + i * w) + '" y="1" width="' + w + '" height="14" fill="' + c + '" fill-opacity="0.6"/>';
            });
            return '<svg width="18" height="16"><rect x="1" y="1" width="16" height="14" rx="2" fill="none" stroke="#555" stroke-width="1"/>' + rects.join('') + '</svg>';
        }
    };

    // ---- SHARED STYLE HELPER ----
    POSM._applyStyleToLayer = function(layer, color, geomType, pointSymbol) {
        var border = POSM.darkenColor(color);
        var isPoint = (geomType === 'Point' || geomType === 'MultiPoint');
        var sym = pointSymbol || 'circle';

        if (isPoint) {
            if (sym === 'circle' && layer.setStyle) {
                layer.setStyle({ fillColor: color, color: border, fillOpacity: 0.8 });
            } else if (layer.setIcon) {
                var svg = POSM.pointSVG(sym, color, border, 14);
                var icon = L.divIcon({
                    html: svg,
                    className: 'custom-point-icon',
                    iconSize: [14, 14],
                    iconAnchor: [7, 7]
                });
                layer.setIcon(icon);
            }
        } else if (layer.setStyle) {
            if (geomType === 'LineString' || geomType === 'MultiLineString') {
                layer.setStyle({ color: color, weight: 3, opacity: 0.9 });
            } else {
                layer.setStyle({ fillColor: color, color: border, weight: 2, fillOpacity: 0.5, opacity: 1 });
            }
        }
    };

    // ---- DISPATCHER ----
    POSM.applySymbology = function(layerName, opts) {
        // Backward compatibility: if opts is a string, treat as unique values field
        if (typeof opts === 'string') opts = { mode: 'unique', field: opts };
        if (!opts.mode) opts.mode = 'unique';

        switch (opts.mode) {
            case 'unique':       return POSM.applyUniqueValues(layerName, opts.field, opts.groupByYear);
            case 'graduated':    return POSM.applyGraduated(layerName, opts);
            case 'proportional': return POSM.applyProportional(layerName, opts);
            case 'rules':        return POSM.applyRules(layerName, opts);
        }
    };

    // ---- EXTRACT YEAR FROM DATE VALUE ----
    function extractYear(val) {
        if (val === null || val === undefined || val === '') return null;
        var s = String(val);
        // Try to match a leading 4-digit year
        var m = s.match(/^(\d{4})/);
        if (m) return m[1];
        // Fallback: try Date parse
        var d = new Date(s);
        if (!isNaN(d.getTime())) return String(d.getFullYear());
        return null;
    }

    // ---- UNIQUE VALUES ----
    POSM.applyUniqueValues = function(layerName, field, groupByYear) {
        var info = POSM.layerData[layerName];
        if (!info || !info.geojson) return;

        // Extract unique values (optionally extracting year from dates)
        var valueCounts = {};
        info.geojson.features.forEach(function(f) {
            var val = f.properties ? f.properties[field] : null;
            var key;
            if (groupByYear) {
                var yr = extractYear(val);
                key = yr || '(null)';
            } else {
                key = (val === null || val === undefined) ? '(null)' : String(val);
            }
            valueCounts[key] = (valueCounts[key] || 0) + 1;
        });

        // Sort by value (chronological for years, frequency for others)
        var sortedValues;
        if (groupByYear) {
            sortedValues = Object.keys(valueCounts).sort(function(a, b) {
                if (a === '(null)') return 1;
                if (b === '(null)') return -1;
                return parseInt(a) - parseInt(b);
            });
        } else {
            sortedValues = Object.keys(valueCounts).sort(function(a, b) {
                return valueCounts[b] - valueCounts[a];
            });
        }

        // Assign colors
        var valueColorMap = {};
        sortedValues.forEach(function(val, i) {
            valueColorMap[val] = POSM.COLOR_PALETTE[i % POSM.COLOR_PALETTE.length];
        });

        POSM.state.activeSymbology = { layerName: layerName, field: field, valueColorMap: valueColorMap, groupByYear: !!groupByYear };
        info.symbology = { mode: 'unique', field: field, valueColorMap: valueColorMap, groupByYear: !!groupByYear };

        // Restyle the layer
        var sym = info.pointSymbol || 'circle';

        info.leafletLayer.eachLayer(function(layer) {
            var props = layer.feature.properties || {};
            var val = props[field];
            var key;
            if (groupByYear) {
                var yr = extractYear(val);
                key = yr || '(null)';
            } else {
                key = (val === null || val === undefined) ? '(null)' : String(val);
            }
            var color = valueColorMap[key] || '#888';
            POSM._applyStyleToLayer(layer, color, info.geomType, sym);
        });

        // Rebuild arrows with new colors if arrows are on
        if (info.showArrows) {
            POSM.removeArrowDecorators(layerName);
            POSM.addArrowDecorators(layerName);
        }

        // Update legend
        var legendField = groupByYear ? field + ' (Year)' : field;
        POSM.updateLegendUniqueValues(valueColorMap, legendField, info.geomType, sym);

        // Update layer swatch to show multi-color
        var swatchEl = document.getElementById('swatch-' + layerName);
        if (swatchEl) {
            var usedColors = sortedValues.slice(0, 4).map(function(v) { return valueColorMap[v]; });
            swatchEl.innerHTML = POSM.createMultiSwatchSVG(info.geomType, usedColors);
        }

        // If groupByYear, also apply year labels
        if (groupByYear && POSM.applyLabels) {
            // Add _year_display property to features for labeling
            info.geojson.features.forEach(function(f) {
                var val = f.properties ? f.properties[field] : null;
                f.properties._year_display = extractYear(val) || '';
            });
            if (info.fields.indexOf('_year_display') === -1) {
                info.fields.push('_year_display');
            }
            POSM.applyLabels(layerName, '_year_display');
        }
    };

    // ---- RESET SYMBOLOGY TO DEFAULT ----
    POSM.resetSymbology = function(layerName) {
        var info = POSM.layerData[layerName];
        if (!info) return;

        var isPoint = (info.geomType === 'Point' || info.geomType === 'MultiPoint');
        var sym = info.pointSymbol || 'circle';

        if (isPoint && sym !== 'circle') {
            POSM.rebuildLayer(layerName);
        } else {
            var style = POSM.defaultStyle(info.geomType, info.color);
            info.leafletLayer.eachLayer(function(layer) {
                if (layer.setStyle) layer.setStyle(style);
            });
        }

        info.symbology = null;

        // Restore layer swatch
        var swatchEl = document.getElementById('swatch-' + layerName);
        if (swatchEl) swatchEl.innerHTML = POSM.createSwatchSVG(info.geomType, info.color, sym);
    };

    // ---- CHANGE POINT SYMBOL ----
    POSM.changePointSymbol = function(layerName, symbolType) {
        var info = POSM.layerData[layerName];
        if (!info) return;
        info.pointSymbol = symbolType;
        POSM.rebuildLayer(layerName);

        // Re-apply symbology if one was active
        if (info.symbology) {
            POSM.applySymbology(layerName, info.symbology);
        }

        // Update swatch
        var swatchEl = document.getElementById('swatch-' + layerName);
        if (swatchEl && !info.symbology) {
            swatchEl.innerHTML = POSM.createSwatchSVG(info.geomType, info.color, symbolType);
        }
    };

    // ---- BUILD SYMBOLOGY DROPDOWNS ----
    POSM.buildSymbologyDropdowns = function() {
        var layerSelect = document.getElementById('sym-layer');
        layerSelect.innerHTML = '<option value="">Select a layer...</option>';
        Object.keys(POSM.layerData).sort().forEach(function(name) {
            var opt = document.createElement('option');
            opt.value = name;
            opt.textContent = POSM.layerData[name].label;
            layerSelect.appendChild(opt);
        });
    };

})(window.POSM);

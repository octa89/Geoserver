(function(POSM) {
    'use strict';

    // ---- UNIQUE VALUES LEGEND ----
    POSM.updateLegendUniqueValues = function(valueColorMap, fieldName, geomType, symbolType) {
        var container = document.getElementById('legend-content');
        container.innerHTML = '';
        var isPoint = (geomType === 'Point' || geomType === 'MultiPoint');
        var isLine = (geomType === 'LineString' || geomType === 'MultiLineString');

        var header = document.createElement('div');
        header.style.cssText = 'font-size:11px;color:#7f8fa6;margin-bottom:6px;';
        header.textContent = 'Field: ' + fieldName;
        container.appendChild(header);

        Object.entries(valueColorMap).forEach(function(entry) {
            var val = entry[0], color = entry[1];
            var item = document.createElement('div');
            item.className = 'legend-item';

            var swatch = document.createElement('div');
            swatch.className = 'legend-swatch';
            swatch.style.border = 'none';

            if (isPoint) {
                swatch.innerHTML = POSM.pointSVG(symbolType || 'circle', color, POSM.darkenColor(color), 16);
            } else if (isLine) {
                swatch.style.background = 'transparent';
                swatch.innerHTML = '<svg width="16" height="16"><line x1="0" y1="8" x2="16" y2="8" stroke="' + color + '" stroke-width="3" stroke-linecap="round"/></svg>';
            } else {
                swatch.style.background = color;
            }

            var label = document.createElement('span');
            label.className = 'legend-label';
            label.textContent = val;
            label.title = val;

            item.appendChild(swatch);
            item.appendChild(label);
            container.appendChild(item);
        });
    };

    // ---- GRADUATED LEGEND (ranges) ----
    POSM.updateLegendGraduated = function(breaks, colors, fieldName, geomType) {
        var container = document.getElementById('legend-content');
        container.innerHTML = '';
        var isLine = (geomType === 'LineString' || geomType === 'MultiLineString');

        var header = document.createElement('div');
        header.style.cssText = 'font-size:11px;color:#7f8fa6;margin-bottom:6px;';
        header.textContent = 'Field: ' + fieldName + ' (graduated)';
        container.appendChild(header);

        for (var i = 0; i < colors.length; i++) {
            var lo = breaks[i], hi = breaks[i + 1];
            var item = document.createElement('div');
            item.className = 'legend-item';

            var swatch = document.createElement('div');
            swatch.className = 'legend-swatch';
            swatch.style.border = 'none';
            if (isLine) {
                swatch.style.background = 'transparent';
                swatch.innerHTML = '<svg width="16" height="16"><line x1="0" y1="8" x2="16" y2="8" stroke="' + colors[i] + '" stroke-width="3" stroke-linecap="round"/></svg>';
            } else {
                swatch.style.background = colors[i];
            }

            var label = document.createElement('span');
            label.className = 'legend-label';
            var loStr = lo.toFixed(lo % 1 === 0 ? 0 : 2);
            var hiStr = hi.toFixed(hi % 1 === 0 ? 0 : 2);
            label.textContent = loStr + ' - ' + hiStr;
            label.title = loStr + ' - ' + hiStr;

            item.appendChild(swatch);
            item.appendChild(label);
            container.appendChild(item);
        }
    };

    // ---- PROPORTIONAL LEGEND (3 size steps) ----
    POSM.updateLegendProportional = function(minVal, maxVal, minSize, maxSize, fieldName, color) {
        var container = document.getElementById('legend-content');
        container.innerHTML = '';

        var header = document.createElement('div');
        header.style.cssText = 'font-size:11px;color:#7f8fa6;margin-bottom:6px;';
        header.textContent = 'Field: ' + fieldName + ' (proportional)';
        container.appendChild(header);

        var steps = [
            { label: minVal.toFixed(minVal % 1 === 0 ? 0 : 2), size: minSize },
            { label: ((minVal + maxVal) / 2).toFixed(2), size: (minSize + maxSize) / 2 },
            { label: maxVal.toFixed(maxVal % 1 === 0 ? 0 : 2), size: maxSize }
        ];

        steps.forEach(function(s) {
            var item = document.createElement('div');
            item.className = 'legend-item';

            var swatch = document.createElement('div');
            swatch.className = 'legend-swatch';
            swatch.style.border = 'none';
            swatch.style.background = 'transparent';
            var d = Math.round(s.size * 2);
            swatch.innerHTML = '<svg width="' + Math.max(d, 8) + '" height="' + Math.max(d, 8) + '"><circle cx="' + (d/2) + '" cy="' + (d/2) + '" r="' + (d/2) + '" fill="' + (color || '#3388ff') + '" fill-opacity="0.7"/></svg>';

            var label = document.createElement('span');
            label.className = 'legend-label';
            label.textContent = s.label;

            item.appendChild(swatch);
            item.appendChild(label);
            container.appendChild(item);
        });
    };

    // ---- RULES LEGEND ----
    POSM.updateLegendRules = function(rules, defaultColor) {
        var container = document.getElementById('legend-content');
        container.innerHTML = '';

        var header = document.createElement('div');
        header.style.cssText = 'font-size:11px;color:#7f8fa6;margin-bottom:6px;';
        header.textContent = 'Rule-Based';
        container.appendChild(header);

        rules.forEach(function(rule, i) {
            var item = document.createElement('div');
            item.className = 'legend-item';

            var swatch = document.createElement('div');
            swatch.className = 'legend-swatch';
            swatch.style.background = rule.color || '#888';
            swatch.style.border = 'none';

            var label = document.createElement('span');
            label.className = 'legend-label';
            var expr = (rule.field || '') + ' ' + (rule.operator || '') + ' ' + (rule.value || '');
            label.textContent = expr.trim() || 'Rule ' + (i + 1);
            label.title = expr;

            item.appendChild(swatch);
            item.appendChild(label);
            container.appendChild(item);
        });

        // Default
        var defItem = document.createElement('div');
        defItem.className = 'legend-item';
        var defSwatch = document.createElement('div');
        defSwatch.className = 'legend-swatch';
        defSwatch.style.background = defaultColor || '#888';
        defSwatch.style.border = 'none';
        var defLabel = document.createElement('span');
        defLabel.className = 'legend-label';
        defLabel.textContent = '(default)';
        defItem.appendChild(defSwatch);
        defItem.appendChild(defLabel);
        container.appendChild(defItem);
    };

    // Backward compatibility alias
    POSM.updateLegend = POSM.updateLegendUniqueValues;

})(window.POSM);

(function(POSM) {
    'use strict';

    // Evaluate a single rule against a feature's properties
    function evaluateRule(rule, props) {
        var field = rule.field;
        var op = rule.operator;
        var ruleVal = rule.value;
        var featVal = props[field];

        if (op === 'IS NULL') return (featVal === null || featVal === undefined || featVal === '');
        if (op === 'IS NOT NULL') return (featVal !== null && featVal !== undefined && featVal !== '');

        if (featVal === null || featVal === undefined) return false;

        var fStr = String(featVal);
        var fNum = Number(featVal);
        var rNum = Number(ruleVal);
        var useNum = !isNaN(fNum) && !isNaN(rNum) && String(ruleVal).trim() !== '';

        switch (op) {
            case '=':  return useNum ? fNum === rNum : fStr === ruleVal;
            case '!=': return useNum ? fNum !== rNum : fStr !== ruleVal;
            case '>':  return useNum ? fNum > rNum : fStr > ruleVal;
            case '<':  return useNum ? fNum < rNum : fStr < ruleVal;
            case '>=': return useNum ? fNum >= rNum : fStr >= ruleVal;
            case '<=': return useNum ? fNum <= rNum : fStr <= ruleVal;
            case 'LIKE': {
                // Convert SQL LIKE to regex: % → .*, _ → .
                var pattern = ruleVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                    .replace(/%/g, '.*').replace(/_/g, '.');
                return new RegExp('^' + pattern + '$').test(fStr);
            }
            default: return false;
        }
    }

    // opts: { rules: [{field, operator, value, color}], defaultColor }
    POSM.applyRules = function(layerName, opts) {
        var info = POSM.layerData[layerName];
        if (!info || !info.geojson) return;

        var rules = opts.rules || [];
        var defaultColor = opts.defaultColor || '#888';

        // Store symbology
        info.symbology = { mode: 'rules', rules: rules, defaultColor: defaultColor };
        POSM.state.activeSymbology = { layerName: layerName, mode: 'rules' };

        var sym = info.pointSymbol || 'circle';

        info.leafletLayer.eachLayer(function(layer) {
            var props = layer.feature.properties || {};
            var color = defaultColor;

            // First match wins
            for (var i = 0; i < rules.length; i++) {
                if (evaluateRule(rules[i], props)) {
                    color = rules[i].color || '#888';
                    break;
                }
            }

            POSM._applyStyleToLayer(layer, color, info.geomType, sym);
        });

        // Rebuild arrows if active
        if (info.showArrows) {
            POSM.removeArrowDecorators(layerName);
            POSM.addArrowDecorators(layerName);
        }

        // Legend
        POSM.updateLegendRules(rules, defaultColor);

        // Update swatch
        var swatchEl = document.getElementById('swatch-' + layerName);
        if (swatchEl) {
            var usedColors = rules.slice(0, 4).map(function(r) { return r.color || '#888'; });
            if (usedColors.length === 0) usedColors = [defaultColor];
            swatchEl.innerHTML = POSM.createMultiSwatchSVG(info.geomType, usedColors);
        }
    };

})(window.POSM);

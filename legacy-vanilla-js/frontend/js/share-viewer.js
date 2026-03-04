(function(POSM) {
    'use strict';

    // No auth check — shared views are public

    // Extract share ID from URL path: /share/<id>
    var pathParts = window.location.pathname.split('/');
    var shareId = pathParts[pathParts.length - 1];

    function showError(msg) {
        var el = document.getElementById('share-error');
        el.textContent = msg;
        el.style.display = 'block';
        document.getElementById('share-loading').style.display = 'none';
    }

    if (!shareId || shareId === 'share.html') {
        showError('No share ID in URL.');
        return;
    }

    // ---- HTML ESCAPE ----
    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    var URL_RE = /^https?:\/\/\S+$/i;
    var IMG_EXT_RE = /\.(jpe?g|png|gif|bmp|webp|svg|tiff?|ico|avif)(\?[^)]*)?$/i;

    function formatPopupValue(val) {
        var s = String(val);
        if (!URL_RE.test(s)) return escapeHtml(s);
        var escaped = escapeHtml(s);
        if (IMG_EXT_RE.test(s)) {
            return '<a href="' + escaped + '" target="_blank" rel="noopener">' +
                '<img src="' + escaped + '" class="popup-img" alt="image" /></a>';
        }
        var display = s.length > 50 ? s.substring(0, 47) + '...' : s;
        return '<a href="' + escaped + '" target="_blank" rel="noopener" class="popup-link">' + escapeHtml(display) + '</a>';
    }

    // ---- POPUP (read-only, no gear button) ----
    // This must be POSM.showPopup because layers.js calls it on feature click
    POSM.showPopup = function(feature, layerName, latlng) {
        var props = feature.properties || {};
        var info = POSM.layerData[layerName];
        var title = info ? info.label : layerName;

        var html = '<div class="popup-header"><span>' + escapeHtml(title) +
            '</span></div><div class="popup-body"><table class="popup-table">';

        var keys = Object.keys(props).sort();
        var hasContent = false;
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var v = props[k];
            if (v === null || v === undefined || v === '') continue;
            hasContent = true;
            html += '<tr><td>' + escapeHtml(k) + '</td><td>' + formatPopupValue(v) + '</td></tr>';
        }
        if (!hasContent) {
            html += '<tr><td colspan="2" style="text-align:center;color:#999;">No attributes</td></tr>';
        }
        html += '</table></div>';

        L.popup({ maxWidth: 380, maxHeight: 350 })
            .setLatLng(latlng)
            .setContent(html)
            .openOn(POSM.map);
    };

    // ---- LOAD LAYERS (simplified from app.js) ----
    async function loadLayers() {
        var layers = await POSM.discoverLayers();
        if (layers.length === 0) return;

        var bounds = L.latLngBounds();
        var hasFeatures = false;

        POSM.layerData = {};
        POSM.state.layerIndex = 0;

        await Promise.all(layers.map(async function(layer) {
            try {
                var geojson = await POSM.fetchLayerGeoJSON(layer.fullName);
                if (!geojson.features || geojson.features.length === 0) return;

                var color = POSM.LAYER_COLORS[POSM.state.layerIndex % POSM.LAYER_COLORS.length];
                POSM.state.layerIndex++;
                var result = POSM.createLeafletLayer(geojson, layer.shortName, color);
                var fields = POSM.extractFields(geojson);

                POSM.layerData[layer.shortName] = {
                    fullName: layer.fullName,
                    label: layer.label,
                    geojson: geojson,
                    leafletLayer: result.leafletLayer,
                    clusterGroup: result.clusterGroup,
                    fields: fields,
                    geomType: result.geomType,
                    color: color,
                    pointSymbol: 'circle',
                    clustered: true,
                    showArrows: false,
                    arrowDecorators: [],
                    symbology: null
                };

                POSM.addLayerToMap(layer.shortName);

                var layerBounds = (result.clusterGroup || result.leafletLayer).getBounds();
                if (layerBounds.isValid()) {
                    bounds.extend(layerBounds);
                    hasFeatures = true;
                }
            } catch (e) {
                console.error('Failed to load layer ' + layer.shortName + ':', e);
            }
        }));

        if (hasFeatures && bounds.isValid()) {
            POSM.map.fitBounds(bounds, { padding: [30, 30] });
        }

        POSM.initLabelZoomListener();
    }

    // ---- BUILD LEAFLET LAYER CONTROL ----
    function buildLayerControl() {
        var overlays = {};
        var names = Object.keys(POSM.layerData);
        for (var i = 0; i < names.length; i++) {
            var name = names[i];
            var info = POSM.layerData[name];
            var mapLayer = info.clusterGroup || info.leafletLayer;
            if (mapLayer) {
                overlays[info.label || name] = mapLayer;
            }
        }
        L.control.layers(null, overlays, {
            position: 'topright',
            collapsed: true
        }).addTo(POSM.map);
    }

    // ---- BUILD COMBINED LEGEND FOR ALL LAYERS ----
    function buildShareLegend(wsConfig) {
        var legendEl = document.getElementById('legend-content');
        if (!legendEl) return;
        legendEl.innerHTML = '';

        var layersConfig = wsConfig.layers || {};
        var names = Object.keys(POSM.layerData);
        var hasLegend = false;

        for (var i = 0; i < names.length; i++) {
            var name = names[i];
            var info = POSM.layerData[name];
            var lc = layersConfig[name];
            if (!info || !info.symbology) continue;
            if (lc && lc.visible === false) continue;

            hasLegend = true;
            var section = document.createElement('div');
            section.className = 'share-legend-section';

            var title = document.createElement('div');
            title.className = 'share-legend-title';
            title.textContent = info.label || name;
            section.appendChild(title);

            var sym = info.symbology;

            if (sym.mode === 'unique' && sym.valueColorMap) {
                var keys = Object.keys(sym.valueColorMap);
                for (var j = 0; j < keys.length; j++) {
                    var row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;';
                    var swatch = document.createElement('span');
                    swatch.style.cssText = 'width:12px;height:12px;border-radius:2px;flex-shrink:0;background:' + sym.valueColorMap[keys[j]];
                    var label = document.createElement('span');
                    label.style.cssText = 'color:#ccc;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                    label.textContent = keys[j];
                    row.appendChild(swatch);
                    row.appendChild(label);
                    section.appendChild(row);
                }
            } else if (sym.mode === 'graduated' && sym.breaks && sym.colors) {
                for (var g = 0; g < sym.colors.length; g++) {
                    var row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;';
                    var swatch = document.createElement('span');
                    swatch.style.cssText = 'width:12px;height:12px;border-radius:2px;flex-shrink:0;background:' + sym.colors[g];
                    var label = document.createElement('span');
                    label.style.cssText = 'color:#ccc;font-size:11px;';
                    var lo = sym.breaks[g] != null ? sym.breaks[g].toFixed(1) : '?';
                    var hi = sym.breaks[g + 1] != null ? sym.breaks[g + 1].toFixed(1) : '?';
                    label.textContent = lo + ' – ' + hi;
                    row.appendChild(swatch);
                    row.appendChild(label);
                    section.appendChild(row);
                }
            } else if (sym.mode === 'rules' && sym.rules) {
                for (var r = 0; r < sym.rules.length; r++) {
                    var rule = sym.rules[r];
                    var row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;';
                    var swatch = document.createElement('span');
                    swatch.style.cssText = 'width:12px;height:12px;border-radius:2px;flex-shrink:0;background:' + rule.color;
                    var label = document.createElement('span');
                    label.style.cssText = 'color:#ccc;font-size:11px;';
                    label.textContent = rule.field + ' ' + rule.operator + ' ' + (rule.value || '');
                    row.appendChild(swatch);
                    row.appendChild(label);
                    section.appendChild(row);
                }
            } else {
                // Single color layer
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;';
                var swatch = document.createElement('span');
                swatch.style.cssText = 'width:12px;height:12px;border-radius:2px;flex-shrink:0;background:' + (info.color || '#3388ff');
                var label = document.createElement('span');
                label.style.cssText = 'color:#ccc;font-size:11px;';
                label.textContent = sym.field || 'styled';
                row.appendChild(swatch);
                row.appendChild(label);
                section.appendChild(row);
            }

            legendEl.appendChild(section);
        }

        // Also show unstyled visible layers as simple entries
        for (var k = 0; k < names.length; k++) {
            var name = names[k];
            var info = POSM.layerData[name];
            var lc = layersConfig[name];
            if (info.symbology) continue; // already handled
            if (lc && lc.visible === false) continue;

            hasLegend = true;
            var section = document.createElement('div');
            section.className = 'share-legend-section';
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;';
            var swatch = document.createElement('span');
            swatch.style.cssText = 'width:12px;height:12px;border-radius:2px;flex-shrink:0;background:' + (info.color || '#3388ff');
            var label = document.createElement('span');
            label.style.cssText = 'color:#ccc;font-size:11px;font-weight:600;';
            label.textContent = info.label || name;
            row.appendChild(swatch);
            row.appendChild(label);
            section.appendChild(row);
            legendEl.appendChild(section);
        }

        if (!hasLegend) {
            legendEl.innerHTML = '<div class="status-text" style="color:#888;">No layers</div>';
        }
    }

    // ---- MAIN VIEWER INIT ----
    async function initViewer() {
        try {
            // 1. Fetch the share snapshot
            var resp = await fetch('/api/share/' + shareId);
            if (!resp.ok) {
                var err = await resp.json().catch(function() { return {}; });
                showError(err.error || 'Share not found (ID: ' + shareId + ')');
                return;
            }

            var snapshot = await resp.json();

            // 2. Configure workspace(s) from the snapshot
            POSM.CONFIG.WORKSPACES = snapshot.wsName.split('+');

            // Update info bar
            var wsLabel = document.getElementById('share-ws-label');
            if (wsLabel) wsLabel.textContent = 'Workspace: ' + snapshot.wsName;

            // 3. Init basemaps
            POSM.initBasemaps();

            // 4. Load all layers from GeoServer
            await loadLayers();

            // 5. Override legend update functions so individual applySymbology
            //    calls don't wipe #legend-content (we build a combined legend later)
            POSM.updateLegendUniqueValues = function() {};
            POSM.updateLegendGraduated = function() {};
            POSM.updateLegendProportional = function() {};
            POSM.updateLegendRules = function() {};
            POSM.updateLegend = function() {};

            // 6. Apply the snapshot (basemap, view, filters, symbology, labels, arrows, etc.)
            await POSM.applySession(snapshot.wsConfig);

            // 7. Add layer control for toggling layers
            buildLayerControl();

            // 8. Build combined legend for all layers
            buildShareLegend(snapshot.wsConfig);

            // Hide loading
            document.getElementById('share-loading').style.display = 'none';

        } catch (e) {
            console.error('Share viewer error:', e);
            showError('Failed to load shared map: ' + e.message);
        }
    }

    initViewer();

})(window.POSM);

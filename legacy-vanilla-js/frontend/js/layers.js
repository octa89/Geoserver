(function(POSM) {
    'use strict';

    var CONFIG = POSM.CONFIG;

    // ---- DEFAULT STYLE ----
    function defaultStyle(geomType, color) {
        var c = color || '#3388ff';
        var border = POSM.darkenColor(c);
        if (geomType === 'Point' || geomType === 'MultiPoint') {
            return { radius: 6, fillColor: c, color: border, weight: 1.5, opacity: 1, fillOpacity: 0.7 };
        } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
            return { color: c, weight: 3, opacity: 0.8 };
        } else {
            return { fillColor: c, color: border, weight: 2, opacity: 1, fillOpacity: 0.35 };
        }
    }

    // ---- DETECT GEOMETRY TYPE from GeoJSON ----
    function detectGeomType(geojson) {
        if (!geojson.features || geojson.features.length === 0) return 'Unknown';
        for (var i = 0; i < geojson.features.length; i++) {
            var f = geojson.features[i];
            if (f.geometry && f.geometry.type) return f.geometry.type;
        }
        return 'Unknown';
    }

    // ---- EXTRACT ATTRIBUTE FIELDS from GeoJSON ----
    function extractFields(geojson) {
        var fieldSet = new Set();
        var sampleSize = Math.min(geojson.features.length, 50);
        for (var i = 0; i < sampleSize; i++) {
            var props = geojson.features[i].properties;
            if (props) Object.keys(props).forEach(function(k) { fieldSet.add(k); });
        }
        return Array.from(fieldSet).sort();
    }

    // ---- DISCOVER LAYERS FROM A SINGLE WORKSPACE ----
    async function discoverWorkspaceLayers(workspace) {
        try {
            var capsUrl = CONFIG.wfsCapsUrl(workspace);
            var resp = await fetch(capsUrl);
            var text = await resp.text();
            var parser = new DOMParser();
            var xml = parser.parseFromString(text, 'text/xml');

            var featureTypes = xml.querySelectorAll('FeatureType');
            var layers = [];

            featureTypes.forEach(function(ft) {
                var nameEl = ft.querySelector('Name');
                var titleEl = ft.querySelector('Title');
                if (!nameEl) return;

                var rawName = nameEl.textContent;
                var title = titleEl ? titleEl.textContent : rawName;
                var shortName = rawName.includes(':') ? rawName.split(':')[1] : rawName;
                var fullName = rawName.includes(':') ? rawName : workspace + ':' + rawName;

                layers.push({ shortName: shortName, fullName: fullName, label: title, workspace: workspace });
            });

            return layers;
        } catch (e) {
            console.error('Failed to discover layers for workspace ' + workspace + ':', e);
            return [];
        }
    }

    // ---- FETCH LAYERS VIA WFS GETCAPABILITIES (multi-workspace) ----
    POSM.discoverLayers = async function() {
        var workspaces = CONFIG.WORKSPACES;
        if (!workspaces || workspaces.length === 0) {
            workspaces = ['POSM_GIS'];
        }

        var multiWorkspace = workspaces.length > 1;
        var allLayers = [];

        var results = await Promise.all(workspaces.map(function(ws) {
            return discoverWorkspaceLayers(ws);
        }));

        results.forEach(function(layers) {
            layers.forEach(function(layer) {
                // Prefix label with workspace name when multiple workspaces
                if (multiWorkspace) {
                    layer.label = layer.workspace + ' / ' + layer.label;
                }
                allLayers.push(layer);
            });
        });

        console.log('Discovered ' + allLayers.length + ' WFS layers across ' + workspaces.length + ' workspace(s)');
        return allLayers;
    };

    // ---- FETCH GEOJSON FOR A SINGLE LAYER ----
    POSM.fetchLayerGeoJSON = async function(fullName, cqlFilter) {
        // Determine the workspace from the fullName (workspace:layerName)
        var workspace = CONFIG.WORKSPACE;
        if (fullName.includes(':')) {
            workspace = fullName.split(':')[0];
        }
        var wfsUrl = CONFIG.wfsUrl(workspace);
        var url = wfsUrl + '?service=WFS&version=1.0.0&request=GetFeature&typeName=' +
            encodeURIComponent(fullName) + '&outputFormat=application/json&srsName=EPSG:4326';
        if (cqlFilter) {
            url += '&CQL_FILTER=' + encodeURIComponent(cqlFilter);
        }
        var resp = await fetch(url);
        if (!resp.ok) throw new Error('WFS request failed: ' + resp.status);

        // GeoServer may return XML error with 200 status — detect and parse it
        var contentType = resp.headers.get('content-type') || '';
        var text = await resp.text();

        if (contentType.indexOf('json') !== -1 && text.charAt(0) === '{') {
            return JSON.parse(text);
        }

        // XML error response — try to extract the error message
        if (text.indexOf('<') === 0 || contentType.indexOf('xml') !== -1) {
            var errMsg = 'GeoServer returned an error';
            try {
                var doc = new DOMParser().parseFromString(text, 'text/xml');
                var exText = doc.querySelector('ExceptionText, ServiceException');
                if (exText) errMsg = exText.textContent.trim();
            } catch (e) { /* use default message */ }
            throw new Error(errMsg);
        }

        // Fallback: try parsing as JSON anyway
        return JSON.parse(text);
    };

    // ---- CREATE LEAFLET LAYER FROM GEOJSON ----
    // opts.clustered: if false, skip marker clustering even for large point layers
    POSM.createLeafletLayer = function(geojson, shortName, color, pointSymbol, opts) {
        opts = opts || {};
        var geomType = detectGeomType(geojson);
        var isPoint = (geomType === 'Point' || geomType === 'MultiPoint');
        var sym = pointSymbol || 'circle';
        var shouldCluster = (opts.clustered !== false); // default true

        var geoJsonLayer = L.geoJSON(geojson, {
            pointToLayer: function(feature, latlng) {
                return POSM.createPointMarker(latlng, sym, color || '#3388ff', POSM.darkenColor(color || '#3388ff'), 14);
            },
            style: function(feature) {
                if (!isPoint) return defaultStyle(geomType, color);
            },
            onEachFeature: function(feature, layer) {
                layer.on('click', function(e) {
                    var clickLatLng = e.latlng || (layer.getLatLng ? layer.getLatLng() : null);
                    if (clickLatLng) POSM.showPopup(feature, shortName, clickLatLng);
                });
            }
        });

        // Use marker cluster for points (only if enabled and enough features)
        if (isPoint && shouldCluster && geojson.features.length > 200) {
            var cluster = L.markerClusterGroup({
                maxClusterRadius: 50,
                spiderfyOnMaxZoom: true,
                disableClusteringAtZoom: 20,
                showCoverageOnHover: false
            });
            cluster.addLayer(geoJsonLayer);
            return { leafletLayer: geoJsonLayer, clusterGroup: cluster, geomType: geomType };
        }

        return { leafletLayer: geoJsonLayer, clusterGroup: null, geomType: geomType };
    };

    // ---- ADD A LAYER TO THE MAP ----
    POSM.addLayerToMap = function(shortName) {
        var info = POSM.layerData[shortName];
        if (!info || !info.leafletLayer) return;

        if (info.clusterGroup) {
            POSM.map.addLayer(info.clusterGroup);
        } else {
            POSM.map.addLayer(info.leafletLayer);
        }

        // Show labels if active and zoom allows
        if (info.labelField) {
            POSM.updateLabelVisibility(shortName);
        }
    };

    // ---- REMOVE A LAYER FROM THE MAP ----
    POSM.removeLayerFromMap = function(shortName) {
        var info = POSM.layerData[shortName];
        if (!info) return;

        if (info.clusterGroup && POSM.map.hasLayer(info.clusterGroup)) {
            POSM.map.removeLayer(info.clusterGroup);
        } else if (info.leafletLayer && POSM.map.hasLayer(info.leafletLayer)) {
            POSM.map.removeLayer(info.leafletLayer);
        }

        // Hide labels when layer is toggled off
        var labelLg = info._labelManager ? info._labelManager.layerGroup : info._labelLayer;
        if (labelLg && POSM.map.hasLayer(labelLg)) {
            POSM.map.removeLayer(labelLg);
        }
    };

    // ---- REBUILD LAYER (remove and recreate from GeoJSON) ----
    POSM.rebuildLayer = function(layerName) {
        var info = POSM.layerData[layerName];
        if (!info) return;

        // Check visibility
        var isVisible = info.clusterGroup
            ? POSM.map.hasLayer(info.clusterGroup)
            : POSM.map.hasLayer(info.leafletLayer);

        // Remove old
        POSM.removeLayerFromMap(layerName);

        // Create new (respect clustering preference)
        var result = POSM.createLeafletLayer(info.geojson, layerName, info.color, info.pointSymbol, { clustered: info.clustered !== false });
        info.leafletLayer = result.leafletLayer;
        info.clusterGroup = result.clusterGroup;

        // Re-add if was visible
        if (isVisible) POSM.addLayerToMap(layerName);

        // Rebuild arrows if they were on (for line layers)
        if (info.showArrows) {
            POSM.removeArrowDecorators(layerName);
            POSM.addArrowDecorators(layerName);
        }

        // Re-apply labels if they were on
        var savedLabelField = info.labelField;
        if (savedLabelField) {
            POSM.applyLabels(layerName, savedLabelField);
        }
    };

    // Expose helpers used by other modules
    POSM.defaultStyle = defaultStyle;
    POSM.detectGeomType = detectGeomType;
    POSM.extractFields = extractFields;

})(window.POSM);

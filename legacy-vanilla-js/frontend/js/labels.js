(function(POSM) {
    'use strict';

    // ---- MIN ZOOM HEURISTIC based on feature count ----
    POSM.computeLabelMinZoom = function(geojson) {
        if (!geojson || !geojson.features) return 16;
        var n = geojson.features.length;
        if (n < 30)   return 14;
        if (n < 100)  return 15;
        if (n < 500)  return 16;
        if (n < 2000) return 17;
        return 18;
    };

    // ---- HTML ESCAPE ----
    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ---- GET LABEL POSITION from a feature ----
    function getLabelLatLng(feature) {
        if (!feature.geometry) return null;
        var type = feature.geometry.type;
        var coords = feature.geometry.coordinates;

        if (type === 'Point') {
            return L.latLng(coords[1], coords[0]);
        }
        if (type === 'MultiPoint') {
            return L.latLng(coords[0][1], coords[0][0]);
        }
        try {
            var tempLayer = L.geoJSON(feature);
            var bounds = tempLayer.getBounds();
            return bounds.getCenter();
        } catch (e) {
            return null;
        }
    }

    // ---- GET LINE MIDPOINT (geographic) and the two segment endpoints ----
    function getLineMidpointData(feature) {
        if (!feature.geometry) return null;
        var type = feature.geometry.type;
        var coords;

        if (type === 'LineString') {
            coords = feature.geometry.coordinates;
        } else if (type === 'MultiLineString') {
            var lines = feature.geometry.coordinates;
            var longest = lines[0];
            var maxLen = 0;
            for (var l = 0; l < lines.length; l++) {
                if (lines[l].length > maxLen) {
                    maxLen = lines[l].length;
                    longest = lines[l];
                }
            }
            coords = longest;
        } else {
            return null;
        }

        if (!coords || coords.length < 2) return null;

        var totalDist = 0;
        var segDists = [];
        for (var i = 1; i < coords.length; i++) {
            var d = Math.sqrt(
                Math.pow(coords[i][0] - coords[i-1][0], 2) +
                Math.pow(coords[i][1] - coords[i-1][1], 2)
            );
            segDists.push(d);
            totalDist += d;
        }

        var halfDist = totalDist / 2;
        var accum = 0;
        for (var j = 0; j < segDists.length; j++) {
            if (accum + segDists[j] >= halfDist) {
                var t = (halfDist - accum) / segDists[j];
                var p1 = coords[j];
                var p2 = coords[j + 1];
                var midLng = p1[0] + (p2[0] - p1[0]) * t;
                var midLat = p1[1] + (p2[1] - p1[1]) * t;

                return {
                    latlng: L.latLng(midLat, midLng),
                    segStart: L.latLng(p1[1], p1[0]),
                    segEnd: L.latLng(p2[1], p2[0])
                };
            }
            accum += segDists[j];
        }

        var mid = Math.floor(coords.length / 2);
        var prev = mid > 0 ? mid - 1 : 0;
        return {
            latlng: L.latLng(coords[mid][1], coords[mid][0]),
            segStart: L.latLng(coords[prev][1], coords[prev][0]),
            segEnd: L.latLng(coords[mid][1], coords[mid][0])
        };
    }

    // ---- COMPUTE SCREEN ANGLE from two latlngs ----
    function screenAngle(map, latlngA, latlngB) {
        var pA = map.latLngToContainerPoint(latlngA);
        var pB = map.latLngToContainerPoint(latlngB);
        var dx = pB.x - pA.x;
        var dy = pB.y - pA.y;
        var angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);

        if (angleDeg > 90) angleDeg -= 180;
        if (angleDeg < -90) angleDeg += 180;

        return angleDeg;
    }

    // ---- BATCH SIZE for chunked rendering ----
    var CHUNK_SIZE = 50;

    // ---- BUILD LABEL ENTRIES (precompute metadata, NO DOM) ----
    function buildLabelEntries(info, field, isLine, isPoint) {
        var features = info.geojson.features;
        var c = info.color || '#3388ff';
        var entries = [];

        for (var i = 0; i < features.length; i++) {
            var f = features[i];
            var props = f.properties;
            if (!props) continue;
            var val = props[field];
            if (val === null || val === undefined || val === '') continue;

            var latlng, segStart = null, segEnd = null;

            if (isLine) {
                var mid = getLineMidpointData(f);
                if (!mid) continue;
                latlng = mid.latlng;
                segStart = mid.segStart;
                segEnd = mid.segEnd;
            } else if (isPoint) {
                var type = f.geometry && f.geometry.type;
                var coords = f.geometry && f.geometry.coordinates;
                if (type === 'Point' && coords) {
                    latlng = L.latLng(coords[1], coords[0]);
                } else if (type === 'MultiPoint' && coords && coords[0]) {
                    latlng = L.latLng(coords[0][1], coords[0][0]);
                } else {
                    continue;
                }
            } else {
                latlng = getLabelLatLng(f);
                if (!latlng) continue;
            }

            entries.push({
                id: i,
                latlng: latlng,
                segStart: segStart,
                segEnd: segEnd,
                text: escapeHtml(String(val)),
                color: c,
                isLine: isLine,
                isPoint: isPoint
            });
        }

        return entries;
    }

    // ---- CREATE A SINGLE LABEL MARKER ----
    function createLabelMarker(entry, map) {
        var angle = 0;
        if (entry.isLine && entry.segStart && entry.segEnd) {
            angle = screenAngle(map, entry.segStart, entry.segEnd);
        }

        var transform = 'transform:translate(-50%,-50%)' + (angle !== 0 ? ' rotate(' + angle.toFixed(1) + 'deg)' : '') + ';';
        var anchorY = entry.isPoint ? 10 : 0;

        var marker = L.marker(entry.latlng, {
            icon: L.divIcon({
                className: 'posm-label-icon posm-label-centered',
                html: '<span class="posm-label-text" style="color:' + entry.color + ';' + transform + '">' + entry.text + '</span>',
                iconSize: [0, 0],
                iconAnchor: [0, anchorY]
            }),
            interactive: false,
            keyboard: false
        });

        return marker;
    }

    // ---- UPDATE MARKER ANGLE via CSS (no DOM rebuild) ----
    function updateMarkerAngle(marker, entry, map) {
        var el = marker.getElement && marker.getElement();
        if (!el) return;
        var span = el.querySelector('.posm-label-text');
        if (!span) return;

        var angle = screenAngle(map, entry.segStart, entry.segEnd);
        span.style.transform = 'translate(-50%,-50%)' + (angle !== 0 ? ' rotate(' + angle.toFixed(1) + 'deg)' : '');
    }

    // ---- ADD MARKERS IN CHUNKS via requestAnimationFrame ----
    function addMarkersChunked(mgr, toAdd, map) {
        // Small batch — add synchronously
        if (toAdd.length <= CHUNK_SIZE) {
            for (var i = 0; i < toAdd.length; i++) {
                var entry = toAdd[i];
                var marker = createLabelMarker(entry, map);
                mgr.layerGroup.addLayer(marker);
                mgr.activeMarkers[entry.id] = { marker: marker, entry: entry };
            }
            return;
        }

        // Large batch — chunk with RAF
        var offset = 0;
        function processChunk() {
            mgr.pendingRaf = null;
            var end = Math.min(offset + CHUNK_SIZE, toAdd.length);
            for (var j = offset; j < end; j++) {
                var entry = toAdd[j];
                var marker = createLabelMarker(entry, map);
                mgr.layerGroup.addLayer(marker);
                mgr.activeMarkers[entry.id] = { marker: marker, entry: entry };
            }
            offset = end;
            if (offset < toAdd.length) {
                mgr.pendingRaf = requestAnimationFrame(processChunk);
            }
        }
        mgr.pendingRaf = requestAnimationFrame(processChunk);
    }

    // ---- RECONCILE VIEWPORT: add/remove/update visible labels ----
    function reconcileViewport(info, layerName) {
        var mgr = info._labelManager;
        if (!mgr) return;

        var map = POSM.map;
        var zoom = map.getZoom();
        var bounds = map.getBounds().pad(0.2); // 20% padding
        var zoomChanged = (mgr.lastZoom !== null && mgr.lastZoom !== zoom);
        mgr.lastZoom = zoom;

        // Determine which entries are in the viewport
        var visibleIds = {};
        var toAdd = [];
        for (var i = 0; i < mgr.entries.length; i++) {
            var entry = mgr.entries[i];
            if (bounds.contains(entry.latlng)) {
                visibleIds[entry.id] = true;
                if (!mgr.activeMarkers[entry.id]) {
                    toAdd.push(entry);
                } else if (zoomChanged && entry.isLine && entry.segStart && entry.segEnd) {
                    // Zoom changed — update angle via CSS
                    updateMarkerAngle(mgr.activeMarkers[entry.id].marker, entry, map);
                }
            }
        }

        // Remove markers that left viewport
        var activeIds = Object.keys(mgr.activeMarkers);
        for (var k = 0; k < activeIds.length; k++) {
            var id = activeIds[k];
            if (!visibleIds[id]) {
                mgr.layerGroup.removeLayer(mgr.activeMarkers[id].marker);
                delete mgr.activeMarkers[id];
            }
        }

        // Add new visible markers (chunked if large)
        if (toAdd.length > 0) {
            addMarkersChunked(mgr, toAdd, map);
        }
    }

    // ---- DEBOUNCED RECONCILE ALL labeled layers ----
    var _reconcileTimer = null;

    function debouncedReconcileAll() {
        if (_reconcileTimer) clearTimeout(_reconcileTimer);
        _reconcileTimer = setTimeout(function() {
            _reconcileTimer = null;
            var names = Object.keys(POSM.layerData);
            for (var i = 0; i < names.length; i++) {
                var info = POSM.layerData[names[i]];
                if (!info.labelField || !info._labelManager) continue;

                // Enforce minZoom visibility then reconcile viewport
                POSM.updateLabelVisibility(names[i]);
            }
        }, 80);
    }

    // ---- APPLY LABELS to a layer ----
    POSM.applyLabels = function(layerName, field) {
        var info = POSM.layerData[layerName];
        if (!info || !info.geojson) return;

        // Remove existing labels first
        POSM.removeLabels(layerName);

        info.labelField = field;
        info.labelMinZoom = POSM.computeLabelMinZoom(info.geojson);

        var isLine = (info.geomType === 'LineString' || info.geomType === 'MultiLineString');
        var isPoint = (info.geomType === 'Point' || info.geomType === 'MultiPoint');

        // Build precomputed metadata (no DOM)
        var entries = buildLabelEntries(info, field, isLine, isPoint);

        // Create label manager
        var mgr = {
            entries: entries,
            activeMarkers: {},
            layerGroup: L.layerGroup(),
            lastZoom: null,
            pendingRaf: null,
            isLine: isLine
        };
        info._labelManager = mgr;

        // For backward compat
        info._labelOnTooltips = false;
        info._lineLabelData = null;
        info._labelLayer = null;

        POSM.updateLabelVisibility(layerName);
    };

    // ---- REMOVE LABELS from a layer ----
    POSM.removeLabels = function(layerName) {
        var info = POSM.layerData[layerName];
        if (!info) return;

        // New label manager cleanup
        if (info._labelManager) {
            if (info._labelManager.pendingRaf) {
                cancelAnimationFrame(info._labelManager.pendingRaf);
            }
            if (POSM.map.hasLayer(info._labelManager.layerGroup)) {
                POSM.map.removeLayer(info._labelManager.layerGroup);
            }
            info._labelManager.layerGroup.clearLayers();
            info._labelManager.activeMarkers = {};
            info._labelManager = null;
        }

        // Backward compat: old _labelLayer
        if (info._labelLayer) {
            if (POSM.map.hasLayer(info._labelLayer)) {
                POSM.map.removeLayer(info._labelLayer);
            }
            info._labelLayer = null;
        }

        // Backward compat: old tooltip-based labels
        if (info._labelOnTooltips && info.leafletLayer) {
            info.leafletLayer.eachLayer(function(layer) {
                if (layer.getTooltip && layer.getTooltip()) {
                    layer.unbindTooltip();
                }
            });
            info._labelOnTooltips = false;
        }

        info._lineLabelData = null;
        info.labelField = null;
        info.labelMinZoom = null;
    };

    // ---- CHECK if the parent layer is on the map ----
    function isLayerOnMap(info) {
        if (info.clusterGroup) return POSM.map.hasLayer(info.clusterGroup);
        if (info.leafletLayer) return POSM.map.hasLayer(info.leafletLayer);
        return false;
    }

    // ---- SHOW / HIDE LABELS based on zoom and parent layer visibility ----
    POSM.updateLabelVisibility = function(layerName) {
        var info = POSM.layerData[layerName];
        if (!info || !info.labelField) return;

        var zoom = POSM.map.getZoom();
        var parentVisible = isLayerOnMap(info);
        var show = parentVisible && zoom >= info.labelMinZoom;

        if (info._labelManager) {
            var lg = info._labelManager.layerGroup;
            if (show) {
                if (!POSM.map.hasLayer(lg)) {
                    POSM.map.addLayer(lg);
                }
                // Populate visible labels
                reconcileViewport(info, layerName);
            } else {
                // Hidden (layer off, below minZoom): remove all markers from DOM to free memory
                if (POSM.map.hasLayer(lg)) {
                    POSM.map.removeLayer(lg);
                }
                // Cancel pending RAF
                if (info._labelManager.pendingRaf) {
                    cancelAnimationFrame(info._labelManager.pendingRaf);
                    info._labelManager.pendingRaf = null;
                }
                // Clear active markers
                info._labelManager.layerGroup.clearLayers();
                info._labelManager.activeMarkers = {};
            }
            return;
        }

        // Backward compat: old _labelLayer
        if (info._labelLayer) {
            if (show && !POSM.map.hasLayer(info._labelLayer)) {
                POSM.map.addLayer(info._labelLayer);
            } else if (!show && POSM.map.hasLayer(info._labelLayer)) {
                POSM.map.removeLayer(info._labelLayer);
            }
        }

        // Backward compat: old tooltip-based labels
        if (info._labelOnTooltips && info.leafletLayer) {
            info.leafletLayer.eachLayer(function(layer) {
                var tip = layer.getTooltip && layer.getTooltip();
                if (!tip) return;
                var el = tip.getElement && tip.getElement();
                if (el) {
                    el.style.display = show ? '' : 'none';
                }
            });
        }
    };

    // ---- GLOBAL MOVE LISTENER (registered once) ----
    var _moveListenerBound = false;

    POSM.initLabelZoomListener = function() {
        if (_moveListenerBound || !POSM.map) return;
        _moveListenerBound = true;

        POSM.map.on('moveend', debouncedReconcileAll);
    };

})(window.POSM);

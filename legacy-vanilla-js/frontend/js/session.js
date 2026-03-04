(function(POSM) {
    'use strict';

    var STORAGE_PREFIX = 'posm_map_config_';

    // ---- STORAGE KEY (per user) ----
    function storageKey() {
        var user = POSM.getCurrentUser();
        return STORAGE_PREFIX + (user ? user.username : 'anonymous');
    }

    // ---- GET USERNAME for server API ----
    function getUsername() {
        var user = POSM.getCurrentUser();
        return user ? user.username : 'anonymous';
    }

    // ---- GET CURRENT WORKSPACE NAME ----
    function currentWorkspaceName() {
        var ws = POSM.CONFIG.WORKSPACES;
        if (!ws || ws.length === 0) return 'default';
        if (ws.length === 1) return ws[0];
        return ws.slice().sort().join('+');
    }

    // ---- GET CURRENT BASEMAP KEY ----
    function getCurrentBasemap() {
        var active = document.querySelector('.basemap-btn.active');
        return active ? active.dataset.basemap : 'street';
    }

    // ---- BUILD FULL CONFIG OBJECT ----
    function buildConfigObject() {
        var wsName = currentWorkspaceName();
        var center = POSM.map.getCenter();

        // Collect per-layer config
        var layersConfig = {};
        var names = Object.keys(POSM.layerData);
        for (var i = 0; i < names.length; i++) {
            var name = names[i];
            var info = POSM.layerData[name];

            var visible = info.clusterGroup
                ? POSM.map.hasLayer(info.clusterGroup)
                : (info.leafletLayer ? POSM.map.hasLayer(info.leafletLayer) : true);

            var symConfig = null;
            if (info.symbology) {
                symConfig = JSON.parse(JSON.stringify(info.symbology));
            }

            layersConfig[name] = {
                visible: visible,
                color: info.color || '#3388ff',
                symbology: symConfig,
                pointSymbol: info.pointSymbol || 'circle',
                showArrows: !!info.showArrows,
                clustered: info.clustered !== false,
                labelField: info.labelField || null,
                activeFilters: info.activeFilters ? JSON.parse(JSON.stringify(info.activeFilters)) : [],
                filterCombineMode: info.filterCombineMode || 'AND',
                popupConfig: info.popupConfig || null,
                ageConfig: info.ageConfig || null
            };
        }

        return {
            wsName: wsName,
            wsConfig: {
                basemap: getCurrentBasemap(),
                center: [center.lat, center.lng],
                zoom: POSM.map.getZoom(),
                layers: layersConfig
            }
        };
    }

    // Expose for share feature
    POSM.buildConfigObject = buildConfigObject;

    // ---- SAVE SESSION ----
    POSM.saveSession = function() {
        try {
            var key = storageKey();
            var built = buildConfigObject();

            // Read existing stored data
            var stored = {};
            var raw = localStorage.getItem(key);
            if (raw) {
                try { stored = JSON.parse(raw); } catch (e) { stored = {}; }
            }
            if (!stored.workspaces) stored.workspaces = {};
            stored.workspaces[built.wsName] = built.wsConfig;
            stored.bookmarks = POSM._bookmarks || [];

            // Save to localStorage (offline fallback)
            localStorage.setItem(key, JSON.stringify(stored));

            // Save to server (fire-and-forget)
            try {
                fetch('/api/config/' + encodeURIComponent(getUsername()), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(stored)
                }).catch(function() { /* server unavailable — localStorage still has it */ });
            } catch (e) { /* fetch not supported or blocked */ }
        } catch (e) {
            console.warn('Failed to save session:', e);
        }
    };

    // ---- LOAD SESSION (async: tries server first, falls back to localStorage) ----
    POSM.loadSession = async function() {
        var wsName = currentWorkspaceName();

        // Try server first
        try {
            var resp = await fetch('/api/config/' + encodeURIComponent(getUsername()));
            if (resp.ok) {
                var stored = await resp.json();
                if (stored && stored.workspaces && stored.workspaces[wsName]) {
                    console.log('Session loaded from server');
                    POSM._bookmarks = stored.bookmarks || [];
                    // Sync to localStorage so offline fallback stays current
                    try {
                        localStorage.setItem(storageKey(), JSON.stringify(stored));
                    } catch (e) { /* quota exceeded — not critical */ }
                    return stored.workspaces[wsName];
                }
            }
        } catch (e) {
            console.warn('Server config unavailable, falling back to localStorage:', e.message);
        }

        // Fall back to localStorage
        try {
            var key = storageKey();
            var raw = localStorage.getItem(key);
            if (!raw) return null;

            var stored = JSON.parse(raw);
            if (!stored.workspaces) return null;

            POSM._bookmarks = stored.bookmarks || [];
            console.log('Session loaded from localStorage');
            return stored.workspaces[wsName] || null;
        } catch (e) {
            console.warn('Failed to load session:', e);
            return null;
        }
    };

    // ---- APPLY SESSION (after layers are loaded) ----
    POSM.applySession = async function(config) {
        if (!config) return;

        // 1. Restore basemap
        if (config.basemap) {
            var basemapBtn = document.querySelector('.basemap-btn[data-basemap="' + config.basemap + '"]');
            if (basemapBtn && !basemapBtn.classList.contains('active')) {
                basemapBtn.click();
            }
        }

        // 2. Restore map view
        if (config.center && config.zoom != null) {
            POSM.map.setView(config.center, config.zoom);
        }

        // 3. Restore per-layer settings
        var layersConfig = config.layers || {};
        var names = Object.keys(POSM.layerData);

        for (var i = 0; i < names.length; i++) {
            var name = names[i];
            var lc = layersConfig[name];
            if (!lc) continue;

            var info = POSM.layerData[name];

            // 3a. Visibility
            var isCurrentlyVisible = info.clusterGroup
                ? POSM.map.hasLayer(info.clusterGroup)
                : (info.leafletLayer ? POSM.map.hasLayer(info.leafletLayer) : false);

            if (lc.visible === false && isCurrentlyVisible) {
                POSM.removeLayerFromMap(name);
            } else if (lc.visible === true && !isCurrentlyVisible) {
                POSM.addLayerToMap(name);
            }

            // Update checkbox
            var cb = document.getElementById('chk-' + name);
            if (cb) cb.checked = lc.visible !== false;

            // 3b. Clustering (before symbology, since it rebuilds the layer)
            var wantClustered = lc.clustered !== false;
            if (wantClustered !== (info.clustered !== false)) {
                info.clustered = wantClustered;
                var wasVisible = lc.visible !== false;
                POSM.removeLayerFromMap(name);
                var result = POSM.createLeafletLayer(info.geojson, name, info.color, lc.pointSymbol || info.pointSymbol, { clustered: wantClustered });
                info.leafletLayer = result.leafletLayer;
                info.clusterGroup = result.clusterGroup;
                if (wasVisible) POSM.addLayerToMap(name);

                // Update cluster button
                var clusterBtn = document.querySelector('#chk-' + name);
                if (clusterBtn) {
                    var layerItem = clusterBtn.closest('.layer-item');
                    if (layerItem) {
                        var cBtn = layerItem.querySelector('.layer-cluster-btn');
                        if (cBtn) {
                            cBtn.classList.toggle('active', wantClustered);
                            cBtn.title = wantClustered ? 'Clustering ON — click to ungroup' : 'Clustering OFF — click to group';
                        }
                    }
                }
            }

            // 3c. Point symbol
            if (lc.pointSymbol && lc.pointSymbol !== (info.pointSymbol || 'circle')) {
                POSM.changePointSymbol(name, lc.pointSymbol);
            }

            // 3d. Apply filters (must fetch filtered data from server)
            if (lc.activeFilters && lc.activeFilters.length > 0) {
                info.activeFilters = lc.activeFilters.slice();
                info.filterCombineMode = lc.filterCombineMode || 'AND';

                var joiner = ' ' + info.filterCombineMode + ' ';
                var combinedCql = info.activeFilters.map(function(f) { return '(' + f.cql + ')'; }).join(joiner);

                try {
                    var geojson = await POSM.fetchLayerGeoJSON(info.fullName, combinedCql);
                    POSM.removeLayerFromMap(name);
                    if (!info._originalGeojson) info._originalGeojson = info.geojson;
                    info.geojson = geojson;
                    info.activeFilter = combinedCql;

                    var filterResult = POSM.createLeafletLayer(geojson, name, info.color, info.pointSymbol, { clustered: info.clustered !== false });
                    info.leafletLayer = filterResult.leafletLayer;
                    info.clusterGroup = filterResult.clusterGroup;

                    if (lc.visible !== false) POSM.addLayerToMap(name);

                    // Update count
                    var countEl = document.querySelector('#chk-' + name);
                    if (countEl) {
                        var layerItem = countEl.closest('.layer-item');
                        if (layerItem) {
                            var ct = layerItem.querySelector('.layer-count');
                            if (ct) {
                                ct.textContent = '(' + (geojson.features ? geojson.features.length : 0) + ' filtered)';
                                ct.style.color = '#42d4f4';
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Failed to restore filters for ' + name + ':', e);
                    info.activeFilters = [];
                }
            }

            // 3e. Age calculator (must run before symbology so computed field exists)
            if (lc.ageConfig && POSM._computeAge) {
                POSM._computeAge(name, lc.ageConfig.field, lc.ageConfig.unit);
            }

            // 3f. Symbology
            if (lc.symbology) {
                try {
                    POSM.applySymbology(name, lc.symbology);
                    info.symbology = lc.symbology;
                } catch (e) {
                    console.warn('Failed to restore symbology for ' + name + ':', e);
                }
            }

            // 3g. Arrows
            if (lc.showArrows && !info.showArrows) {
                POSM.toggleArrows(name, true);
            }

            // 3h. Labels
            if (lc.labelField) {
                POSM.applyLabels(name, lc.labelField);
                // Update label dropdown
                var layerItem = cb ? cb.closest('.layer-item') : null;
                if (layerItem) {
                    var labelSelect = layerItem.querySelector('.layer-label-select');
                    if (labelSelect) labelSelect.value = lc.labelField;
                }
            }

            // 3i. Popup config
            if (lc.popupConfig) {
                info.popupConfig = lc.popupConfig;
            }
        }

        // 4. Refresh active filters list in the filter panel
        if (POSM._filterPanel) {
            POSM._filterPanel.updateActiveFiltersList();
        }

        // 5. Refresh bookmarks list
        if (POSM._updateBookmarkList) {
            POSM._updateBookmarkList();
        }

        // 6. Show a brief "Restored" toast
        showRestoredToast();
    };

    // ---- CLEAR SESSION ----
    POSM.clearSession = function() {
        try {
            var key = storageKey();
            var wsName = currentWorkspaceName();
            var raw = localStorage.getItem(key);
            if (!raw) return;

            var stored = JSON.parse(raw);
            if (stored.workspaces && stored.workspaces[wsName]) {
                delete stored.workspaces[wsName];
                localStorage.setItem(key, JSON.stringify(stored));

                // Also update server
                try {
                    fetch('/api/config/' + encodeURIComponent(getUsername()), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(stored)
                    }).catch(function() {});
                } catch (e) { /* not critical */ }
            }
        } catch (e) {
            console.warn('Failed to clear session:', e);
        }
    };

    // ---- DEBOUNCED SAVE SCHEDULER ----
    var _saveTimer = null;
    POSM.scheduleSave = function() {
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(function() {
            _saveTimer = null;
            POSM.saveSession();
        }, 500);
    };

    // ---- TOAST NOTIFICATION ----
    function showRestoredToast() {
        var toast = document.createElement('div');
        toast.className = 'posm-toast';
        toast.textContent = 'Session restored';
        toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
            'background:#1a1a2e;color:#42d4f4;padding:8px 20px;border-radius:6px;font-size:13px;' +
            'z-index:10000;opacity:0;transition:opacity 0.3s;border:1px solid #42d4f4;pointer-events:none;';
        document.body.appendChild(toast);

        requestAnimationFrame(function() {
            toast.style.opacity = '1';
        });

        setTimeout(function() {
            toast.style.opacity = '0';
            setTimeout(function() {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 350);
        }, 2000);
    }

})(window.POSM);

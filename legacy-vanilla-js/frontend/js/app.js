(function(POSM) {
    'use strict';

    // ---- AUTH CHECK ----
    if (!POSM.requireAuth()) return;

    // ---- SIDEBAR TOGGLE ----
    document.getElementById('sidebar-toggle').addEventListener('click', function() {
        document.getElementById('sidebar').classList.toggle('collapsed');
    });

    // ---- SIDEBAR RESIZE ----
    (function() {
        var sidebar = document.getElementById('sidebar');
        var handle = document.getElementById('sidebar-resize');
        var dragging = false;

        handle.addEventListener('mousedown', function(e) {
            e.preventDefault();
            dragging = true;
            sidebar.classList.add('resizing');
            handle.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', function(e) {
            if (!dragging) return;
            var newWidth = Math.max(260, Math.min(600, e.clientX));
            document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
        });

        document.addEventListener('mouseup', function() {
            if (!dragging) return;
            dragging = false;
            sidebar.classList.remove('resizing');
            handle.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        });
    })();

    // ---- LOADING INDICATOR ----
    var loadCount = 0;
    function showLoading(msg) {
        loadCount++;
        var el = document.getElementById('loading-indicator');
        el.textContent = msg || 'Loading...';
        el.classList.add('show');
    }
    function hideLoading() {
        loadCount--;
        if (loadCount <= 0) {
            loadCount = 0;
            document.getElementById('loading-indicator').classList.remove('show');
        }
    }

    // ---- POPUP ----
    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    var URL_RE = /^https?:\/\/\S+$/i;
    var IMG_EXT_RE = /\.(jpe?g|png|gif|bmp|webp|svg|tiff?|ico|avif)(\?[^)]*)?$/i;

    function isImageUrl(val) {
        var s = String(val);
        return URL_RE.test(s) && IMG_EXT_RE.test(s);
    }

    function isLinkUrl(val) {
        return URL_RE.test(String(val));
    }

    function formatPopupValue(val) {
        var s = String(val);
        if (!URL_RE.test(s)) return escapeHtml(s);

        var escaped = escapeHtml(s);
        if (IMG_EXT_RE.test(s)) {
            return '<a href="' + escaped + '" target="_blank" rel="noopener">' +
                '<img src="' + escaped + '" class="popup-img" alt="image" />' +
                '</a>';
        }
        var display = s.length > 50 ? s.substring(0, 47) + '...' : s;
        return '<a href="' + escaped + '" target="_blank" rel="noopener" class="popup-link">' + escapeHtml(display) + '</a>';
    }

    // ---- SMART FIELD SORT: images first, then links, then alphabetical ----
    function smartSortFields(props) {
        var images = [], links = [], others = [];
        var allKeys = Object.keys(props);
        for (var i = 0; i < allKeys.length; i++) {
            var k = allKeys[i];
            var v = props[k];
            if (v === null || v === undefined || v === '') continue;
            if (isImageUrl(v)) { images.push(k); }
            else if (isLinkUrl(v)) { links.push(k); }
            else { others.push(k); }
        }
        images.sort();
        links.sort();
        others.sort();
        return images.concat(links, others);
    }

    // ---- GET ORDERED FIELDS for popup ----
    function getPopupFields(props, info) {
        if (info && info.popupConfig && info.popupConfig.fieldOrder) {
            var hidden = info.popupConfig.hiddenFields || {};
            return info.popupConfig.fieldOrder.filter(function(k) {
                return !hidden[k] && props[k] != null && props[k] !== '';
            });
        }
        return smartSortFields(props);
    }

    // ---- GET POPUP TITLE ----
    function getPopupTitle(props, info, layerName) {
        if (info && info.popupConfig) {
            var pc = info.popupConfig;
            // Field-based title: show field value (with optional prefix text)
            if (pc.titleField && props[pc.titleField] != null && props[pc.titleField] !== '') {
                var prefix = pc.titleText ? pc.titleText + ' ' : '';
                return prefix + String(props[pc.titleField]);
            }
            // Custom text title only
            if (pc.titleText) {
                return pc.titleText;
            }
        }
        return info ? info.label : layerName;
    }

    // ---- SHOW POPUP ----
    POSM.showPopup = function(feature, layerName, latlng) {
        var props = feature.properties || {};
        var info = POSM.layerData[layerName];
        var title = getPopupTitle(props, info, layerName);

        var html = '<div class="popup-header"><span>' + escapeHtml(title) +
            '</span><button class="popup-config-btn" data-layer="' + escapeHtml(layerName) +
            '" title="Configure fields">&#9881;</button></div><div class="popup-body"><table class="popup-table">';

        var keys = getPopupFields(props, info);
        var hasContent = false;
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var v = props[k];
            hasContent = true;
            html += '<tr><td>' + escapeHtml(k) + '</td><td>' + formatPopupValue(v) + '</td></tr>';
        }
        if (!hasContent) {
            html += '<tr><td colspan="2" style="text-align:center;color:#999;">No attributes</td></tr>';
        }
        html += '</table></div>';

        var popup = L.popup({ maxWidth: 380, maxHeight: 350, className: '' })
            .setLatLng(latlng)
            .setContent(html)
            .openOn(POSM.map);

        // Wire gear button after popup is in DOM
        setTimeout(function() {
            var btn = document.querySelector('.popup-config-btn[data-layer="' + layerName + '"]');
            if (btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    openPopupFieldConfig(layerName, props);
                });
            }
        }, 50);
    };

    // ---- POPUP FIELD CONFIG MODAL ----
    function openPopupFieldConfig(layerName, sampleProps) {
        // Remove existing modal
        var existing = document.getElementById('popup-field-config');
        if (existing) existing.parentNode.removeChild(existing);

        var info = POSM.layerData[layerName];
        if (!info) return;

        // Determine current field order
        var allFields = info.fields || Object.keys(sampleProps).sort();
        var currentOrder;
        var hiddenFields = {};

        if (info.popupConfig && info.popupConfig.fieldOrder) {
            currentOrder = info.popupConfig.fieldOrder.slice();
            hiddenFields = Object.assign({}, info.popupConfig.hiddenFields || {});
            // Add any new fields not in saved order
            for (var f = 0; f < allFields.length; f++) {
                if (currentOrder.indexOf(allFields[f]) === -1) {
                    currentOrder.push(allFields[f]);
                }
            }
        } else {
            // Start with smart order (images/links first)
            currentOrder = smartSortFields(sampleProps);
            // Add fields that were null/empty (so user can enable them)
            for (var g = 0; g < allFields.length; g++) {
                if (currentOrder.indexOf(allFields[g]) === -1) {
                    currentOrder.push(allFields[g]);
                    hiddenFields[allFields[g]] = true;
                }
            }
        }

        // Build modal
        var modal = document.createElement('div');
        modal.id = 'popup-field-config';
        modal.className = 'popup-field-config-overlay';

        var panel = document.createElement('div');
        panel.className = 'popup-field-config-panel';

        // Header
        var header = document.createElement('div');
        header.className = 'popup-field-config-header';
        header.innerHTML = '<span>Configure Popup Fields</span>' +
            '<button class="popup-field-config-close" title="Close">&times;</button>';
        panel.appendChild(header);

        // Title config section
        var titleSection = document.createElement('div');
        titleSection.className = 'popup-title-config';

        var titleLabel = document.createElement('div');
        titleLabel.className = 'popup-title-config-label';
        titleLabel.textContent = 'Popup Title';
        titleSection.appendChild(titleLabel);

        var titleRow = document.createElement('div');
        titleRow.className = 'popup-title-config-row';

        var titleTextInput = document.createElement('input');
        titleTextInput.type = 'text';
        titleTextInput.className = 'popup-title-text-input';
        titleTextInput.placeholder = 'Custom text (optional)';
        titleTextInput.value = (info.popupConfig && info.popupConfig.titleText) || '';

        var titleFieldSelect = document.createElement('select');
        titleFieldSelect.className = 'popup-title-field-select';
        var defaultTitleOpt = document.createElement('option');
        defaultTitleOpt.value = '';
        defaultTitleOpt.textContent = 'No field';
        titleFieldSelect.appendChild(defaultTitleOpt);
        for (var tf = 0; tf < allFields.length; tf++) {
            var tfOpt = document.createElement('option');
            tfOpt.value = allFields[tf];
            tfOpt.textContent = allFields[tf];
            if (info.popupConfig && info.popupConfig.titleField === allFields[tf]) tfOpt.selected = true;
            titleFieldSelect.appendChild(tfOpt);
        }

        titleRow.appendChild(titleTextInput);
        titleRow.appendChild(titleFieldSelect);
        titleSection.appendChild(titleRow);

        var titleHint = document.createElement('div');
        titleHint.className = 'popup-title-hint';
        titleHint.textContent = 'Text + field shows "Text FieldValue". Field alone shows the value. Neither uses layer name.';
        titleSection.appendChild(titleHint);

        panel.appendChild(titleSection);

        // Field list
        var list = document.createElement('div');
        list.className = 'popup-field-config-list';

        var dragSrcIndex = null;

        for (var i = 0; i < currentOrder.length; i++) {
            var fieldName = currentOrder[i];
            var row = document.createElement('div');
            row.className = 'popup-field-config-row';
            row.draggable = true;
            row.dataset.field = fieldName;
            row.dataset.index = i;

            var handle = document.createElement('span');
            handle.className = 'popup-field-drag-handle';
            handle.textContent = '\u2261';

            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = !hiddenFields[fieldName];
            checkbox.className = 'popup-field-checkbox';
            checkbox.dataset.field = fieldName;

            var label = document.createElement('span');
            label.className = 'popup-field-name';
            label.textContent = fieldName;

            row.appendChild(handle);
            row.appendChild(checkbox);
            row.appendChild(label);

            // Drag events
            row.addEventListener('dragstart', function(e) {
                dragSrcIndex = parseInt(this.dataset.index);
                this.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            row.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                this.classList.add('drag-over');
            });
            row.addEventListener('dragleave', function() {
                this.classList.remove('drag-over');
            });
            row.addEventListener('drop', function(e) {
                e.preventDefault();
                this.classList.remove('drag-over');
                var dropIndex = parseInt(this.dataset.index);
                if (dragSrcIndex === null || dragSrcIndex === dropIndex) return;

                // Reorder rows in the list
                var rows = list.querySelectorAll('.popup-field-config-row');
                var draggedRow = rows[dragSrcIndex];
                if (dropIndex > dragSrcIndex) {
                    this.parentNode.insertBefore(draggedRow, this.nextSibling);
                } else {
                    this.parentNode.insertBefore(draggedRow, this);
                }

                // Update indices
                var updatedRows = list.querySelectorAll('.popup-field-config-row');
                for (var r = 0; r < updatedRows.length; r++) {
                    updatedRows[r].dataset.index = r;
                }
                dragSrcIndex = null;
            });
            row.addEventListener('dragend', function() {
                this.classList.remove('dragging');
                var allRows = list.querySelectorAll('.popup-field-config-row');
                for (var r = 0; r < allRows.length; r++) {
                    allRows[r].classList.remove('drag-over');
                }
            });

            list.appendChild(row);
        }

        panel.appendChild(list);

        // Buttons
        var btnBar = document.createElement('div');
        btnBar.className = 'popup-field-config-buttons';

        var resetBtn = document.createElement('button');
        resetBtn.className = 'popup-field-config-reset';
        resetBtn.textContent = 'Reset to Default';
        resetBtn.addEventListener('click', function() {
            info.popupConfig = null;
            POSM.scheduleSave();
            modal.parentNode.removeChild(modal);
        });

        var doneBtn = document.createElement('button');
        doneBtn.className = 'popup-field-config-done';
        doneBtn.textContent = 'Done';
        doneBtn.addEventListener('click', function() {
            // Read current order and visibility from DOM
            var rows = list.querySelectorAll('.popup-field-config-row');
            var newOrder = [];
            var newHidden = {};
            for (var r = 0; r < rows.length; r++) {
                var fn = rows[r].dataset.field;
                newOrder.push(fn);
                var cb = rows[r].querySelector('.popup-field-checkbox');
                if (cb && !cb.checked) {
                    newHidden[fn] = true;
                }
            }

            info.popupConfig = {
                fieldOrder: newOrder,
                hiddenFields: newHidden,
                titleText: titleTextInput.value.trim() || null,
                titleField: titleFieldSelect.value || null
            };
            POSM.scheduleSave();
            modal.parentNode.removeChild(modal);
        });

        btnBar.appendChild(resetBtn);
        btnBar.appendChild(doneBtn);
        panel.appendChild(btnBar);

        // Close button
        header.querySelector('.popup-field-config-close').addEventListener('click', function() {
            modal.parentNode.removeChild(modal);
        });

        // Close on overlay click
        modal.addEventListener('click', function(e) {
            if (e.target === modal) modal.parentNode.removeChild(modal);
        });

        modal.appendChild(panel);
        document.body.appendChild(modal);
    }

    // ---- BUILD LAYER PANEL ----
    function buildLayerPanel() {
        var container = document.getElementById('layer-list');
        container.innerHTML = '';
        var names = Object.keys(POSM.layerData).sort();

        if (names.length === 0) {
            container.innerHTML = '<div class="status-text">No layers found.</div>';
            return;
        }

        names.forEach(function(name) {
            var info = POSM.layerData[name];
            var item = document.createElement('div');
            item.className = 'layer-item';

            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = 'chk-' + name;
            cb.checked = true;
            cb.addEventListener('change', function() {
                if (cb.checked) POSM.addLayerToMap(name);
                else POSM.removeLayerFromMap(name);
                POSM.scheduleSave();
            });

            var swatch = document.createElement('div');
            swatch.className = 'layer-swatch';
            swatch.id = 'swatch-' + name;
            swatch.innerHTML = POSM.createSwatchSVG(info.geomType, info.color, info.pointSymbol);

            var label = document.createElement('label');
            label.htmlFor = 'chk-' + name;
            label.textContent = info.label;

            var count = document.createElement('span');
            count.className = 'layer-count';
            var n = info.geojson ? info.geojson.features.length : 0;
            count.textContent = '(' + n + ')';

            item.appendChild(cb);
            item.appendChild(swatch);
            item.appendChild(label);
            item.appendChild(count);

            // Cluster toggle for point layers
            var isPoint = (info.geomType === 'Point' || info.geomType === 'MultiPoint');
            if (isPoint) {
                var clusterBtn = document.createElement('button');
                clusterBtn.className = 'layer-cluster-btn' + (info.clustered !== false ? ' active' : '');
                clusterBtn.title = info.clustered !== false ? 'Clustering ON — click to ungroup' : 'Clustering OFF — click to group';
                clusterBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="5" r="3" fill="currentColor" opacity="0.9"/><circle cx="4" cy="10" r="2.2" fill="currentColor" opacity="0.5"/><circle cx="10" cy="10" r="2.2" fill="currentColor" opacity="0.5"/></svg>';
                clusterBtn.addEventListener('click', function() {
                    var isClustered = info.clustered !== false;
                    info.clustered = !isClustered;
                    clusterBtn.classList.toggle('active', info.clustered);
                    clusterBtn.title = info.clustered ? 'Clustering ON — click to ungroup' : 'Clustering OFF — click to group';

                    // Rebuild layer with new clustering preference
                    var wasVisible = info.clusterGroup
                        ? POSM.map.hasLayer(info.clusterGroup)
                        : POSM.map.hasLayer(info.leafletLayer);

                    POSM.removeArrowDecorators(name);
                    POSM.removeLayerFromMap(name);

                    var result = POSM.createLeafletLayer(info.geojson, name, info.color, info.pointSymbol, { clustered: info.clustered });
                    info.leafletLayer = result.leafletLayer;
                    info.clusterGroup = result.clusterGroup;

                    if (wasVisible) POSM.addLayerToMap(name);

                    // Re-apply symbology if active
                    if (info.symbology) {
                        POSM.applySymbology(name, info.symbology);
                    }
                    if (info.showArrows) {
                        POSM.addArrowDecorators(name);
                    }
                    // Re-apply labels if active
                    var savedLabel = info.labelField;
                    if (savedLabel) {
                        POSM.applyLabels(name, savedLabel);
                    }
                    POSM.scheduleSave();
                });
                item.appendChild(clusterBtn);
            }

            // Label field dropdown
            var labelSelect = document.createElement('select');
            labelSelect.className = 'layer-label-select';
            labelSelect.title = 'Feature labels';
            var noLabelOpt = document.createElement('option');
            noLabelOpt.value = '';
            noLabelOpt.textContent = 'No labels';
            labelSelect.appendChild(noLabelOpt);
            if (info.fields) {
                info.fields.forEach(function(f) {
                    var opt = document.createElement('option');
                    opt.value = f;
                    opt.textContent = f;
                    if (info.labelField === f) opt.selected = true;
                    labelSelect.appendChild(opt);
                });
            }
            labelSelect.addEventListener('change', function() {
                var field = labelSelect.value;
                if (field) {
                    POSM.applyLabels(name, field);
                } else {
                    POSM.removeLabels(name);
                }
                POSM.scheduleSave();
            });
            item.appendChild(labelSelect);

            container.appendChild(item);
        });
    }

    // ---- AGE CALCULATOR ----
    function computeAge(layerName, dateField, unit) {
        var info = POSM.layerData[layerName];
        if (!info || !info.geojson) return;

        var now = new Date();
        var computedField = '_age_' + unit.toLowerCase();

        // Remove previous computed age field if different
        if (info.ageConfig && info.ageConfig.computedField !== computedField) {
            removeComputedField(info, info.ageConfig.computedField);
        }

        var features = info.geojson.features;
        for (var i = 0; i < features.length; i++) {
            var val = features[i].properties[dateField];
            if (!val) { features[i].properties[computedField] = null; continue; }
            var d = new Date(val);
            if (isNaN(d.getTime())) { features[i].properties[computedField] = null; continue; }

            var diffMs = now.getTime() - d.getTime();
            if (unit === 'years') {
                features[i].properties[computedField] = +(diffMs / (365.25 * 24 * 60 * 60 * 1000)).toFixed(1);
            } else {
                features[i].properties[computedField] = +(diffMs / (30.4375 * 24 * 60 * 60 * 1000)).toFixed(1);
            }
        }

        // Add to fields list
        if (info.fields.indexOf(computedField) === -1) {
            info.fields.push(computedField);
        }

        info.ageConfig = { field: dateField, unit: unit, computedField: computedField };

        // Rebuild layer so new field appears in popups/labels/symbology
        POSM.rebuildLayer(layerName);

        // Update age button state
        var layerItem = document.getElementById('chk-' + layerName);
        if (layerItem) {
            var btn = layerItem.closest('.layer-item');
            if (btn) {
                var ab = btn.querySelector('.layer-age-btn');
                if (ab) ab.classList.add('active');
            }
        }
    }

    function removeComputedField(info, fieldName) {
        if (!info || !info.geojson) return;
        var features = info.geojson.features;
        for (var i = 0; i < features.length; i++) {
            delete features[i].properties[fieldName];
        }
        var idx = info.fields.indexOf(fieldName);
        if (idx !== -1) info.fields.splice(idx, 1);
    }

    function removeAge(layerName) {
        var info = POSM.layerData[layerName];
        if (!info || !info.ageConfig) return;

        removeComputedField(info, info.ageConfig.computedField);
        info.ageConfig = null;

        POSM.rebuildLayer(layerName);

        // Update age button state
        var layerItem = document.getElementById('chk-' + layerName);
        if (layerItem) {
            var btn = layerItem.closest('.layer-item');
            if (btn) {
                var ab = btn.querySelector('.layer-age-btn');
                if (ab) ab.classList.remove('active');
            }
        }
    }

    // Expose for session restore and symbology panel
    POSM._computeAge = computeAge;
    POSM._removeAge = removeAge;

    // ---- WIRE UP UI EVENTS ----
    function wireEvents() {
        // Basemap switcher
        POSM.initBasemaps();

        // Save settings button
        var saveBtn = document.getElementById('save-settings-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                POSM.saveSession();
                saveBtn.textContent = '\u2714 Saved!';
                saveBtn.classList.add('saved');
                setTimeout(function() {
                    saveBtn.textContent = '\uD83D\uDCBE Save Settings';
                    saveBtn.classList.remove('saved');
                }, 1500);
            });
        }

        // ---- SHARE BUTTON ----
        var shareBtn = document.getElementById('share-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', async function() {
                var snapshot = POSM.buildConfigObject();
                shareBtn.disabled = true;
                shareBtn.textContent = '...';
                try {
                    var resp = await fetch('/api/share', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(snapshot)
                    });
                    var result = await resp.json();
                    var shareUrl = window.location.origin + result.url;
                    showShareModal(shareUrl);
                } catch (e) {
                    alert('Failed to create share link: ' + e.message);
                } finally {
                    shareBtn.textContent = '\uD83D\uDD17';
                    shareBtn.disabled = false;
                }
            });
        }

        function showShareModal(url) {
            // Remove existing modal if any
            var existing = document.querySelector('.share-modal-overlay');
            if (existing) existing.remove();

            var overlay = document.createElement('div');
            overlay.className = 'share-modal-overlay';

            var encodedUrl = encodeURIComponent(url);
            var encodedText = encodeURIComponent('Check out this map view: ');

            overlay.innerHTML =
                '<div class="share-modal">' +
                    '<div class="share-modal-title"><span>&#128279;</span> Share Map View</div>' +
                    '<div class="share-url-row">' +
                        '<input class="share-url-input" type="text" readonly value="' + url.replace(/"/g, '&quot;') + '" />' +
                        '<button class="share-copy-btn">Copy</button>' +
                    '</div>' +
                    '<div class="share-actions">' +
                        '<a class="share-action-btn" href="' + url + '" target="_blank" rel="noopener" title="Open in new tab">' +
                            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
                            'Open' +
                        '</a>' +
                        '<a class="share-action-btn" href="mailto:?subject=Shared%20Map%20View&body=' + encodedText + encodedUrl + '" title="Share via Email">' +
                            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>' +
                            'Email' +
                        '</a>' +
                        '<a class="share-action-btn" href="https://wa.me/?text=' + encodedText + encodedUrl + '" target="_blank" rel="noopener" title="Share via WhatsApp">' +
                            '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492l4.625-1.474A11.932 11.932 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-2.168 0-4.18-.585-5.918-1.608l-.424-.253-2.744.875.874-2.685-.277-.44A9.79 9.79 0 012.182 12c0-5.423 4.395-9.818 9.818-9.818S21.818 6.577 21.818 12s-4.395 9.818-9.818 9.818z"/></svg>' +
                            'WhatsApp' +
                        '</a>' +
                        '<a class="share-action-btn" href="https://teams.microsoft.com/share?href=' + encodedUrl + '&msgText=' + encodedText + '" target="_blank" rel="noopener" title="Share via Teams">' +
                            '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.625 8.5h-1.5V6.25a2.25 2.25 0 00-2.25-2.25h-.75a2.625 2.625 0 10-3.188-2.563A2.625 2.625 0 0015.75 4h.375a.75.75 0 01.75.75V8.5h-3.75v-2a1.5 1.5 0 00-1.5-1.5H4.5A1.5 1.5 0 003 6.5v8a1.5 1.5 0 001.5 1.5h1.125v3.375A1.625 1.625 0 007.25 21h4.5a1.625 1.625 0 001.625-1.625V16h2.25a2.25 2.25 0 002.25-2.25v-1.5h2.75a1.375 1.375 0 001.375-1.375v-1.5A1.375 1.375 0 0020.625 8.5z"/></svg>' +
                            'Teams' +
                        '</a>' +
                    '</div>' +
                    '<button class="share-modal-close">Close</button>' +
                '</div>';

            document.body.appendChild(overlay);

            var urlInput = overlay.querySelector('.share-url-input');
            var copyBtn = overlay.querySelector('.share-copy-btn');
            var closeBtn = overlay.querySelector('.share-modal-close');

            // Auto-select URL text
            urlInput.addEventListener('click', function() { urlInput.select(); });
            urlInput.select();

            // Copy button
            copyBtn.addEventListener('click', function() {
                navigator.clipboard.writeText(url).then(function() {
                    copyBtn.textContent = 'Copied!';
                    copyBtn.classList.add('copied');
                    setTimeout(function() {
                        copyBtn.textContent = 'Copy';
                        copyBtn.classList.remove('copied');
                    }, 2000);
                }).catch(function() {
                    // Fallback
                    urlInput.select();
                    document.execCommand('copy');
                    copyBtn.textContent = 'Copied!';
                    copyBtn.classList.add('copied');
                    setTimeout(function() {
                        copyBtn.textContent = 'Copy';
                        copyBtn.classList.remove('copied');
                    }, 2000);
                });
            });

            // Close on button, overlay click, or Escape
            closeBtn.addEventListener('click', function() { overlay.remove(); });
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) overlay.remove();
            });
            document.addEventListener('keydown', function onEsc(e) {
                if (e.key === 'Escape') {
                    overlay.remove();
                    document.removeEventListener('keydown', onEsc);
                }
            });
        }

        // ---- BOOKMARKS ----
        POSM._bookmarks = POSM._bookmarks || [];

        function updateBookmarkList() {
            var list = document.getElementById('bookmark-list');
            if (!list) return;
            list.innerHTML = '';

            if (!POSM._bookmarks || POSM._bookmarks.length === 0) {
                list.innerHTML = '<div class="status-text">No bookmarks yet</div>';
                return;
            }

            POSM._bookmarks.forEach(function(bk) {
                var item = document.createElement('div');
                item.className = 'bookmark-item';

                var name = document.createElement('span');
                name.className = 'bookmark-name';
                name.textContent = bk.name;
                name.title = 'Fly to ' + bk.name + ' (zoom ' + bk.zoom + ')';
                name.addEventListener('click', function() {
                    POSM.map.flyTo(bk.center, bk.zoom);
                });

                var zoom = document.createElement('span');
                zoom.className = 'bookmark-zoom';
                zoom.textContent = 'z' + bk.zoom;

                var remove = document.createElement('button');
                remove.className = 'bookmark-remove';
                remove.innerHTML = '&times;';
                remove.title = 'Remove bookmark';
                remove.addEventListener('click', function() {
                    POSM._bookmarks = POSM._bookmarks.filter(function(b) { return b.id !== bk.id; });
                    updateBookmarkList();
                    POSM.scheduleSave();
                });

                item.appendChild(name);
                item.appendChild(zoom);
                item.appendChild(remove);
                list.appendChild(item);
            });
        }

        POSM._updateBookmarkList = updateBookmarkList;

        document.getElementById('bookmark-add').addEventListener('click', function() {
            var name = window.prompt('Bookmark name:');
            if (!name || !name.trim()) return;

            var center = POSM.map.getCenter();
            POSM._bookmarks.push({
                id: 'bk_' + Date.now(),
                name: name.trim(),
                center: [center.lat, center.lng],
                zoom: POSM.map.getZoom()
            });

            updateBookmarkList();
            POSM.scheduleSave();
        });

        updateBookmarkList();

        // Logout button
        document.getElementById('logout-btn').addEventListener('click', function() {
            POSM.logout();
        });

        // Symbology: Layer selection changed
        document.getElementById('sym-layer').addEventListener('change', function() {
            var modeGrid = document.getElementById('sym-mode-grid');
            var styleCtrl = document.getElementById('sym-style-controls');
            var pointRow = document.getElementById('sym-point-row');
            var arrowRow = document.getElementById('sym-arrow-row');

            var name = this.value;
            if (!name || !POSM.layerData[name]) {
                modeGrid.style.display = 'none';
                styleCtrl.style.display = 'none';
                // Hide all panels
                document.querySelectorAll('.sym-panel').forEach(function(p) { p.style.display = 'none'; });
                return;
            }

            var info = POSM.layerData[name];

            // Show mode grid
            modeGrid.style.display = 'grid';

            // Populate field dropdowns for each mode
            POSM.populateModeFields(name);

            // Show the active mode panel
            var activeCell = document.querySelector('.sym-mode-cell.active');
            var activeMode = activeCell ? activeCell.getAttribute('data-mode') : 'unique';
            POSM.showSymbologyPanel(activeMode);

            // Show style controls matching geometry type
            styleCtrl.style.display = 'block';
            var isPoint = (info.geomType === 'Point' || info.geomType === 'MultiPoint');
            var isLine = (info.geomType === 'LineString' || info.geomType === 'MultiLineString');
            pointRow.style.display = isPoint ? 'flex' : 'none';
            arrowRow.style.display = isLine ? 'flex' : 'none';

            // Sync controls to current layer state
            document.getElementById('sym-point-shape').value = info.pointSymbol || 'circle';
            document.getElementById('sym-arrows').checked = !!info.showArrows;
        });

        // Unique Values: auto-apply on field change
        document.getElementById('sym-uv-field').addEventListener('change', function() {
            var layerName = document.getElementById('sym-layer').value;
            var field = this.value;
            if (!layerName || !field) return;

            // Detect if date field and show/hide year option
            var info = POSM.layerData[layerName];
            var dateOpts = document.getElementById('sym-uv-date-options');
            var isDate = info && POSM.isDateField(info.geojson, field);
            if (dateOpts) dateOpts.style.display = isDate ? 'block' : 'none';

            // Remove year labels if switching away from a date field
            if (!isDate && info && info.labelField === '_year_display' && POSM.removeLabels) {
                POSM.removeLabels(layerName);
            }

            var groupByYear = isDate && document.getElementById('sym-uv-group-year').checked;
            POSM.applySymbology(layerName, { mode: 'unique', field: field, groupByYear: groupByYear });
            POSM.scheduleSave();
        });

        // Unique Values: re-apply when group-by-year checkbox toggled
        document.getElementById('sym-uv-group-year').addEventListener('change', function() {
            var layerName = document.getElementById('sym-layer').value;
            var field = document.getElementById('sym-uv-field').value;
            if (!layerName || !field) return;
            // Remove year labels when unchecking
            if (!this.checked && POSM.removeLabels) {
                POSM.removeLabels(layerName);
            }
            POSM.applySymbology(layerName, { mode: 'unique', field: field, groupByYear: this.checked });
            POSM.scheduleSave();
        });

        // Graduated: show options when field selected
        document.getElementById('sym-grad-field').addEventListener('change', function() {
            var opts = document.getElementById('sym-grad-options');
            opts.style.display = this.value ? 'block' : 'none';
            if (this.value) POSM.showPendingDot();
        });

        // Graduated: apply button
        document.getElementById('sym-grad-apply').addEventListener('click', function() {
            var layerName = document.getElementById('sym-layer').value;
            var field = document.getElementById('sym-grad-field').value;
            if (!layerName || !field) return;
            POSM.applySymbology(layerName, {
                mode: 'graduated',
                field: field,
                method: document.getElementById('sym-grad-method').value,
                nClasses: parseInt(document.getElementById('sym-grad-classes').value),
                ramp: POSM._selectedRamp || 'Blues'
            });
            POSM.hidePendingDot();
            POSM.scheduleSave();
        });

        // Proportional: show options when field selected
        document.getElementById('sym-prop-field').addEventListener('change', function() {
            var opts = document.getElementById('sym-prop-options');
            opts.style.display = this.value ? 'block' : 'none';
            if (this.value) POSM.showPendingDot();
        });

        // Proportional: apply button
        document.getElementById('sym-prop-apply').addEventListener('click', function() {
            var layerName = document.getElementById('sym-layer').value;
            var field = document.getElementById('sym-prop-field').value;
            if (!layerName || !field) return;
            POSM.applySymbology(layerName, {
                mode: 'proportional',
                field: field,
                minSize: parseFloat(document.getElementById('sym-prop-min').value) || 4,
                maxSize: parseFloat(document.getElementById('sym-prop-max').value) || 24
            });
            POSM.hidePendingDot();
            POSM.scheduleSave();
        });

        // Rules: add rule button
        document.getElementById('sym-add-rule').addEventListener('click', function() {
            POSM.addRuleCard();
        });

        // Rules: apply button
        document.getElementById('sym-rules-apply').addEventListener('click', function() {
            var layerName = document.getElementById('sym-layer').value;
            if (!layerName) return;
            var rules = POSM.collectRules();
            POSM.applySymbology(layerName, {
                mode: 'rules',
                rules: rules,
                defaultColor: '#888'
            });
            POSM.hidePendingDot();
            POSM.scheduleSave();
        });

        // Wire mode grid and ramp picker
        POSM.wireSymbologyModeGrid();
        POSM.initRampPicker();
        POSM.initAgeRampPicker();
        POSM.wireAgePanel();

        // Point shape changed
        document.getElementById('sym-point-shape').addEventListener('change', function() {
            var layerName = document.getElementById('sym-layer').value;
            if (!layerName || !POSM.layerData[layerName]) return;
            POSM.changePointSymbol(layerName, this.value);
            POSM.scheduleSave();
        });

        // Arrows toggled
        document.getElementById('sym-arrows').addEventListener('change', function() {
            var layerName = document.getElementById('sym-layer').value;
            if (!layerName || !POSM.layerData[layerName]) return;
            POSM.toggleArrows(layerName, this.checked);
            POSM.scheduleSave();
        });

        // Reset button
        document.getElementById('sym-reset').addEventListener('click', function() {
            var layerName = document.getElementById('sym-layer').value;
            if (!layerName || !POSM.layerData[layerName]) return;

            var info = POSM.layerData[layerName];

            // Remove arrows if any
            POSM.removeArrowDecorators(layerName);
            info.showArrows = false;
            document.getElementById('sym-arrows').checked = false;

            // Reset point symbol to circle
            if (info.pointSymbol && info.pointSymbol !== 'circle') {
                info.pointSymbol = 'circle';
                document.getElementById('sym-point-shape').value = 'circle';
                POSM.rebuildLayer(layerName);
            } else {
                POSM.resetSymbology(layerName);
            }

            info.symbology = null;

            // Reset all mode field dropdowns
            var uvField = document.getElementById('sym-uv-field');
            if (uvField) uvField.value = '';
            var uvDateOpts = document.getElementById('sym-uv-date-options');
            if (uvDateOpts) uvDateOpts.style.display = 'none';
            var gradField = document.getElementById('sym-grad-field');
            if (gradField) { gradField.value = ''; }
            var gradOpts = document.getElementById('sym-grad-options');
            if (gradOpts) gradOpts.style.display = 'none';
            var propField = document.getElementById('sym-prop-field');
            if (propField) { propField.value = ''; }
            var propOpts = document.getElementById('sym-prop-options');
            if (propOpts) propOpts.style.display = 'none';
            var rulesList = document.getElementById('sym-rules-list');
            if (rulesList) rulesList.innerHTML = '';

            // Reset mode to unique
            var cells = document.querySelectorAll('.sym-mode-cell');
            cells.forEach(function(c) { c.classList.remove('active'); });
            var uniqueCell = document.querySelector('.sym-mode-cell[data-mode="unique"]');
            if (uniqueCell) uniqueCell.classList.add('active');
            POSM.showSymbologyPanel('unique');

            POSM.hidePendingDot();
            document.getElementById('legend-content').innerHTML = '<div class="status-text">Apply symbology to see legend</div>';
            POSM.state.activeSymbology = null;
            POSM.scheduleSave();
        });
    }

    // ---- LAYER SEARCH (client-side name filtering) ----
    function wireLayerSearch() {
        var input = document.getElementById('layer-search');
        var countEl = document.getElementById('layer-search-count');
        var clearBtn = document.getElementById('layer-search-clear');

        input.addEventListener('input', function() {
            var query = this.value.toLowerCase().trim();
            clearBtn.style.display = query ? '' : 'none';

            var items = document.querySelectorAll('#layer-list .layer-item');
            var total = items.length;
            var visible = 0;

            items.forEach(function(item) {
                var label = item.querySelector('label');
                var text = label ? label.textContent.toLowerCase() : '';
                if (!query || text.indexOf(query) !== -1) {
                    item.classList.remove('search-hidden');
                    visible++;
                } else {
                    item.classList.add('search-hidden');
                }
            });

            countEl.textContent = query ? visible + '/' + total : '';
        });

        clearBtn.addEventListener('click', function() {
            input.value = '';
            input.dispatchEvent(new Event('input'));
            input.focus();
        });
    }

    // ---- FILTER PANEL (attribute CQL filtering) ----
    function wireFilterPanel() {
        var panel = document.getElementById('filter-panel');
        var toggleBtn = document.getElementById('filter-toggle');
        var closeBtn = document.getElementById('filter-panel-close');
        var layerSelect = document.getElementById('filter-layer');
        var fieldSelect = document.getElementById('filter-field');
        var opSelect = document.getElementById('filter-op');
        var valueInput = document.getElementById('filter-value');
        var valueEndInput = document.getElementById('filter-value-end');
        var valueEndLabel = document.getElementById('filter-value-end-label');
        var hintEl = document.getElementById('filter-hint');
        var valueLabel = document.getElementById('filter-value-label');
        var applyBtn = document.getElementById('filter-apply');
        var clearBtn = document.getElementById('filter-clear');
        var listEl = document.getElementById('active-filters-list');
        var combineRow = document.getElementById('filter-combine-row');
        var combineBtns = document.querySelectorAll('.filter-combine-btn');

        var currentFieldIsDate = false;
        var filterCombineMode = 'AND'; // 'AND' or 'OR'

        // Wire AND/OR toggle buttons
        combineBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                filterCombineMode = btn.getAttribute('data-combine');
                combineBtns.forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
            });
        });

        // Show/hide the combine row based on whether the selected layer has active filters
        function updateCombineRow() {
            var name = layerSelect.value;
            var info = name ? POSM.layerData[name] : null;
            var hasFilters = info && info.activeFilters && info.activeFilters.length > 0;
            combineRow.style.display = hasFilters ? 'flex' : 'none';
        }
        var currentFieldValues = []; // unique values for autocomplete
        var suggestionsEl = document.getElementById('filter-suggestions');
        var suggestionsEndEl = document.getElementById('filter-suggestions-end');

        // ---- Autocomplete helpers ----
        function extractUniqueValues(geojson, field) {
            if (!geojson || !geojson.features) return [];
            var valSet = {};
            geojson.features.forEach(function(f) {
                var v = f.properties ? f.properties[field] : null;
                if (v === null || v === undefined || v === '') return;
                var s = String(v);
                valSet[s] = true;
            });
            return Object.keys(valSet).sort(function(a, b) {
                return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
            });
        }

        function showSuggestions(input, dropdown, query) {
            dropdown.innerHTML = '';
            if (!query && currentFieldValues.length > 0) {
                // Show all values (capped) when input is focused but empty
                var all = currentFieldValues.slice(0, 50);
                all.forEach(function(val) {
                    appendSuggestionItem(dropdown, val, input);
                });
                dropdown.classList.add('open');
                return;
            }
            if (!query) { dropdown.classList.remove('open'); return; }

            var lower = query.toLowerCase();
            var matches = currentFieldValues.filter(function(v) {
                return v.toLowerCase().indexOf(lower) !== -1;
            }).slice(0, 30);

            if (matches.length === 0) {
                dropdown.classList.remove('open');
                return;
            }
            matches.forEach(function(val) {
                appendSuggestionItem(dropdown, val, input);
            });
            dropdown.classList.add('open');
        }

        function appendSuggestionItem(dropdown, val, input) {
            var item = document.createElement('div');
            item.className = 'filter-suggestion-item';
            item.textContent = val;
            item.title = val;
            item.addEventListener('mousedown', function(e) {
                e.preventDefault(); // prevent blur before click registers
                input.value = val;
                dropdown.classList.remove('open');
            });
            dropdown.appendChild(item);
        }

        function wireAutocomplete(input, dropdown) {
            input.addEventListener('input', function() {
                if (currentFieldIsDate) return;
                showSuggestions(input, dropdown, this.value);
            });
            input.addEventListener('focus', function() {
                if (currentFieldIsDate || currentFieldValues.length === 0) return;
                showSuggestions(input, dropdown, this.value);
            });
            input.addEventListener('blur', function() {
                // Small delay so mousedown on suggestion fires first
                setTimeout(function() { dropdown.classList.remove('open'); }, 150);
            });
        }

        wireAutocomplete(valueInput, suggestionsEl);
        wireAutocomplete(valueEndInput, suggestionsEndEl);

        // Toggle panel
        toggleBtn.addEventListener('click', function() {
            var isOpen = panel.classList.toggle('open');
            toggleBtn.classList.toggle('active', isOpen);
            if (isOpen) populateFilterLayers();
        });
        closeBtn.addEventListener('click', function() {
            panel.classList.remove('open');
            toggleBtn.classList.remove('active');
        });

        // Populate layer dropdown from loaded layers
        function populateFilterLayers() {
            var current = layerSelect.value;
            layerSelect.innerHTML = '<option value="">Select a layer...</option>';
            Object.keys(POSM.layerData).sort().forEach(function(name) {
                var opt = document.createElement('option');
                opt.value = name;
                opt.textContent = POSM.layerData[name].label;
                layerSelect.appendChild(opt);
            });
            if (current && POSM.layerData[current]) layerSelect.value = current;
        }

        // Switch value input between text and date mode
        function setDateMode(isDate) {
            currentFieldIsDate = isDate;
            valueInput.type = isDate ? 'date' : 'text';
            valueInput.placeholder = isDate ? '' : 'Enter value...';
            valueEndInput.type = isDate ? 'date' : 'text';
            valueEndInput.placeholder = isDate ? '' : 'End value...';
            // Reset values when switching type
            valueInput.value = '';
            valueEndInput.value = '';
        }

        // Layer changed → populate fields
        layerSelect.addEventListener('change', function() {
            var name = this.value;
            fieldSelect.innerHTML = '<option value="">Select a field...</option>';
            fieldSelect.disabled = true;
            opSelect.disabled = true;
            valueInput.disabled = true;
            applyBtn.disabled = true;
            setDateMode(false);
            currentFieldValues = [];

            if (!name || !POSM.layerData[name]) return;

            var fields = POSM.layerData[name].fields || [];
            fields.forEach(function(f) {
                var opt = document.createElement('option');
                opt.value = f;
                opt.textContent = f;
                fieldSelect.appendChild(opt);
            });
            fieldSelect.disabled = false;

            // Enable clear if this layer has an active filter
            clearBtn.disabled = !POSM.layerData[name].activeFilter;
            updateCombineRow();
        });

        // Field changed → detect type, enable operator, build autocomplete values
        fieldSelect.addEventListener('change', function() {
            var field = this.value;
            opSelect.disabled = !field;

            // Detect date field + extract unique values
            var layerName = layerSelect.value;
            if (field && layerName && POSM.layerData[layerName]) {
                var info = POSM.layerData[layerName];
                setDateMode(POSM.isDateField(info.geojson, field));
                currentFieldValues = currentFieldIsDate ? [] : extractUniqueValues(info.geojson, field);
            } else {
                setDateMode(false);
                currentFieldValues = [];
            }

            // Close any open suggestions
            suggestionsEl.classList.remove('open');
            suggestionsEndEl.classList.remove('open');

            updateValueState();
        });

        // Operator changed → show/hide value input
        opSelect.addEventListener('change', updateValueState);

        function updateValueState() {
            var op = opSelect.value;
            var field = fieldSelect.value;
            var isNullOp = (op === 'IS NULL' || op === 'IS NOT NULL');
            var isLikeOp = (op === 'LIKE' || op === 'ILIKE');
            var isBetween = (op === 'BETWEEN');

            valueInput.disabled = !field || isNullOp;
            valueLabel.style.display = isNullOp ? 'none' : '';
            valueLabel.textContent = isBetween ? 'From' : 'Value';
            valueInput.style.display = isNullOp ? 'none' : '';

            // Show/hide end value for BETWEEN
            valueEndInput.disabled = !field || !isBetween;
            valueEndInput.style.display = isBetween ? '' : 'none';
            valueEndLabel.style.display = isBetween ? '' : 'none';

            // Hints
            var isContains = (op === 'CONTAINS');
            if (currentFieldIsDate && !isNullOp) {
                hintEl.textContent = isBetween ? 'Select a date range' : 'Select a date';
                hintEl.style.display = 'block';
            } else if (isContains) {
                hintEl.textContent = 'Case-insensitive substring match';
                hintEl.style.display = 'block';
            } else {
                hintEl.textContent = 'Use % as wildcard for LIKE (e.g. %Main%)';
                hintEl.style.display = isLikeOp ? 'block' : 'none';
            }

            applyBtn.disabled = !field;
        }

        // Build a CQL string from current inputs
        function buildCql() {
            var field = fieldSelect.value;
            var op = opSelect.value;
            var val = valueInput.value;

            if (op === 'IS NULL' || op === 'IS NOT NULL') {
                return field + ' ' + op;
            } else if (op === 'BETWEEN') {
                var valEnd = valueEndInput.value;
                if (!val || !valEnd) return null;
                return field + " >= '" + val.replace(/'/g, "''") + "' AND " + field + " <= '" + valEnd.replace(/'/g, "''") + "'";
            } else if (op === 'CONTAINS') {
                return field + " ILIKE '%" + val.replace(/'/g, "''") + "%'";
            } else if (op === 'LIKE' || op === 'ILIKE') {
                return field + ' ' + op + " '" + val.replace(/'/g, "''") + "'";
            } else if (currentFieldIsDate) {
                return field + ' ' + op + " '" + val.replace(/'/g, "''") + "'";
            } else {
                var numVal = Number(val);
                if (!isNaN(numVal) && val.trim() !== '') {
                    return field + ' ' + op + ' ' + numVal;
                } else {
                    return field + ' ' + op + " '" + val.replace(/'/g, "''") + "'";
                }
            }
        }

        // Build a short label for the active filter badge
        function buildFilterLabel() {
            var field = fieldSelect.value;
            var op = opSelect.value;
            var val = valueInput.value;
            if (op === 'IS NULL' || op === 'IS NOT NULL') return field + ' ' + op;
            if (op === 'BETWEEN') return field + ' ' + op + ' ' + val + ' / ' + valueEndInput.value;
            return field + ' ' + op + ' ' + val;
        }

        // Apply filter — adds to the filter stack
        applyBtn.addEventListener('click', async function() {
            var layerName = layerSelect.value;
            var field = fieldSelect.value;
            if (!layerName || !field) return;

            var cql = buildCql();
            if (!cql) return;
            var label = buildFilterLabel();

            var info = POSM.layerData[layerName];
            if (!info) return;

            // Initialize filter array if needed
            if (!info.activeFilters) info.activeFilters = [];
            info.activeFilters.push({ cql: cql, label: label });

            // Store the combine mode on the layer
            info.filterCombineMode = filterCombineMode;

            // Combine all filters with the selected mode
            var joiner = ' ' + filterCombineMode + ' ';
            var combinedCql = info.activeFilters.map(function(f) { return '(' + f.cql + ')'; }).join(joiner);
            await applyFilter(layerName, combinedCql);
            updateCombineRow();
            POSM.scheduleSave();
        });

        // Clear filter — clears ALL filters for the selected layer
        clearBtn.addEventListener('click', async function() {
            var layerName = layerSelect.value;
            if (!layerName) return;
            var info = POSM.layerData[layerName];
            if (info) info.activeFilters = [];
            await clearFilter(layerName);
            POSM.scheduleSave();
        });

        // Expose for the active filter badges
        POSM._filterPanel = {
            populateFilterLayers: populateFilterLayers,
            updateActiveFiltersList: updateActiveFiltersList
        };
    }

    // ---- APPLY CQL FILTER TO A LAYER ----
    async function applyFilter(layerName, cql) {
        var info = POSM.layerData[layerName];
        if (!info) return;

        showLoading('Filtering ' + info.label + '...');
        try {
            var geojson = await POSM.fetchLayerGeoJSON(info.fullName, cql);

            // Remove old layer from map
            POSM.removeArrowDecorators(layerName);
            POSM.removeLayerFromMap(layerName);

            // Store original data if not already stored (for clear)
            if (!info._originalGeojson) {
                info._originalGeojson = info.geojson;
            }

            // Replace with filtered data
            info.geojson = geojson;
            info.activeFilter = cql;

            // Recreate Leaflet layer
            var result = POSM.createLeafletLayer(geojson, layerName, info.color, info.pointSymbol, { clustered: info.clustered !== false });
            info.leafletLayer = result.leafletLayer;
            info.clusterGroup = result.clusterGroup;

            POSM.addLayerToMap(layerName);

            // Re-apply symbology if active
            if (info.symbology) {
                POSM.applySymbology(layerName, info.symbology);
            }

            // Re-apply labels on filtered data
            var savedLabel = info.labelField;
            if (savedLabel) {
                POSM.applyLabels(layerName, savedLabel);
            }

            // Update count in layer panel
            updateLayerCount(layerName);
            updateActiveFiltersList();

            // Enable clear button
            document.getElementById('filter-clear').disabled = false;

            console.log('Filtered ' + layerName + ': ' + cql + ' → ' +
                (geojson.features ? geojson.features.length : 0) + ' features');
        } catch (e) {
            console.error('Filter failed for ' + layerName + ':', e);
            alert('Filter failed: ' + e.message + '\n\nCheck your CQL expression.');
        } finally {
            hideLoading();
        }
    }

    // ---- CLEAR FILTER (reload full data) ----
    async function clearFilter(layerName) {
        var info = POSM.layerData[layerName];
        if (!info) return;

        showLoading('Reloading ' + info.label + '...');
        try {
            // Remove old
            POSM.removeArrowDecorators(layerName);
            POSM.removeLayerFromMap(layerName);

            // Restore original or re-fetch
            if (info._originalGeojson) {
                info.geojson = info._originalGeojson;
                delete info._originalGeojson;
            } else {
                info.geojson = await POSM.fetchLayerGeoJSON(info.fullName);
            }

            delete info.activeFilter;
            info.activeFilters = [];

            // Recreate
            var result = POSM.createLeafletLayer(info.geojson, layerName, info.color, info.pointSymbol, { clustered: info.clustered !== false });
            info.leafletLayer = result.leafletLayer;
            info.clusterGroup = result.clusterGroup;

            POSM.addLayerToMap(layerName);

            if (info.symbology) {
                POSM.applySymbology(layerName, info.symbology);
            }

            // Re-apply labels on restored data
            var savedLabel = info.labelField;
            if (savedLabel) {
                POSM.applyLabels(layerName, savedLabel);
            }

            updateLayerCount(layerName);
            updateActiveFiltersList();

            document.getElementById('filter-clear').disabled = true;

            console.log('Cleared filter on ' + layerName);
        } catch (e) {
            console.error('Failed to clear filter on ' + layerName + ':', e);
        } finally {
            hideLoading();
        }
    }

    // ---- UPDATE FEATURE COUNT for a single layer in the panel ----
    function updateLayerCount(layerName) {
        var info = POSM.layerData[layerName];
        if (!info) return;
        var items = document.querySelectorAll('#layer-list .layer-item');
        items.forEach(function(item) {
            var cb = item.querySelector('input[type="checkbox"]');
            if (cb && cb.id === 'chk-' + layerName) {
                var countEl = item.querySelector('.layer-count');
                if (countEl) {
                    var n = info.geojson && info.geojson.features ? info.geojson.features.length : 0;
                    var filtered = info.activeFilter ? ' filtered' : '';
                    countEl.textContent = '(' + n + filtered + ')';
                    countEl.style.color = info.activeFilter ? '#42d4f4' : '';
                }
            }
        });
    }

    // ---- UPDATE ACTIVE FILTERS LIST ----
    function updateActiveFiltersList() {
        var listEl = document.getElementById('active-filters-list');
        listEl.innerHTML = '';
        var hasFilters = false;
        var names = Object.keys(POSM.layerData).sort();
        for (var n = 0; n < names.length; n++) {
            var name = names[n];
            var info = POSM.layerData[name];
            var filters = info.activeFilters;
            if (!filters || filters.length === 0) continue;
            hasFilters = true;

            var combineMode = info.filterCombineMode || 'AND';

            for (var fi = 0; fi < filters.length; fi++) {
                // Show AND/OR separator between badges
                if (fi > 0) {
                    var sep = document.createElement('div');
                    sep.className = 'active-filter-separator';
                    sep.textContent = combineMode;
                    listEl.appendChild(sep);
                }

                (function(layerName, filterIndex, filter) {
                    var badge = document.createElement('div');
                    badge.className = 'active-filter-badge';

                    var text = document.createElement('div');
                    text.className = 'active-filter-text';
                    text.innerHTML = '<span class="active-filter-layer">' + escapeHtml(info.label) + '</span> ' +
                        '<span class="active-filter-expr">' + escapeHtml(filter.label) + '</span>';
                    text.title = info.label + ': ' + filter.label;

                    var removeBtn = document.createElement('button');
                    removeBtn.className = 'active-filter-remove';
                    removeBtn.innerHTML = '&times;';
                    removeBtn.title = 'Remove this filter';
                    removeBtn.addEventListener('click', async function() {
                        await removeOneFilter(layerName, filterIndex);
                    });

                    badge.appendChild(text);
                    badge.appendChild(removeBtn);
                    listEl.appendChild(badge);
                })(name, fi, filters[fi]);
            }
        }

        if (!hasFilters) {
            listEl.innerHTML = '<div class="status-text">No active filters</div>';
        }
    }

    // ---- REMOVE A SINGLE FILTER FROM A LAYER'S STACK ----
    async function removeOneFilter(layerName, filterIndex) {
        var info = POSM.layerData[layerName];
        if (!info || !info.activeFilters) return;

        info.activeFilters.splice(filterIndex, 1);

        if (info.activeFilters.length === 0) {
            // No filters left — clear entirely
            await clearFilter(layerName);
        } else {
            // Re-apply remaining filters with stored combine mode
            var mode = info.filterCombineMode || 'AND';
            var joiner = ' ' + mode + ' ';
            var combinedCql = info.activeFilters.map(function(f) { return '(' + f.cql + ')'; }).join(joiner);
            await applyFilter(layerName, combinedCql);
        }
        POSM.scheduleSave();
    }

    // ---- WORKSPACE SELECTOR MODAL ----
    var allDiscoveredWorkspaces = [];
    var isAdminUser = false;

    function showWorkspaceModal(workspaces) {
        return new Promise(function(resolve) {
            var overlay = document.getElementById('ws-modal-overlay');
            var select = document.getElementById('ws-modal-select');
            var btnOk = document.getElementById('ws-modal-ok');
            var btnAll = document.getElementById('ws-modal-all');

            // Clone fresh buttons to remove old listeners
            var newBtnOk = btnOk.cloneNode(true);
            var newBtnAll = btnAll.cloneNode(true);
            btnOk.parentNode.replaceChild(newBtnOk, btnOk);
            btnAll.parentNode.replaceChild(newBtnAll, btnAll);

            // Populate dropdown
            select.innerHTML = '<option value="">Choose a workspace...</option>';
            workspaces.sort().forEach(function(ws) {
                var opt = document.createElement('option');
                opt.value = ws;
                opt.textContent = ws;
                select.appendChild(opt);
            });

            newBtnAll.disabled = false;
            newBtnOk.disabled = true;

            select.onchange = function() {
                newBtnOk.disabled = !this.value;
            };

            newBtnOk.addEventListener('click', function() {
                overlay.style.display = 'none';
                POSM.setSelectedWorkspace(select.value);
                resolve([select.value]);
            });

            newBtnAll.addEventListener('click', function() {
                overlay.style.display = 'none';
                sessionStorage.removeItem('posm_selected_workspace');
                resolve(workspaces);
            });

            overlay.style.display = 'flex';
        });
    }

    function updateWorkspaceBar(workspaces) {
        var bar = document.getElementById('ws-bar');
        var nameEl = document.getElementById('ws-bar-name');
        if (!isAdminUser) {
            bar.style.display = 'none';
            return;
        }
        bar.style.display = '';
        if (workspaces.length === 1) {
            nameEl.textContent = workspaces[0];
            nameEl.title = workspaces[0];
        } else {
            nameEl.textContent = 'All (' + workspaces.length + ')';
            nameEl.title = workspaces.join(', ');
        }
    }

    // ---- CLEAR ALL LAYERS FROM MAP ----
    function clearAllLayers() {
        Object.keys(POSM.layerData).forEach(function(name) {
            POSM.removeArrowDecorators(name);
            POSM.removeLayerFromMap(name);
        });
        POSM.layerData = {};
        POSM.state.layerIndex = 0;
        POSM.state.activeSymbology = null;
    }

    // ---- LOAD LAYERS FOR CURRENT WORKSPACES ----
    async function loadLayers() {
        showLoading('Discovering layers...');
        var layers = await POSM.discoverLayers();
        hideLoading();

        if (layers.length === 0) {
            document.getElementById('layer-list').innerHTML =
                '<div class="status-text" style="color:#e94560;">No layers found in this workspace.</div>';
            document.getElementById('legend-content').innerHTML = '<div class="status-text">Apply symbology to see legend</div>';
            POSM.buildSymbologyDropdowns();
            return;
        }

        var bounds = L.latLngBounds();
        var hasFeatures = false;

        await Promise.all(layers.map(async function(layer) {
            showLoading('Loading ' + layer.label + '...');
            try {
                var geojson = await POSM.fetchLayerGeoJSON(layer.fullName);
                if (!geojson.features || geojson.features.length === 0) {
                    console.log('Layer ' + layer.shortName + ': no features');
                    hideLoading();
                    return;
                }

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

                console.log('Loaded ' + layer.shortName + ': ' + geojson.features.length + ' features (' + result.geomType + ')');
            } catch (e) {
                console.error('Failed to load layer ' + layer.shortName + ':', e);
            } finally {
                hideLoading();
            }
        }));

        if (hasFeatures && bounds.isValid()) {
            POSM.map.fitBounds(bounds, { padding: [30, 30] });
        }

        buildLayerPanel();
        POSM.buildSymbologyDropdowns();
        POSM.initLabelZoomListener();
        document.getElementById('legend-content').innerHTML = '<div class="status-text">Apply symbology to see legend</div>';

        // Refresh filter panel dropdowns
        if (POSM._filterPanel) {
            POSM._filterPanel.populateFilterLayers();
            POSM._filterPanel.updateActiveFiltersList();
        }

        // Reset layer search
        var searchInput = document.getElementById('layer-search');
        if (searchInput) { searchInput.value = ''; searchInput.dispatchEvent(new Event('input')); }

        console.log('Map ready with ' + Object.keys(POSM.layerData).length + ' layers');
    }

    // ---- SWITCH WORKSPACE (admin) ----
    async function switchWorkspace() {
        var chosen = await showWorkspaceModal(allDiscoveredWorkspaces);
        clearAllLayers();
        POSM.CONFIG.WORKSPACES = chosen;
        updateWorkspaceBar(chosen);
        await loadLayers();
    }

    // ---- SET UP USER SESSION / WORKSPACES ----
    async function setupSession() {
        var user = POSM.getCurrentUser();
        var userWorkspaces = POSM.getUserWorkspaces();

        var userDisplay = document.getElementById('user-display');
        if (userDisplay) {
            userDisplay.textContent = user.displayName;
        }

        if (userWorkspaces.indexOf('__ALL__') !== -1) {
            isAdminUser = true;
            allDiscoveredWorkspaces = await POSM.discoverWorkspaces();
            var chosen = await showWorkspaceModal(allDiscoveredWorkspaces);
            POSM.CONFIG.WORKSPACES = chosen;
            updateWorkspaceBar(chosen);
        } else {
            isAdminUser = false;
            POSM.CONFIG.WORKSPACES = userWorkspaces;
            updateWorkspaceBar(userWorkspaces);
        }

        console.log('User: ' + user.displayName + ', Workspaces: ' + POSM.CONFIG.WORKSPACES.join(', '));
    }

    // ---- MAIN INIT ----
    async function init() {
        wireEvents();
        wireLayerSearch();
        wireFilterPanel();

        // Wire workspace switch button
        document.getElementById('ws-bar-switch').addEventListener('click', function() {
            switchWorkspace();
        });

        showLoading('Setting up session...');
        await setupSession();
        hideLoading();

        await loadLayers();

        // ---- RESTORE SAVED SESSION ----
        var savedConfig = await POSM.loadSession();
        if (savedConfig) {
            await POSM.applySession(savedConfig);
        }

        // ---- AUTO-SAVE ON MAP MOVE/ZOOM (debounced) ----
        POSM.map.on('moveend', function() {
            POSM.scheduleSave();
        });
    }

    // ---- GO ----
    init();

})(window.POSM);

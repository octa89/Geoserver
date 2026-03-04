(function(POSM) {
    'use strict';

    // ---- MODE GRID ----
    POSM.wireSymbologyModeGrid = function() {
        var cells = document.querySelectorAll('.sym-mode-cell');
        cells.forEach(function(cell) {
            cell.addEventListener('click', function() {
                cells.forEach(function(c) { c.classList.remove('active'); });
                cell.classList.add('active');
                var mode = cell.getAttribute('data-mode');
                POSM.showSymbologyPanel(mode);
            });
        });
    };

    POSM.showSymbologyPanel = function(mode) {
        var panels = document.querySelectorAll('.sym-panel');
        panels.forEach(function(p) { p.style.display = 'none'; });

        var panel = document.getElementById('sym-panel-' + mode);
        if (panel) panel.style.display = 'block';

        // Hide pending dot when switching modes
        var dot = document.getElementById('sym-pending-dot');
        if (dot) dot.style.display = 'none';
    };

    // ---- POPULATE FIELD DROPDOWNS PER MODE ----
    POSM.populateModeFields = function(layerName) {
        var info = POSM.layerData[layerName];
        if (!info) return;

        var fields = info.fields || [];
        var numericFields = fields.filter(function(f) {
            return POSM.isNumericField(info.geojson, f);
        });

        // Unique Values: all fields
        var uvField = document.getElementById('sym-uv-field');
        if (uvField) {
            uvField.innerHTML = '<option value="">Select a field...</option>';
            fields.forEach(function(f) {
                var opt = document.createElement('option');
                opt.value = f; opt.textContent = f;
                uvField.appendChild(opt);
            });
            uvField.disabled = false;
        }

        // Graduated: numeric fields only
        var gradField = document.getElementById('sym-grad-field');
        if (gradField) {
            gradField.innerHTML = '<option value="">Select a numeric field...</option>';
            numericFields.forEach(function(f) {
                var opt = document.createElement('option');
                opt.value = f; opt.textContent = f;
                gradField.appendChild(opt);
            });
            gradField.disabled = false;
            // Hide extra options until field chosen
            var gradOpts = document.getElementById('sym-grad-options');
            if (gradOpts) gradOpts.style.display = 'none';
        }

        // Proportional: numeric fields only
        var propField = document.getElementById('sym-prop-field');
        if (propField) {
            propField.innerHTML = '<option value="">Select a numeric field...</option>';
            numericFields.forEach(function(f) {
                var opt = document.createElement('option');
                opt.value = f; opt.textContent = f;
                propField.appendChild(opt);
            });
            propField.disabled = false;
            var propOpts = document.getElementById('sym-prop-options');
            if (propOpts) propOpts.style.display = 'none';
        }

        // Rules: populate the field options for rule cards
        POSM._ruleFields = fields;

        // Age: date fields only
        var dateFields = fields.filter(function(f) {
            return POSM.isDateField(info.geojson, f);
        });
        var ageField = document.getElementById('sym-age-field');
        if (ageField) {
            ageField.innerHTML = '<option value="">Select a date field...</option>';
            dateFields.forEach(function(f) {
                var opt = document.createElement('option');
                opt.value = f; opt.textContent = f;
                ageField.appendChild(opt);
            });
            ageField.disabled = dateFields.length === 0;
            var ageOpts = document.getElementById('sym-age-options');
            if (ageOpts) ageOpts.style.display = 'none';

            // Show remove button if age already computed
            var removeBtn = document.getElementById('sym-age-remove');
            if (removeBtn) {
                removeBtn.style.display = info.ageConfig ? 'block' : 'none';
            }

            // Pre-select if age config exists
            if (info.ageConfig) {
                ageField.value = info.ageConfig.field;
                if (ageOpts) ageOpts.style.display = 'block';
                var unitSel = document.getElementById('sym-age-unit');
                if (unitSel) unitSel.value = info.ageConfig.unit;
            }
        }
    };

    // ---- RAMP PICKER ----
    POSM.initRampPicker = function() {
        var picker = document.getElementById('sym-ramp-picker');
        var selected = document.getElementById('sym-ramp-selected');
        var dropdown = document.getElementById('sym-ramp-dropdown');
        if (!picker || !selected || !dropdown) return;

        // Build dropdown items
        dropdown.innerHTML = '';
        Object.keys(POSM.COLOR_RAMPS).forEach(function(key) {
            var item = document.createElement('div');
            item.className = 'ramp-item';
            item.setAttribute('data-ramp', key);

            var canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 16;
            canvas.className = 'ramp-canvas';
            POSM.drawRamp(canvas, key);

            var label = document.createElement('span');
            label.className = 'ramp-label';
            label.textContent = key;

            item.appendChild(canvas);
            item.appendChild(label);
            dropdown.appendChild(item);

            item.addEventListener('click', function() {
                POSM._selectedRamp = key;
                updateSelectedDisplay(key);
                dropdown.classList.remove('open');
            });
        });

        // Default selection
        POSM._selectedRamp = 'Blues';
        updateSelectedDisplay('Blues');

        // Toggle dropdown
        selected.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });

        // Close on outside click
        document.addEventListener('click', function() {
            dropdown.classList.remove('open');
        });

        function updateSelectedDisplay(key) {
            selected.innerHTML = '';
            var canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 16;
            canvas.className = 'ramp-canvas';
            POSM.drawRamp(canvas, key);
            var label = document.createElement('span');
            label.className = 'ramp-label';
            label.textContent = key;
            selected.appendChild(canvas);
            selected.appendChild(label);
        }
    };

    // ---- PENDING DOT ----
    POSM.showPendingDot = function() {
        var dot = document.getElementById('sym-pending-dot');
        if (dot) dot.style.display = 'inline-block';
    };

    POSM.hidePendingDot = function() {
        var dot = document.getElementById('sym-pending-dot');
        if (dot) dot.style.display = 'none';
    };

    // ---- RULE BUILDER ----
    POSM.addRuleCard = function() {
        var container = document.getElementById('sym-rules-list');
        if (!container) return;

        var ruleId = 'rule-' + Date.now();
        var card = document.createElement('div');
        card.className = 'rule-card';
        card.id = ruleId;
        card.setAttribute('data-expanded', 'true');

        var fields = POSM._ruleFields || [];
        var fieldOpts = fields.map(function(f) {
            return '<option value="' + f + '">' + f + '</option>';
        }).join('');

        card.innerHTML =
            '<div class="rule-card-header" data-toggle="' + ruleId + '">' +
                '<span class="rule-swatch" style="background:#e94560;"></span>' +
                '<span class="rule-preview">New rule</span>' +
                '<button class="rule-remove" data-remove="' + ruleId + '" title="Remove">&times;</button>' +
            '</div>' +
            '<div class="rule-card-body">' +
                '<label class="rule-label">Field</label>' +
                '<select class="sym-select rule-field">' +
                    '<option value="">Select field...</option>' + fieldOpts +
                '</select>' +
                '<label class="rule-label">Operator</label>' +
                '<select class="sym-select rule-operator">' +
                    '<option value="=">=</option>' +
                    '<option value="!=">!=</option>' +
                    '<option value=">">&gt;</option>' +
                    '<option value="<">&lt;</option>' +
                    '<option value=">=">&gt;=</option>' +
                    '<option value="<=">&lt;=</option>' +
                    '<option value="LIKE">LIKE</option>' +
                    '<option value="IS NULL">IS NULL</option>' +
                    '<option value="IS NOT NULL">IS NOT NULL</option>' +
                '</select>' +
                '<label class="rule-label">Value</label>' +
                '<input type="text" class="filter-value-input rule-value" placeholder="Enter value..." />' +
                '<label class="rule-label">Color</label>' +
                '<div class="rule-color-row">' +
                    '<input type="color" class="rule-color-picker" value="#e94560" />' +
                    '<input type="text" class="filter-value-input rule-color-hex" value="#e94560" style="flex:1;" />' +
                '</div>' +
            '</div>';

        container.appendChild(card);

        // Wire collapse/expand
        var header = card.querySelector('.rule-card-header');
        header.addEventListener('click', function(e) {
            if (e.target.classList.contains('rule-remove')) return;
            var expanded = card.getAttribute('data-expanded') === 'true';
            card.setAttribute('data-expanded', expanded ? 'false' : 'true');
            card.querySelector('.rule-card-body').style.display = expanded ? 'none' : 'block';
        });

        // Wire remove
        card.querySelector('.rule-remove').addEventListener('click', function() {
            card.remove();
            POSM.showPendingDot();
        });

        // Wire color sync
        var colorPicker = card.querySelector('.rule-color-picker');
        var colorHex = card.querySelector('.rule-color-hex');
        var swatch = card.querySelector('.rule-swatch');

        colorPicker.addEventListener('input', function() {
            colorHex.value = this.value;
            swatch.style.background = this.value;
            POSM.showPendingDot();
        });
        colorHex.addEventListener('input', function() {
            if (/^#[0-9a-fA-F]{6}$/.test(this.value)) {
                colorPicker.value = this.value;
                swatch.style.background = this.value;
                POSM.showPendingDot();
            }
        });

        // Wire live preview update
        var rField = card.querySelector('.rule-field');
        var rOp = card.querySelector('.rule-operator');
        var rVal = card.querySelector('.rule-value');
        var preview = card.querySelector('.rule-preview');

        function updatePreview() {
            var f = rField.value || '...';
            var o = rOp.value || '=';
            var v = rVal.value;
            if (o === 'IS NULL' || o === 'IS NOT NULL') {
                preview.textContent = f + ' ' + o;
            } else {
                preview.textContent = f + ' ' + o + ' ' + (v || '...');
            }
            POSM.showPendingDot();
        }

        rField.addEventListener('change', updatePreview);
        rOp.addEventListener('change', function() {
            var isNull = (rOp.value === 'IS NULL' || rOp.value === 'IS NOT NULL');
            rVal.style.display = isNull ? 'none' : '';
            rVal.previousElementSibling.style.display = isNull ? 'none' : '';
            updatePreview();
        });
        rVal.addEventListener('input', updatePreview);

        POSM.showPendingDot();
    };

    // ---- AGE RAMP PICKER (mirrors the graduated ramp picker) ----
    POSM.initAgeRampPicker = function() {
        var picker = document.getElementById('sym-age-ramp-picker');
        var selected = document.getElementById('sym-age-ramp-selected');
        var dropdown = document.getElementById('sym-age-ramp-dropdown');
        if (!picker || !selected || !dropdown) return;

        dropdown.innerHTML = '';
        Object.keys(POSM.COLOR_RAMPS).forEach(function(key) {
            var item = document.createElement('div');
            item.className = 'ramp-item';
            item.setAttribute('data-ramp', key);

            var canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 16;
            canvas.className = 'ramp-canvas';
            POSM.drawRamp(canvas, key);

            var label = document.createElement('span');
            label.className = 'ramp-label';
            label.textContent = key;

            item.appendChild(canvas);
            item.appendChild(label);
            dropdown.appendChild(item);

            item.addEventListener('click', function() {
                POSM._selectedAgeRamp = key;
                updateDisplay(key);
                dropdown.classList.remove('open');
            });
        });

        POSM._selectedAgeRamp = 'YlOrRd';
        updateDisplay('YlOrRd');

        selected.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });

        document.addEventListener('click', function(e) {
            if (!picker.contains(e.target)) dropdown.classList.remove('open');
        });

        function updateDisplay(key) {
            selected.innerHTML = '';
            var canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 16;
            canvas.className = 'ramp-canvas';
            POSM.drawRamp(canvas, key);
            var label = document.createElement('span');
            label.className = 'ramp-label';
            label.textContent = key;
            selected.appendChild(canvas);
            selected.appendChild(label);
        }
    };

    // ---- AGE PANEL WIRING ----
    POSM.wireAgePanel = function() {
        var ageField = document.getElementById('sym-age-field');
        var ageOpts = document.getElementById('sym-age-options');
        var applyBtn = document.getElementById('sym-age-apply');
        var removeBtn = document.getElementById('sym-age-remove');
        if (!ageField || !ageOpts || !applyBtn) return;

        ageField.addEventListener('change', function() {
            ageOpts.style.display = ageField.value ? 'block' : 'none';
        });

        applyBtn.addEventListener('click', function() {
            var layerName = document.getElementById('sym-layer').value;
            if (!layerName || !ageField.value) return;

            var unit = document.getElementById('sym-age-unit').value;
            var method = document.getElementById('sym-age-method').value;
            var nClasses = parseInt(document.getElementById('sym-age-classes').value);
            var ramp = POSM._selectedAgeRamp || 'YlOrRd';
            var addLabels = document.getElementById('sym-age-labels').checked;

            // Step 1: compute age
            if (POSM._computeAge) {
                POSM._computeAge(layerName, ageField.value, unit);
            }

            var info = POSM.layerData[layerName];
            if (!info || !info.ageConfig) return;

            // Step 2: apply graduated symbology on computed field
            POSM.applyGraduated(layerName, {
                mode: 'graduated',
                field: info.ageConfig.computedField,
                method: method,
                nClasses: nClasses,
                ramp: ramp
            });

            // Step 3: optionally apply labels
            if (addLabels) {
                POSM.applyLabels(layerName, info.ageConfig.computedField);
            }

            if (removeBtn) removeBtn.style.display = 'block';
        });

        if (removeBtn) {
            removeBtn.addEventListener('click', function() {
                var layerName = document.getElementById('sym-layer').value;
                if (!layerName) return;

                var info = POSM.layerData[layerName];
                if (!info || !info.ageConfig) return;

                // Remove labels if they were on the age field
                if (info.labelField === info.ageConfig.computedField) {
                    POSM.removeLabels(layerName);
                }

                // Remove computed field
                if (POSM._removeAge) {
                    POSM._removeAge(layerName);
                }

                // Reset symbology
                POSM.resetSymbology(layerName);

                removeBtn.style.display = 'none';
                ageField.value = '';
                ageOpts.style.display = 'none';
            });
        }
    };

    // Collect rules from the UI
    POSM.collectRules = function() {
        var cards = document.querySelectorAll('#sym-rules-list .rule-card');
        var rules = [];
        cards.forEach(function(card) {
            var field = card.querySelector('.rule-field').value;
            var op = card.querySelector('.rule-operator').value;
            var val = card.querySelector('.rule-value').value;
            var color = card.querySelector('.rule-color-picker').value;
            if (field) {
                rules.push({ field: field, operator: op, value: val, color: color });
            }
        });
        return rules;
    };

})(window.POSM);

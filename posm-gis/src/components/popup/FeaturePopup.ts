/**
 * FeaturePopup — imperative popup binding module.
 *
 * Matches the vanilla JS popup system exactly:
 * - Header with layer title + gear (⚙) button for field config
 * - Smart field ordering (images first, links second, rest alphabetical)
 * - Respects popupConfig: custom field order, hidden fields, title text/field
 * - Gear button opens a DOM-based config modal with drag-to-reorder + checkboxes
 *
 * This is NOT a React component — it's imperative Leaflet/DOM code.
 */

import L from 'leaflet';
import { useStore } from '../../store';
import {
  smartSortFields,
  formatPopupValue,
  escapeHtml,
} from '../../lib/popupUtils';
import type { PopupConfig } from '../../types/layer';

// ---------------------------------------------------------------------------
// Helpers — read popupConfig from store at render time
// ---------------------------------------------------------------------------

function getLayerInfo(layerName: string) {
  return useStore.getState().layers[layerName] ?? null;
}

/** Get popup title matching vanilla JS logic. */
function getPopupTitle(
  props: Record<string, unknown>,
  layerName: string
): string {
  const info = getLayerInfo(layerName);
  if (info?.popupConfig) {
    const pc = info.popupConfig;
    if (pc.titleField && props[pc.titleField] != null && props[pc.titleField] !== '') {
      const prefix = pc.titleText ? pc.titleText + ' ' : '';
      return prefix + String(props[pc.titleField]);
    }
    if (pc.titleText) return pc.titleText;
  }
  // Fallback: layer label or short name
  if (info?.label) return info.label;
  const colonIdx = layerName.indexOf(':');
  return colonIdx !== -1 ? layerName.substring(colonIdx + 1) : layerName;
}

/** Get ordered, filtered fields matching vanilla JS logic. */
function getPopupFields(
  props: Record<string, unknown>,
  layerName: string
): string[] {
  const info = getLayerInfo(layerName);
  if (info?.popupConfig?.fieldOrder) {
    const hidden = info.popupConfig.hiddenFields || {};
    return info.popupConfig.fieldOrder.filter(
      (k) => !hidden[k] && props[k] != null && props[k] !== ''
    );
  }
  return smartSortFields(props);
}

// ---------------------------------------------------------------------------
// buildPopupHtml — with gear button
// ---------------------------------------------------------------------------

function buildPopupHtml(
  props: Record<string, unknown>,
  layerName: string
): string {
  const title = getPopupTitle(props, layerName);
  const keys = getPopupFields(props, layerName);

  let tableRows = '';
  let hasContent = false;
  for (const k of keys) {
    const v = props[k];
    if (v === null || v === undefined || v === '') continue;
    hasContent = true;
    tableRows += `<tr><td>${escapeHtml(k)}</td><td>${formatPopupValue(v)}</td></tr>`;
  }
  if (!hasContent) {
    tableRows = '<tr><td colspan="2" style="text-align:center;color:#999;">No attributes</td></tr>';
  }

  return `<div class="popup-header"><span>${escapeHtml(title)}</span><button class="popup-config-btn" data-layer="${escapeHtml(layerName)}" title="Configure fields">&#9881;</button></div><div class="popup-body"><table class="popup-table"><tbody>${tableRows}</tbody></table></div>`;
}

// ---------------------------------------------------------------------------
// Popup field config modal (imperative DOM — matches vanilla JS exactly)
// ---------------------------------------------------------------------------

function openPopupFieldConfig(layerName: string, sampleProps: Record<string, unknown>) {
  // Remove existing modal
  const existing = document.getElementById('popup-field-config');
  if (existing) existing.parentNode?.removeChild(existing);

  const info = getLayerInfo(layerName);
  if (!info) return;

  const allFields = info.fields.length > 0 ? info.fields : Object.keys(sampleProps).sort();

  // Determine current order and hidden fields
  let currentOrder: string[];
  let hiddenFields: Record<string, boolean>;

  if (info.popupConfig?.fieldOrder) {
    currentOrder = [...info.popupConfig.fieldOrder];
    hiddenFields = { ...(info.popupConfig.hiddenFields || {}) };
    // Add any new fields not in saved order
    for (const f of allFields) {
      if (!currentOrder.includes(f)) currentOrder.push(f);
    }
  } else {
    // Start with smart order (images/links first)
    currentOrder = smartSortFields(sampleProps);
    hiddenFields = {};
    // Add fields that were null/empty so user can enable them
    for (const f of allFields) {
      if (!currentOrder.includes(f)) {
        currentOrder.push(f);
        hiddenFields[f] = true;
      }
    }
  }

  // Build modal overlay
  const modal = document.createElement('div');
  modal.id = 'popup-field-config';
  modal.className = 'popup-field-config-overlay';

  const panel = document.createElement('div');
  panel.className = 'popup-field-config-panel';

  // ---- Header ----
  const header = document.createElement('div');
  header.className = 'popup-field-config-header';
  header.innerHTML =
    '<span>Configure Popup Fields</span>' +
    '<button class="popup-field-config-close" title="Close">&times;</button>';
  panel.appendChild(header);

  // ---- Title config section ----
  const titleSection = document.createElement('div');
  titleSection.className = 'popup-title-config';

  const titleLabel = document.createElement('div');
  titleLabel.className = 'popup-title-config-label';
  titleLabel.textContent = 'Popup Title';
  titleSection.appendChild(titleLabel);

  const titleRow = document.createElement('div');
  titleRow.className = 'popup-title-config-row';

  const titleTextInput = document.createElement('input');
  titleTextInput.type = 'text';
  titleTextInput.className = 'popup-title-text-input';
  titleTextInput.placeholder = 'Custom text (optional)';
  titleTextInput.value = info.popupConfig?.titleText || '';

  const titleFieldSelect = document.createElement('select');
  titleFieldSelect.className = 'popup-title-field-select';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'No field';
  titleFieldSelect.appendChild(defaultOpt);
  for (const f of allFields) {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    if (info.popupConfig?.titleField === f) opt.selected = true;
    titleFieldSelect.appendChild(opt);
  }

  titleRow.appendChild(titleTextInput);
  titleRow.appendChild(titleFieldSelect);
  titleSection.appendChild(titleRow);

  const titleHint = document.createElement('div');
  titleHint.className = 'popup-title-hint';
  titleHint.textContent =
    'Text + field shows "Text FieldValue". Field alone shows the value. Neither uses layer name.';
  titleSection.appendChild(titleHint);

  panel.appendChild(titleSection);

  // ---- Field list (drag-to-reorder + checkboxes) ----
  const list = document.createElement('div');
  list.className = 'popup-field-config-list';

  let dragSrcIndex: number | null = null;

  for (let i = 0; i < currentOrder.length; i++) {
    const fieldName = currentOrder[i];
    const row = document.createElement('div');
    row.className = 'popup-field-config-row';
    row.draggable = true;
    row.dataset.field = fieldName;
    row.dataset.index = String(i);

    const handle = document.createElement('span');
    handle.className = 'popup-field-drag-handle';
    handle.textContent = '\u2261'; // ≡

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !hiddenFields[fieldName];
    checkbox.className = 'popup-field-checkbox';
    checkbox.dataset.field = fieldName;

    const label = document.createElement('span');
    label.className = 'popup-field-name';
    label.textContent = fieldName;

    row.appendChild(handle);
    row.appendChild(checkbox);
    row.appendChild(label);

    // Drag events
    row.addEventListener('dragstart', function (this: HTMLElement, e: DragEvent) {
      dragSrcIndex = parseInt(this.dataset.index!);
      this.classList.add('dragging');
      e.dataTransfer!.effectAllowed = 'move';
    });
    row.addEventListener('dragover', function (this: HTMLElement, e: DragEvent) {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      this.classList.add('drag-over');
    });
    row.addEventListener('dragleave', function (this: HTMLElement) {
      this.classList.remove('drag-over');
    });
    row.addEventListener('drop', function (this: HTMLElement, e: DragEvent) {
      e.preventDefault();
      this.classList.remove('drag-over');
      const dropIndex = parseInt(this.dataset.index!);
      if (dragSrcIndex === null || dragSrcIndex === dropIndex) return;

      const rows = list.querySelectorAll('.popup-field-config-row');
      const draggedRow = rows[dragSrcIndex];
      if (dropIndex > dragSrcIndex) {
        this.parentNode!.insertBefore(draggedRow, this.nextSibling);
      } else {
        this.parentNode!.insertBefore(draggedRow, this);
      }

      // Update indices
      const updatedRows = list.querySelectorAll('.popup-field-config-row');
      updatedRows.forEach((r, idx) => {
        (r as HTMLElement).dataset.index = String(idx);
      });
      dragSrcIndex = null;
    });
    row.addEventListener('dragend', function (this: HTMLElement) {
      this.classList.remove('dragging');
      list.querySelectorAll('.popup-field-config-row').forEach((r) => {
        r.classList.remove('drag-over');
      });
    });

    list.appendChild(row);
  }

  panel.appendChild(list);

  // ---- Buttons ----
  const btnBar = document.createElement('div');
  btnBar.className = 'popup-field-config-buttons';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'popup-field-config-reset';
  resetBtn.textContent = 'Reset to Default';
  resetBtn.addEventListener('click', () => {
    useStore.getState().setLayerPopupConfig(layerName, null);
    modal.parentNode?.removeChild(modal);
  });

  const doneBtn = document.createElement('button');
  doneBtn.className = 'popup-field-config-done';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', () => {
    // Read current order and visibility from DOM
    const rows = list.querySelectorAll('.popup-field-config-row');
    const newOrder: string[] = [];
    const newHidden: Record<string, boolean> = {};
    rows.forEach((r) => {
      const fn = (r as HTMLElement).dataset.field!;
      newOrder.push(fn);
      const cb = r.querySelector('.popup-field-checkbox') as HTMLInputElement;
      if (cb && !cb.checked) newHidden[fn] = true;
    });

    const config: PopupConfig = {
      fieldOrder: newOrder,
      hiddenFields: newHidden,
      titleText: titleTextInput.value.trim() || undefined,
      titleField: titleFieldSelect.value || undefined,
    };
    useStore.getState().setLayerPopupConfig(layerName, config);
    modal.parentNode?.removeChild(modal);
  });

  btnBar.appendChild(resetBtn);
  btnBar.appendChild(doneBtn);
  panel.appendChild(btnBar);

  // ---- Close handlers ----
  header.querySelector('.popup-field-config-close')!.addEventListener('click', () => {
    modal.parentNode?.removeChild(modal);
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.parentNode?.removeChild(modal);
  });

  modal.appendChild(panel);
  document.body.appendChild(modal);
}

// ---------------------------------------------------------------------------
// bindPopups
// ---------------------------------------------------------------------------

/**
 * Bind a click popup to a single feature/layer pair.
 */
function bindPopupToFeature(
  feature: GeoJSON.Feature,
  layer: L.Layer,
  leafletLayer: L.GeoJSON,
  layerName: string
): void {
  const props = (feature.properties ?? {}) as Record<string, unknown>;

  layer.on('click', (e: L.LeafletMouseEvent) => {
    const html = buildPopupHtml(props, layerName);

    // Resolve click position
    const latlng =
      e.latlng ??
      ((layer as L.Marker).getLatLng
        ? (layer as L.Marker).getLatLng()
        : null);
    if (!latlng) return;

    // Resolve map instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map: L.Map | undefined =
      (layer as any)._map ??
      (e.target as any)?._map ??
      (leafletLayer as any)._map;
    if (!map) return;

    const isMobile = window.innerWidth < 768;
    L.popup({ maxWidth: isMobile ? 280 : 380, maxHeight: isMobile ? 300 : 350, className: 'posm-popup' })
      .setLatLng(latlng)
      .setContent(html)
      .openOn(map);

    // Wire gear button after popup is in DOM (same technique as vanilla JS)
    setTimeout(() => {
      const btn = document.querySelector(
        `.popup-config-btn[data-layer="${layerName}"]`
      ) as HTMLElement | null;
      if (btn) {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          openPopupFieldConfig(layerName, props);
        });
      }
    }, 50);
  });
}

/**
 * Bind a click-triggered popup to every sub-layer in a Leaflet GeoJSON layer.
 * Also sets onEachFeature on the layer options so that popups are automatically
 * re-bound when the layer is rebuilt via clearLayers() + addData() (e.g. during
 * symbology changes that rebuild point layers).
 */
export function bindPopups(
  leafletLayer: L.GeoJSON,
  layerName: string,
  _fields: string[]
): void {
  // Store as onEachFeature so popups auto-bind on future addData() calls
  leafletLayer.options.onEachFeature = (feature: GeoJSON.Feature, layer: L.Layer) => {
    bindPopupToFeature(feature, layer, leafletLayer, layerName);
  };

  // Bind on current sublayers
  leafletLayer.eachLayer((sublayer) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feature = (sublayer as any).feature as GeoJSON.Feature | undefined;
    if (!feature) return;
    bindPopupToFeature(feature, sublayer, leafletLayer, layerName);
  });
}

// ---------------------------------------------------------------------------
// unbindPopups
// ---------------------------------------------------------------------------

export function unbindPopups(leafletLayer: L.GeoJSON): void {
  leafletLayer.eachLayer((sublayer) => {
    sublayer.off('click');
  });
}

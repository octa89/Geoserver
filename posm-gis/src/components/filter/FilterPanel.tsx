/**
 * FilterPanel — main filter UI component.
 *
 * Responsibilities:
 * - Layer selector dropdown (from store.layers)
 * - FilterForm for adding new filter conditions
 * - ActiveFiltersList showing current active filters as chips
 * - AND / OR toggle controlling how filters are combined
 * - On every filter change: builds CQL, re-fetches layer GeoJSON, and calls
 *   applyFilters from the useFilters hook to refresh the map layer.
 *
 * The component is intentionally a client component (uses React state and
 * Zustand subscriptions). No server components are needed here.
 */

import { useState, useCallback } from 'react';
import type { RefObject } from 'react';
import type L from 'leaflet';
import { useStore } from '../../store';
import type { FilterDef } from '../../types/layer';
import { FilterForm } from './FilterForm';
import { ActiveFiltersList } from './ActiveFiltersList';
import { useFilters } from '../../hooks/useFilters';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FilterPanelProps {
  mapRef: RefObject<L.Map | null>;
}

// ---------------------------------------------------------------------------
// FilterPanel
// ---------------------------------------------------------------------------

export function FilterPanel({ mapRef }: FilterPanelProps) {
  const layers = useStore((s) => s.layers);
  const layerOrder = useStore((s) => s.layerOrder);
  const setLayerFilters = useStore((s) => s.setLayerFilters);

  const { applyFilters } = useFilters(mapRef);

  // Local state: which layer is selected in the dropdown
  const [selectedLayer, setSelectedLayer] = useState<string>(() => {
    return layerOrder[0] ?? '';
  });

  // Derive current layer config
  const layerConfig = selectedLayer ? layers[selectedLayer] : null;
  const activeFilters: FilterDef[] = layerConfig?.activeFilters ?? [];
  const combineMode: 'AND' | 'OR' = layerConfig?.filterCombineMode ?? 'AND';

  // ---- Handlers ------------------------------------------------------------

  const handleLayerChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedLayer(e.target.value);
    },
    []
  );

  /**
   * Add a new filter, persist to store, then re-fetch the layer GeoJSON
   * with the updated CQL filter applied server-side.
   */
  const handleAddFilter = useCallback(
    async (filter: FilterDef) => {
      if (!selectedLayer) return;
      const next = [...activeFilters, filter];
      setLayerFilters(selectedLayer, next);
      // Let the store update settle before reading it in applyFilters
      await Promise.resolve();
      applyFilters(selectedLayer);
    },
    [selectedLayer, activeFilters, setLayerFilters, applyFilters]
  );

  /**
   * Remove a filter by index, persist, then re-fetch.
   */
  const handleRemoveFilter = useCallback(
    async (idx: number) => {
      if (!selectedLayer) return;
      const next = activeFilters.filter((_, i) => i !== idx);
      setLayerFilters(selectedLayer, next);
      await Promise.resolve();
      applyFilters(selectedLayer);
    },
    [selectedLayer, activeFilters, setLayerFilters, applyFilters]
  );

  /**
   * Toggle between AND / OR combine mode and re-fetch.
   */
  const handleToggleMode = useCallback(
    async () => {
      if (!selectedLayer) return;
      const nextMode = combineMode === 'AND' ? 'OR' : 'AND';
      setLayerFilters(selectedLayer, activeFilters, nextMode);
      await Promise.resolve();
      if (activeFilters.length > 1) {
        applyFilters(selectedLayer);
      }
    },
    [selectedLayer, combineMode, activeFilters, setLayerFilters, applyFilters]
  );

  /**
   * Clear all filters for the selected layer and reload without a CQL filter.
   */
  const handleClearAll = useCallback(
    async () => {
      if (!selectedLayer) return;
      setLayerFilters(selectedLayer, []);
      await Promise.resolve();
      applyFilters(selectedLayer);
    },
    [selectedLayer, setLayerFilters, applyFilters]
  );

  // ---- Render --------------------------------------------------------------

  const availableLayers = layerOrder.filter((name) => layers[name]);

  if (availableLayers.length === 0) {
    return (
      <div className="filter-panel">
        <p style={{ color: '#555', fontSize: 11 }}>No layers loaded.</p>
      </div>
    );
  }

  return (
    <div className="filter-panel">
      {/* Layer selector */}
      <div style={{ marginBottom: 8 }}>
        <select
          value={selectedLayer}
          onChange={handleLayerChange}
          style={{
            width: '100%',
            background: '#0f3460',
            border: '1px solid rgba(66,212,244,0.2)',
            color: '#e0e0e0',
            borderRadius: 4,
            padding: '5px 8px',
            fontSize: 12,
          }}
          aria-label="Select layer to filter"
        >
          {availableLayers.map((name) => (
            <option key={name} value={name}>
              {layers[name]?.label ?? name}
            </option>
          ))}
        </select>
      </div>

      {/* Filter form */}
      {layerConfig && (
        <FilterForm
          layerName={selectedLayer}
          fields={layerConfig.fields}
          onAdd={handleAddFilter}
        />
      )}

      {/* AND / OR toggle + clear all */}
      {activeFilters.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 6,
            marginTop: 6,
          }}
        >
          <span style={{ color: '#888', fontSize: 11 }}>Combine:</span>
          <button
            onClick={handleToggleMode}
            style={{
              background: combineMode === 'AND' ? 'rgba(66,212,244,0.15)' : '#2d2d44',
              border: `1px solid ${combineMode === 'AND' ? '#42d4f4' : '#444'}`,
              color: combineMode === 'AND' ? '#42d4f4' : '#bbb',
              borderRadius: 4,
              padding: '2px 10px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
            aria-pressed={combineMode === 'AND'}
          >
            AND
          </button>
          <button
            onClick={handleToggleMode}
            style={{
              background: combineMode === 'OR' ? 'rgba(66,212,244,0.15)' : '#2d2d44',
              border: `1px solid ${combineMode === 'OR' ? '#42d4f4' : '#444'}`,
              color: combineMode === 'OR' ? '#42d4f4' : '#bbb',
              borderRadius: 4,
              padding: '2px 10px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
            aria-pressed={combineMode === 'OR'}
          >
            OR
          </button>

          <button
            onClick={handleClearAll}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: '1px solid #e94560',
              color: '#e94560',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 10,
              cursor: 'pointer',
            }}
            title="Remove all filters for this layer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Active filters */}
      <ActiveFiltersList
        filters={activeFilters}
        onRemove={handleRemoveFilter}
        combineMode={combineMode}
      />
    </div>
  );
}

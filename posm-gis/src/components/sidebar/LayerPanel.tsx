import { useState, useMemo } from 'react';
import type { RefObject } from 'react';
import type L from 'leaflet';
import { useStore } from '../../store';
import { LayerItem } from './LayerItem';

interface LayerPanelProps {
  mapRef: RefObject<L.Map | null>;
}

/**
 * LayerPanel
 *
 * Renders the full list of discovered layers inside the sidebar.
 * Layers are shown in the order defined by `layerOrder` in the Zustand store.
 * A text search input at the top filters by layer label (case-insensitive).
 */
export function LayerPanel({ mapRef }: LayerPanelProps) {
  // Subscribe only to layerOrder (stable array). DO NOT subscribe to `layers`
  // — it changes on every store update and would cascade re-renders.
  const layerOrder = useStore((s) => s.layerOrder);

  const [search, setSearch] = useState('');

  // Filter layerOrder by the search term — read layers imperatively
  const filteredNames = useMemo(() => {
    const layers = useStore.getState().layers;
    const term = search.trim().toLowerCase();
    if (!term) return layerOrder;
    return layerOrder.filter((name) => {
      const label = layers[name]?.label ?? name;
      return label.toLowerCase().includes(term);
    });
  }, [search, layerOrder]);

  return (
    <div className="layer-panel">
      {/* Search input */}
      <div className="layer-panel-search">
        <input
          type="text"
          className="layer-search-input"
          placeholder="Search layers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filter layers by name"
        />
        {search && (
          <button
            className="layer-search-clear"
            onClick={() => setSearch('')}
            aria-label="Clear search"
          >
            x
          </button>
        )}
      </div>

      {/* Layer list */}
      <ul className="layer-list" role="list">
        {filteredNames.length === 0 ? (
          <li className="layer-list-empty">
            {layerOrder.length === 0
              ? 'No layers loaded.'
              : 'No layers match your search.'}
          </li>
        ) : (
          filteredNames.map((name) => (
            <li key={name} className="layer-list-item">
              <LayerItem name={name} mapRef={mapRef} />
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

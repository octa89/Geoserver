/**
 * SearchPanel — bottom-anchored, collapsible & resizable panel for searching
 * layer attribute tables.
 *
 * Performance notes:
 * - Does NOT subscribe to `useStore((s) => s.layers)` — that object changes
 *   on every store update (zoom, color, visibility) and would cause constant
 *   re-renders. Instead reads layers imperatively when needed.
 * - Skips search entirely when collapsed.
 * - Renders results in batches (50 at a time) with scroll-to-load-more.
 */

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type RefObject,
} from 'react';
import type L from 'leaflet';
import { useStore } from '../../store';
import {
  useAttributeSearch,
  type SearchResult,
} from '../../hooks/useAttributeSearch';
import { getAllLayerRefs } from '../../store/leafletRegistry';
import { recolorSymbology, resetSymbology, refreshClusterAfterSymbology } from '../../lib/symbology';
import { AdvancedSearchForm } from './AdvancedSearchForm';
import type { ConditionGroup } from './searchTypes';
import type { SavedSearch } from '../../types/session';
import './SearchPanel.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_HEIGHT = 52;
const DEFAULT_HEIGHT = 280;
const MAX_HEIGHT_RATIO = 0.75;
const VISIBLE_BATCH = 50;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SearchPanelProps {
  mapRef: RefObject<L.Map | null>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchPanel({ mapRef }: SearchPanelProps) {
  // ---- State ----------------------------------------------------------------
  const [collapsed, setCollapsed] = useState(true);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedLayer, setSelectedLayer] = useState<string>('__all__');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [visibleCount, setVisibleCount] = useState(VISIBLE_BATCH);

  // Advanced search state
  const [advancedMode, setAdvancedMode] = useState(false);
  const [isSavingSearch, setIsSavingSearch] = useState(false);
  const [searchName, setSearchName] = useState('');

  // filterMode and conditionGroups stored in Zustand for persistence to DynamoDB/share
  const filterMode = useStore((s) => s.searchFilterMode);
  const storeConditionGroups = useStore((s) => s.searchConditionGroups);
  const setFilterMode = useStore((s) => s.setSearchFilterMode);
  const setConditionGroupsStore = useStore((s) => s.setSearchConditionGroups);

  // Rebuild ConditionGroup[] with runtime IDs from store's SavedSearchGroup[]
  const conditionGroups: ConditionGroup[] = useMemo(() => {
    return storeConditionGroups.map((g) => ({
      layerName: g.layerName,
      combineMode: g.combineMode,
      conditions: g.conditions.map((c, i) => ({
        id: i + 1,
        field: c.field as string,
        operator: c.operator as ConditionGroup['conditions'][0]['operator'],
        value: c.value,
        ...(c.valueEnd ? { valueEnd: c.valueEnd } : {}),
        ...(c.layerName ? { layerName: c.layerName } : {}),
      })),
    }));
  }, [storeConditionGroups]);

  // Write ConditionGroup[] back to store (strips runtime IDs)
  const setConditionGroups = useCallback((groups: ConditionGroup[]) => {
    setConditionGroupsStore(groups.map((g) => ({
      layerName: g.layerName,
      combineMode: g.combineMode,
      conditions: g.conditions.map((c) => ({
        field: c.field,
        operator: c.operator,
        value: c.value,
        ...(c.valueEnd ? { valueEnd: c.valueEnd } : {}),
        ...(c.layerName ? { layerName: c.layerName } : {}),
      })),
    })));
  }, [setConditionGroupsStore]);

  // ---- Refs -----------------------------------------------------------------
  const panelRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const isDragging = useRef(false);
  const activeHighlightRef = useRef<{ cleanup: () => void } | null>(null);

  // ---- Store ---------------------------------------------------------------
  const layerOrder = useStore((s) => s.layerOrder);
  const savedSearches = useStore((s) => s.savedSearches);
  const addSavedSearch = useStore((s) => s.addSavedSearch);
  const removeSavedSearch = useStore((s) => s.removeSavedSearch);

  // ---- Hooks ----------------------------------------------------------------
  const { search, groupedSearch, countGroupedMatches, highlightFeature, zoomToFeature } =
    useAttributeSearch();

  // ---- Debounce search query ------------------------------------------------
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset visible count when query, layer, or conditions change
  useEffect(() => {
    setVisibleCount(VISIBLE_BATCH);
  }, [debouncedQuery, selectedLayer, conditionGroups]);

  // ---- Run search (independent of collapsed state) -------------------------
  const computedResults: SearchResult[] = useMemo(() => {
    const layerFilter =
      selectedLayer === '__all__' ? undefined : selectedLayer;

    if (advancedMode) {
      if (conditionGroups.length === 0) return [];
      return groupedSearch(conditionGroups);
    }

    // Basic mode
    if (!debouncedQuery.trim() || debouncedQuery.trim().length < 2) return [];
    return search(debouncedQuery, layerFilter);
  }, [
    advancedMode,
    conditionGroups,
    debouncedQuery,
    selectedLayer,
    search,
    groupedSearch,
  ]);

  // Cache latest non-empty results for filter persistence when collapsed
  const cachedResultsRef = useRef<SearchResult[]>([]);
  if (computedResults.length > 0) {
    cachedResultsRef.current = computedResults;
  }

  // Results shown in UI (only when expanded)
  const results = collapsed ? [] as SearchResult[] : computedResults;

  // Results used for filter effect (persists when collapsed)
  const filterResults = filterMode !== 'none'
    ? (computedResults.length > 0 ? computedResults : cachedResultsRef.current)
    : [];

  // ---- Apply hide/dim filter to map features --------------------------------

  // Type for Leaflet feature layers with optional style/opacity methods
  type FeatureLeafletLayer = L.Layer & {
    feature?: GeoJSON.Feature;
    setStyle?: (s: Record<string, unknown>) => void;
    setOpacity?: (o: number) => void;
    getElement?: () => HTMLElement | undefined;
  };

  const restoreAllFeatures = useCallback(() => {
    const layers = useStore.getState().layers;
    for (const [layerName, refs] of getAllLayerRefs()) {
      if (!refs?.leafletLayer) continue;
      // First restore visibility on all sub-layers
      refs.leafletLayer.eachLayer((featureLayer: L.Layer) => {
        const fl = featureLayer as FeatureLeafletLayer;
        if (fl.setOpacity) fl.setOpacity(1);
        const el = fl.getElement?.();
        if (el) el.style.display = '';
      });
      // Then re-apply symbology or base style to restore correct colors
      const config = layers[layerName];
      if (!config) continue;
      try {
        if (config.symbology) {
          recolorSymbology(refs.leafletLayer, refs.geojson, config.geomType, config.pointSymbol, config.symbology);
        } else {
          resetSymbology(refs.leafletLayer, config.geomType, config.color, config.pointSymbol, refs.geojson);
        }
        refreshClusterAfterSymbology(refs);
      } catch {
        // Fallback: just reset opacity
        refs.leafletLayer.eachLayer((featureLayer: L.Layer) => {
          const fl = featureLayer as FeatureLeafletLayer;
          if (fl.setStyle) fl.setStyle({ opacity: 1, fillOpacity: 0.6 });
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!advancedMode || filterMode === 'none' || filterResults.length === 0) {
      restoreAllFeatures();
      return;
    }

    // Build a set of matched feature indices per layer
    const matchesByLayer = new Map<string, Set<number>>();
    for (const r of filterResults) {
      let set = matchesByLayer.get(r.layerName);
      if (!set) {
        set = new Set();
        matchesByLayer.set(r.layerName, set);
      }
      set.add(r.featureIndex);
    }

    for (const [layerName, refs] of getAllLayerRefs()) {
      if (!refs?.leafletLayer) continue;
      const matchedIndices = matchesByLayer.get(layerName);

      // Build a map from GeoJSON feature reference → feature index
      const featureToIndex = new Map<GeoJSON.Feature, number>();
      refs.geojson.features.forEach((f, i) => {
        featureToIndex.set(f, i);
      });

      refs.leafletLayer.eachLayer((featureLayer: L.Layer) => {
        const fl = featureLayer as FeatureLeafletLayer;
        const feat = fl.feature;
        const idx = feat ? featureToIndex.get(feat) : undefined;
        const isMatch = idx !== undefined && matchedIndices?.has(idx);

        if (filterMode === 'hide') {
          if (isMatch) {
            if (fl.setStyle) fl.setStyle({ opacity: 1, fillOpacity: 0.6 });
            if (fl.setOpacity) fl.setOpacity(1);
            const el = fl.getElement?.();
            if (el) el.style.display = '';
          } else {
            if (fl.setStyle) fl.setStyle({ opacity: 0, fillOpacity: 0 });
            if (fl.setOpacity) fl.setOpacity(0);
            const el = fl.getElement?.();
            if (el) el.style.display = 'none';
          }
        } else if (filterMode === 'dim') {
          if (isMatch) {
            if (fl.setStyle) fl.setStyle({ opacity: 1, fillOpacity: 0.6 });
            if (fl.setOpacity) fl.setOpacity(1);
            const el = fl.getElement?.();
            if (el) el.style.display = '';
          } else {
            if (fl.setStyle) fl.setStyle({ opacity: 0.06, fillOpacity: 0.02 });
            if (fl.setOpacity) fl.setOpacity(0.06);
            const el = fl.getElement?.();
            if (el) el.style.display = '';
          }
        }
      });
    }

    return () => {
      restoreAllFeatures();
    };
  }, [advancedMode, filterMode, filterResults, restoreAllFeatures]);

  // Restore features only when advanced mode turns off (NOT on collapse)
  useEffect(() => {
    if (!advancedMode) {
      setFilterMode('none');
    }
  }, [advancedMode]);

  // ---- Collect field names for table header from layer config ---------------
  const allFields = useMemo(() => {
    if (results.length === 0) return [];

    const layers = useStore.getState().layers;

    if (selectedLayer !== '__all__') {
      const cfg = layers[selectedLayer];
      if (cfg) return cfg.fields;
    }

    const fieldSet = new Set<string>();
    const seenLayers = new Set<string>();
    for (const r of results) {
      if (seenLayers.has(r.layerName)) continue;
      seenLayers.add(r.layerName);
      const cfg = layers[r.layerName];
      if (cfg) {
        for (const f of cfg.fields) fieldSet.add(f);
      }
    }
    return Array.from(fieldSet);
  }, [results, selectedLayer]);

  // Per-layer true match counts (not capped by MAX_RESULTS)
  const layerCounts = useMemo(() => {
    if (results.length === 0) return [];
    const layers = useStore.getState().layers;

    // In advanced mode, compute true counts without the result-cap limits
    if (advancedMode && conditionGroups.length > 0) {
      const trueCounts = countGroupedMatches(conditionGroups);
      return Array.from(trueCounts.entries()).map(([name, filtered]) => ({
        name,
        label: layers[name]?.label ?? name,
        color: layers[name]?.color ?? '#888',
        filtered,
        total: layers[name]?.featureCount ?? 0,
      }));
    }

    // Basic search — use result array counts (already uncapped for basic)
    const countMap = new Map<string, number>();
    for (const r of results) {
      countMap.set(r.layerName, (countMap.get(r.layerName) || 0) + 1);
    }
    return Array.from(countMap.entries()).map(([name, filtered]) => ({
      name,
      label: layers[name]?.label ?? name,
      color: layers[name]?.color ?? '#888',
      filtered,
      total: layers[name]?.featureCount ?? 0,
    }));
  }, [results, advancedMode, conditionGroups, countGroupedMatches]);

  // Visible slice of results
  const visibleResults = useMemo(
    () => results.slice(0, visibleCount),
    [results, visibleCount]
  );

  // ---- Handlers -------------------------------------------------------------

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const handleResultClick = useCallback(
    (result: SearchResult) => {
      const map = mapRef.current;
      if (!map) return;

      if (activeHighlightRef.current) {
        activeHighlightRef.current.cleanup();
      }

      zoomToFeature(map, result);
      const hl = highlightFeature(map, result);
      activeHighlightRef.current = hl;
    },
    [mapRef, zoomToFeature, highlightFeature]
  );

  const handleResultsScroll = useCallback(() => {
    const el = resultsRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      setVisibleCount((prev) => Math.min(prev + VISIBLE_BATCH, results.length));
    }
  }, [results.length]);

  // ---- Drag-to-resize -------------------------------------------------------

  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      if (collapsed) return;
      e.preventDefault();
      isDragging.current = true;
      dragStartY.current = e.clientY;
      dragStartHeight.current = height;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [collapsed, height]
  );

  const handleDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartY.current - e.clientY;
      const maxH = window.innerHeight * MAX_HEIGHT_RATIO;
      const newHeight = Math.min(
        maxH,
        Math.max(120, dragStartHeight.current + delta)
      );
      setHeight(newHeight);
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    isDragging.current = false;
  }, []);

  // ---- Saved search handlers ------------------------------------------------

  let nextCondId = useRef(1000);

  const handleSaveSearch = useCallback(() => {
    const name = searchName.trim();
    if (!name || conditionGroups.length === 0) return;

    const saved: SavedSearch = {
      id: Date.now().toString(36),
      name,
      conditionGroups: conditionGroups.map((g) => ({
        layerName: g.layerName,
        combineMode: g.combineMode,
        conditions: g.conditions.map((c) => ({
          field: c.field,
          operator: c.operator,
          value: c.value,
          ...(c.valueEnd ? { valueEnd: c.valueEnd } : {}),
          ...(c.layerName ? { layerName: c.layerName } : {}),
        })),
      })),
    };
    addSavedSearch(saved);
    setIsSavingSearch(false);
    setSearchName('');
  }, [searchName, conditionGroups, addSavedSearch]);

  const handleLoadSearch = useCallback(
    (id: string) => {
      const found = savedSearches.find((s) => s.id === id);
      if (!found) return;
      // Rebuild conditionGroups with fresh runtime IDs
      const groups: ConditionGroup[] = found.conditionGroups.map((g) => ({
        layerName: g.layerName,
        combineMode: g.combineMode,
        conditions: g.conditions.map((c) => ({
          id: nextCondId.current++,
          field: c.field as string,
          operator: c.operator as ConditionGroup['conditions'][0]['operator'],
          value: c.value,
          ...(c.valueEnd ? { valueEnd: c.valueEnd } : {}),
          ...(c.layerName ? { layerName: c.layerName } : {}),
        })),
      }));
      setConditionGroups(groups);
    },
    [savedSearches, setConditionGroups]
  );

  const handleDeleteSearch = useCallback(
    (id: string) => {
      removeSavedSearch(id);
    },
    [removeSavedSearch]
  );

  const handleSaveSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSaveSearch();
      if (e.key === 'Escape') { setIsSavingSearch(false); setSearchName(''); }
    },
    [handleSaveSearch]
  );

  // ---- Compute layer options (reads layers imperatively) --------------------
  const layerOptions = useMemo(() => {
    const layers = useStore.getState().layers;
    return layerOrder
      .filter((name) => layers[name])
      .map((name) => ({
        value: name,
        label: layers[name].label,
      }));
  }, [layerOrder]);

  // ---- Derived state for empty/result messaging ----------------------------
  const hasBasicQuery = !advancedMode && debouncedQuery && debouncedQuery.trim().length >= 2;
  const hasAdvancedQuery = advancedMode && conditionGroups.some((g) => g.conditions.length > 0);
  const hasActiveQuery = hasBasicQuery || hasAdvancedQuery;

  // ---- Render ---------------------------------------------------------------

  const panelHeight = collapsed ? MIN_HEIGHT : height;
  const resultCount = results.length;
  const trueTotalCount = layerCounts.reduce((sum, lc) => sum + lc.filtered, 0);

  return (
    <div
      ref={panelRef}
      className={`search-panel ${collapsed ? 'search-panel--collapsed' : ''}`}
      style={{ height: panelHeight }}
    >
      {/* ---- Drag Handle ---- */}
      {!collapsed && (
        <div
          className="search-panel__drag-handle"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <div className="search-panel__drag-indicator" />
        </div>
      )}

      {/* ---- Header Bar ---- */}
      <div className="search-panel__header">
        <button
          className="search-panel__toggle-btn"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand search panel' : 'Collapse search panel'}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <span
            className="search-panel__chevron"
            style={{
              transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
            }}
          >
            &#9650;
          </span>
        </button>

        <span className="search-panel__title">
          {advancedMode && !collapsed ? 'Advanced Search' : 'Search Attributes'}
          {resultCount > 0 && (
            <span className="search-panel__badge">{resultCount}</span>
          )}
          {collapsed && filterMode !== 'none' && (
            <span className="search-panel__filter-indicator" title={`Filter: ${filterMode}`}>
              {filterMode === 'hide' ? '\u{1F441}' : '\u25D0'}
            </span>
          )}
        </span>

        {!collapsed && advancedMode ? (
          <span className="search-panel__all-layers-label">All Layers</span>
        ) : (
          <select
            className="search-panel__layer-select"
            value={selectedLayer}
            onChange={(e) => setSelectedLayer(e.target.value)}
            aria-label="Search in layer"
          >
            <option value="__all__">All Layers</option>
            {layerOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {/* Hide/Dim — in header when advanced + results (or filter active even when collapsed) */}
        {advancedMode && (filterMode !== 'none' || (!collapsed && computedResults.length > 0)) && (
          <div className="search-panel__filter-options">
            <label className="search-panel__filter-opt">
              <input
                type="checkbox"
                checked={filterMode === 'hide'}
                onChange={() =>
                  setFilterMode(filterMode === 'hide' ? 'none' : 'hide')
                }
              />
              <span>Hide</span>
            </label>
            <label className="search-panel__filter-opt">
              <input
                type="checkbox"
                checked={filterMode === 'dim'}
                onChange={() =>
                  setFilterMode(filterMode === 'dim' ? 'none' : 'dim')
                }
              />
              <span>Dim</span>
            </label>
          </div>
        )}

        {!collapsed && (
          <div className="search-panel__view-toggle">
            {/* Advanced toggle */}
            <button
              className={`search-panel__view-btn ${advancedMode ? 'active' : ''}`}
              onClick={() => setAdvancedMode((prev) => !prev)}
              title={advancedMode ? 'Basic search' : 'Advanced search'}
              aria-label={advancedMode ? 'Switch to basic search' : 'Switch to advanced search'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
              </svg>
            </button>

            <button
              className={`search-panel__view-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table view"
              aria-label="Table view"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="1" width="6" height="4" rx="0.5" />
                <rect x="9" y="1" width="6" height="4" rx="0.5" />
                <rect x="1" y="7" width="6" height="4" rx="0.5" />
                <rect x="9" y="7" width="6" height="4" rx="0.5" />
                <rect x="1" y="11" width="6" height="4" rx="0.5" />
                <rect x="9" y="11" width="6" height="4" rx="0.5" />
              </svg>
            </button>
            <button
              className={`search-panel__view-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="Card view"
              aria-label="Card view"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="1" width="14" height="4" rx="1" />
                <rect x="1" y="7" width="14" height="4" rx="1" />
                <rect x="1" y="11" width="14" height="4" rx="1" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ---- Advanced Mode: Two-column layout (sidebar + results) ---- */}
      {!collapsed && advancedMode && (
        <div className="search-panel__adv-layout">
          {/* Left: search form + chips + saved searches + layer counts */}
          <div className="search-panel__adv-sidebar">
            <AdvancedSearchForm
              layerOptions={layerOptions}
              conditionGroups={conditionGroups}
              onConditionGroupsChange={setConditionGroups}
            />
            {hasAdvancedQuery && (
              <div className="search-panel__layer-counts">
                {resultCount === 0 ? (
                  <span className="search-panel__result-count">No results</span>
                ) : (
                  <>
                    {layerCounts.map((lc) => (
                      <span key={lc.name} className="search-panel__layer-count">
                        <span
                          className="search-panel__layer-dot"
                          style={{ background: lc.color }}
                        />
                        <span className="search-panel__layer-count-label">{lc.label}</span>
                        <span className="search-panel__layer-count-nums">
                          {lc.filtered}/{lc.total}
                        </span>
                      </span>
                    ))}
                    <span className="search-panel__result-count">
                      {trueTotalCount} total
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Saved Searches */}
            <div className="search-panel__saved-searches">
              {savedSearches.length > 0 && (
                <select
                  className="search-panel__saved-select"
                  value=""
                  onChange={(e) => handleLoadSearch(e.target.value)}
                  aria-label="Load saved search"
                >
                  <option value="" disabled>Load search...</option>
                  {savedSearches.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
              {savedSearches.length > 0 && (
                <div className="search-panel__saved-list">
                  {savedSearches.map((s) => (
                    <span key={s.id} className="search-panel__saved-chip">
                      <span
                        className="search-panel__saved-chip-name"
                        onClick={() => handleLoadSearch(s.id)}
                        title={`Load "${s.name}"`}
                      >
                        {s.name}
                      </span>
                      <button
                        className="search-panel__saved-chip-x"
                        onClick={() => handleDeleteSearch(s.id)}
                        title={`Delete "${s.name}"`}
                        aria-label={`Delete search: ${s.name}`}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {conditionGroups.length > 0 && !isSavingSearch && (
                <button
                  className="search-panel__save-search-btn"
                  onClick={() => setIsSavingSearch(true)}
                  title="Save current search"
                >
                  Save Search
                </button>
              )}
              {isSavingSearch && (
                <div className="search-panel__save-search-input">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search name..."
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    onKeyDown={handleSaveSearchKeyDown}
                    maxLength={60}
                    className="search-panel__saved-name-input"
                  />
                  <button
                    className="search-panel__save-search-confirm"
                    onClick={handleSaveSearch}
                    disabled={!searchName.trim()}
                  >
                    Save
                  </button>
                  <button
                    className="search-panel__save-search-cancel"
                    onClick={() => { setIsSavingSearch(false); setSearchName(''); }}
                  >
                    &times;
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: results */}
          <div
            ref={resultsRef}
            className="search-panel__adv-results"
            onScroll={handleResultsScroll}
          >
            {hasAdvancedQuery && resultCount === 0 && (
              <div className="search-panel__empty">
                No features match the current conditions across all layers
              </div>
            )}

            {resultCount > 0 && viewMode === 'table' && (
              <div className="search-panel__table-wrap">
                <table className="search-panel__table">
                  <thead>
                    <tr>
                      <th className="search-panel__th search-panel__th--layer">
                        Layer
                      </th>
                      {allFields.map((field) => (
                        <th key={field} className="search-panel__th">
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleResults.map((r, idx) => (
                      <tr
                        key={`${r.layerName}-${r.featureIndex}-${idx}`}
                        className="search-panel__tr"
                        onClick={() => handleResultClick(r)}
                      >
                        <td className="search-panel__td search-panel__td--layer">
                          <span
                            className="search-panel__layer-dot"
                            style={{ background: r.layerColor }}
                          />
                          {r.layerLabel}
                        </td>
                        {allFields.map((field) => (
                          <td
                            key={field}
                            className={`search-panel__td ${
                              field === r.matchedField
                                ? 'search-panel__td--matched'
                                : ''
                            }`}
                          >
                            {r.properties[field] != null
                              ? String(r.properties[field])
                              : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {resultCount > 0 && viewMode === 'cards' && (
              <div className="search-panel__cards">
                {visibleResults.map((r, idx) => (
                  <div
                    key={`${r.layerName}-${r.featureIndex}-${idx}`}
                    className="search-panel__card"
                    onClick={() => handleResultClick(r)}
                  >
                    <div className="search-panel__card-header">
                      <span
                        className="search-panel__layer-dot"
                        style={{ background: r.layerColor }}
                      />
                      <span className="search-panel__card-layer">
                        {r.layerLabel}
                      </span>
                      <span className="search-panel__card-match">
                        {r.matchedField}: <strong>{r.matchedValue}</strong>
                      </span>
                    </div>
                    <div className="search-panel__card-body">
                      {Object.entries(r.properties)
                        .filter(
                          ([, v]) => v != null && String(v).trim() !== ''
                        )
                        .slice(0, 6)
                        .map(([key, val]) => (
                          <span key={key} className="search-panel__card-field">
                            <span className="search-panel__card-key">
                              {key}:
                            </span>{' '}
                            {String(val)}
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {visibleCount < resultCount && (
              <div
                className="search-panel__empty"
                style={{ cursor: 'pointer', color: '#42d4f4' }}
                onClick={() => setVisibleCount((prev) => Math.min(prev + VISIBLE_BATCH, results.length))}
              >
                Showing {visibleCount} of {resultCount} — tap to load more
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Basic Search Input (hidden in advanced mode) ---- */}
      {!collapsed && !advancedMode && (
        <div className="search-panel__search-bar">
          <div className="search-panel__input-wrap">
            <svg
              className="search-panel__search-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="search-panel__input"
              placeholder="Search attributes (min 2 chars)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                className="search-panel__clear-btn"
                onClick={() => {
                  setQuery('');
                  setDebouncedQuery('');
                }}
                aria-label="Clear search"
              >
                &times;
              </button>
            )}
          </div>
          {hasBasicQuery && (
            <span className="search-panel__result-count">
              {resultCount === 0
                ? 'No results'
                : resultCount >= 100
                  ? '100+ results'
                  : `${resultCount} result${resultCount !== 1 ? 's' : ''}`}
            </span>
          )}
        </div>
      )}

      {/* ---- Basic Mode Results Area ---- */}
      {!collapsed && !advancedMode && (
        <div
          ref={resultsRef}
          className="search-panel__results"
          onScroll={handleResultsScroll}
        >
          {hasActiveQuery && resultCount === 0 && (
            <div className="search-panel__empty">
              <>No features match "<strong>{debouncedQuery}</strong>"</>
              {selectedLayer !== '__all__' && (() => {
                const layers = useStore.getState().layers;
                return <> in {layers[selectedLayer]?.label ?? selectedLayer}</>;
              })()}
            </div>
          )}

          {resultCount > 0 && viewMode === 'table' && (
            <div className="search-panel__table-wrap">
              <table className="search-panel__table">
                <thead>
                  <tr>
                    <th className="search-panel__th search-panel__th--layer">
                      Layer
                    </th>
                    {allFields.map((field) => (
                      <th key={field} className="search-panel__th">
                        {field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleResults.map((r, idx) => (
                    <tr
                      key={`${r.layerName}-${r.featureIndex}-${idx}`}
                      className="search-panel__tr"
                      onClick={() => handleResultClick(r)}
                    >
                      <td className="search-panel__td search-panel__td--layer">
                        <span
                          className="search-panel__layer-dot"
                          style={{ background: r.layerColor }}
                        />
                        {r.layerLabel}
                      </td>
                      {allFields.map((field) => (
                        <td
                          key={field}
                          className={`search-panel__td ${
                            field === r.matchedField
                              ? 'search-panel__td--matched'
                              : ''
                          }`}
                        >
                          {r.properties[field] != null
                            ? String(r.properties[field])
                            : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {resultCount > 0 && viewMode === 'cards' && (
            <div className="search-panel__cards">
              {visibleResults.map((r, idx) => (
                <div
                  key={`${r.layerName}-${r.featureIndex}-${idx}`}
                  className="search-panel__card"
                  onClick={() => handleResultClick(r)}
                >
                  <div className="search-panel__card-header">
                    <span
                      className="search-panel__layer-dot"
                      style={{ background: r.layerColor }}
                    />
                    <span className="search-panel__card-layer">
                      {r.layerLabel}
                    </span>
                    <span className="search-panel__card-match">
                      {r.matchedField}: <strong>{r.matchedValue}</strong>
                    </span>
                  </div>
                  <div className="search-panel__card-body">
                    {Object.entries(r.properties)
                      .filter(
                        ([, v]) => v != null && String(v).trim() !== ''
                      )
                      .slice(0, 6)
                      .map(([key, val]) => (
                        <span key={key} className="search-panel__card-field">
                          <span className="search-panel__card-key">
                            {key}:
                          </span>{' '}
                          {String(val)}
                        </span>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {visibleCount < resultCount && (
            <div
              className="search-panel__empty"
              style={{ cursor: 'pointer', color: '#42d4f4' }}
              onClick={() => setVisibleCount((prev) => Math.min(prev + VISIBLE_BATCH, results.length))}
            >
              Showing {visibleCount} of {resultCount} — tap to load more
            </div>
          )}

          {!hasActiveQuery && !debouncedQuery && (
            <div className="search-panel__empty">
              Type to search across{' '}
              {selectedLayer === '__all__'
                ? 'all layer attributes'
                : (() => {
                    const layers = useStore.getState().layers;
                    return layers[selectedLayer]?.label ?? selectedLayer;
                  })()}
            </div>
          )}

          {debouncedQuery && debouncedQuery.trim().length < 2 && (
            <div className="search-panel__empty">
              Type at least 2 characters to search
            </div>
          )}
        </div>
      )}
    </div>
  );
}

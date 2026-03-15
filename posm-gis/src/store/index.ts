import { create } from 'zustand';
import type { LayerConfig, Bookmark } from '../types/layer';
import type { SymbologyConfig } from '../types/symbology';
import type { SavedSearch, SavedSearchGroup } from '../types/session';
import type { BasemapKey } from '../config/constants';

export interface POSMStore {
  // Map state
  center: [number, number];
  zoom: number;
  basemap: BasemapKey;

  // Layer state (serializable config only)
  layers: Record<string, LayerConfig>;
  layerOrder: string[];

  // UI state
  sidebarOpen: boolean;
  filterPanelOpen: boolean;
  activeSymbologyLayer: string | null;
  activeSymbologyMode: string | null;
  loading: boolean;
  loadingMessage: string;

  // Session
  currentWorkspace: string;
  workspaces: string[];
  bookmarks: Bookmark[];
  savedSearches: SavedSearch[];

  // Active search filter (persisted for share view)
  searchFilterMode: 'none' | 'hide' | 'dim';
  searchConditionGroups: SavedSearchGroup[];

  // Actions
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setBasemap: (basemap: BasemapKey) => void;
  setMapView: (center: [number, number], zoom: number) => void;
  setSidebarOpen: (open: boolean) => void;
  setFilterPanelOpen: (open: boolean) => void;
  setLoading: (loading: boolean, message?: string) => void;
  setWorkspaces: (workspaces: string[]) => void;
  setCurrentWorkspace: (ws: string) => void;

  // Layer actions
  setLayer: (name: string, config: LayerConfig) => void;
  removeLayer: (name: string) => void;
  setLayerVisibility: (name: string, visible: boolean) => void;
  setLayerColor: (name: string, color: string) => void;
  setLayerSymbology: (name: string, symbology: SymbologyConfig | null) => void;
  setLayerFilters: (name: string, filters: LayerConfig['activeFilters'], mode?: 'AND' | 'OR') => void;
  setLayerLabelField: (name: string, field: string | null) => void;
  setLayerClustered: (name: string, clustered: boolean) => void;
  setLayerArrows: (name: string, show: boolean) => void;
  setLayerFlowPulse: (name: string, show: boolean) => void;
  setLayerPopupConfig: (name: string, config: import('../types/layer').PopupConfig | null) => void;
  setLayerPointSymbol: (name: string, pointSymbol: string) => void;
  setLayerAgeConfig: (name: string, ageConfig: import('../types/layer').AgeConfig | null) => void;
  setLayerOpacity: (name: string, opacity: number) => void;
  setLayerFeatureCount: (name: string, count: number) => void;
  setLayerOrder: (order: string[]) => void;

  // Bookmarks
  addBookmark: (bookmark: Bookmark) => void;
  removeBookmark: (id: string) => void;
  setBookmarks: (bookmarks: Bookmark[]) => void;

  // Saved searches
  addSavedSearch: (search: SavedSearch) => void;
  removeSavedSearch: (id: string) => void;
  setSavedSearches: (searches: SavedSearch[]) => void;

  // Active search filter
  setSearchFilterMode: (mode: 'none' | 'hide' | 'dim') => void;
  setSearchConditionGroups: (groups: SavedSearchGroup[]) => void;

  // Bulk
  resetLayers: () => void;
}

export const useStore = create<POSMStore>((set) => ({
  // Defaults
  center: [41.897, -84.037],
  zoom: 14,
  basemap: 'street',
  layers: {},
  layerOrder: [],
  sidebarOpen: true,
  filterPanelOpen: false,
  activeSymbologyLayer: null,
  activeSymbologyMode: null,
  loading: false,
  loadingMessage: '',
  currentWorkspace: '',
  workspaces: [],
  bookmarks: [],
  savedSearches: [],
  searchFilterMode: 'none',
  searchConditionGroups: [],

  // Map actions
  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setBasemap: (basemap) => set({ basemap }),
  setMapView: (center, zoom) => set({ center, zoom }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setFilterPanelOpen: (filterPanelOpen) => set({ filterPanelOpen }),
  setLoading: (loading, message = '') => set({ loading, loadingMessage: message }),
  setWorkspaces: (workspaces) => set({ workspaces }),
  setCurrentWorkspace: (currentWorkspace) => set({ currentWorkspace }),

  // Layer actions
  setLayer: (name, config) => {
    console.log(`[STORE] setLayer("${name}") symbology=${config.symbology ? (config.symbology as { mode: string }).mode : 'NULL'}`);
    return set((state) => ({
      layers: { ...state.layers, [name]: config },
      layerOrder: state.layerOrder.includes(name) ? state.layerOrder : [...state.layerOrder, name],
    }));
  },
  removeLayer: (name) => set((state) => {
    const { [name]: _, ...rest } = state.layers;
    return { layers: rest, layerOrder: state.layerOrder.filter(n => n !== name) };
  }),
  setLayerVisibility: (name, visible) => set((state) => ({
    layers: { ...state.layers, [name]: { ...state.layers[name], visible } },
  })),
  setLayerColor: (name, color) => set((state) => ({
    layers: { ...state.layers, [name]: { ...state.layers[name], color } },
  })),
  setLayerSymbology: (name, symbology) => {
    console.log(`[STORE] setLayerSymbology("${name}") → ${symbology ? (symbology as { mode: string }).mode : 'NULL'}`);
    return set((state) => ({
      layers: { ...state.layers, [name]: { ...state.layers[name], symbology } },
    }));
  },
  setLayerFilters: (name, filters, mode) => set((state) => ({
    layers: {
      ...state.layers,
      [name]: {
        ...state.layers[name],
        activeFilters: filters,
        ...(mode ? { filterCombineMode: mode } : {}),
      },
    },
  })),
  setLayerLabelField: (name, field) => set((state) => ({
    layers: { ...state.layers, [name]: { ...state.layers[name], labelField: field } },
  })),
  setLayerClustered: (name, clustered) => set((state) => ({
    layers: { ...state.layers, [name]: { ...state.layers[name], clustered } },
  })),
  setLayerArrows: (name, show) => set((state) => ({
    layers: { ...state.layers, [name]: { ...state.layers[name], showArrows: show } },
  })),
  setLayerFlowPulse: (name, show) => set((state) => ({
    layers: { ...state.layers, [name]: { ...state.layers[name], showFlowPulse: show } },
  })),
  setLayerPopupConfig: (name, config) => set((state) => ({
    layers: { ...state.layers, [name]: { ...state.layers[name], popupConfig: config } },
  })),
  setLayerPointSymbol: (name, pointSymbol) => set((state) => ({
    layers: { ...state.layers, [name]: { ...state.layers[name], pointSymbol } },
  })),
  setLayerAgeConfig: (name, ageConfig) => set((state) => ({
    layers: { ...state.layers, [name]: { ...state.layers[name], ageConfig } },
  })),
  setLayerOpacity: (name, opacity) => set((state) => ({
    layers: { ...state.layers, [name]: { ...state.layers[name], opacity } },
  })),
  setLayerFeatureCount: (name, count) => set((state) => {
    const existing = state.layers[name];
    if (!existing) return {};
    return { layers: { ...state.layers, [name]: { ...existing, featureCount: count } } };
  }),
  setLayerOrder: (order) => set({ layerOrder: order }),

  // Bookmarks
  addBookmark: (bookmark) => set((state) => ({
    bookmarks: [...state.bookmarks, bookmark],
  })),
  removeBookmark: (id) => set((state) => ({
    bookmarks: state.bookmarks.filter(b => b.id !== id),
  })),
  setBookmarks: (bookmarks) => set({ bookmarks }),

  // Saved searches
  addSavedSearch: (search) => set((state) => ({
    savedSearches: [...state.savedSearches, search],
  })),
  removeSavedSearch: (id) => set((state) => ({
    savedSearches: state.savedSearches.filter((s) => s.id !== id),
  })),
  setSavedSearches: (savedSearches) => set({ savedSearches }),

  // Active search filter
  setSearchFilterMode: (searchFilterMode) => set({ searchFilterMode }),
  setSearchConditionGroups: (searchConditionGroups) => set({ searchConditionGroups }),

  // Reset
  resetLayers: () => set({ layers: {}, layerOrder: [] }),
}));

// Expose store for browser console debugging:
//   __POSM.layers()  → current layer configs (check symbology values)
//   __POSM.state()   → full store state
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__POSM = {
    state: () => useStore.getState(),
    layers: () => {
      const layers = useStore.getState().layers;
      const summary: Record<string, { symbology: string; filters: number; visible: boolean }> = {};
      for (const [name, cfg] of Object.entries(layers)) {
        summary[name] = {
          symbology: cfg.symbology ? (cfg.symbology as { mode: string }).mode : 'null',
          filters: cfg.activeFilters?.length ?? 0,
          visible: cfg.visible,
        };
      }
      console.table(summary);
      return layers;
    },
  };
}

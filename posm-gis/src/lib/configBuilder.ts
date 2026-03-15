import { useStore } from '../store';
import type { WorkspaceConfig, PerLayerConfig } from '../types/session';

/**
 * Build a serialisable session-config snapshot from the current Zustand store
 * state.  Can be called outside React components because it uses
 * `useStore.getState()` (the imperative Zustand API).
 *
 * Returns:
 *   wsName   - the currently selected workspace identifier
 *   wsConfig - a WorkspaceConfig that mirrors every layer's serialisable state
 */
export function buildConfigObject(): {
  wsName: string;
  wsConfig: WorkspaceConfig;
} {
  const state = useStore.getState();

  // Build a PerLayerConfig record for every layer in the store
  const layerEntries: Record<string, PerLayerConfig> = {};

  for (const [name, layer] of Object.entries(state.layers)) {
    const perLayer: PerLayerConfig = {
      visible: layer.visible,
      color: layer.color,
      symbology: layer.symbology,
      pointSymbol: layer.pointSymbol,
      showArrows: layer.showArrows,
      showFlowPulse: layer.showFlowPulse,
      clustered: layer.clustered,
      labelField: layer.labelField,
      activeFilters: layer.activeFilters,
      filterCombineMode: layer.filterCombineMode,
      popupConfig: layer.popupConfig,
      ageConfig: layer.ageConfig,
      opacity: layer.opacity,
    };
    layerEntries[name] = perLayer;
  }

  const wsConfig: WorkspaceConfig = {
    basemap: state.basemap,
    center: state.center,
    zoom: state.zoom,
    layers: layerEntries,
    layerOrder: state.layerOrder,
    bookmarks: state.bookmarks.map((b) => ({
      id: b.id,
      name: b.name,
      center: b.center,
      zoom: b.zoom,
    })),
    savedSearches: state.savedSearches,
    searchFilterMode: state.searchFilterMode !== 'none' ? state.searchFilterMode : undefined,
    searchConditionGroups: state.searchConditionGroups.length > 0 ? state.searchConditionGroups.map((g) => ({
      layerName: g.layerName,
      combineMode: g.combineMode,
      conditions: g.conditions.map((c) => ({
        field: c.field,
        operator: c.operator,
        value: c.value,
        ...(c.valueEnd ? { valueEnd: c.valueEnd } : {}),
        ...(c.layerName ? { layerName: c.layerName } : {}),
      })),
    })) : undefined,
  };

  return {
    wsName: state.currentWorkspace,
    wsConfig,
  };
}

import type { SymbologyConfig } from './symbology';
import type { FilterDef, PopupConfig, AgeConfig, Bookmark } from './layer';

export interface PerLayerConfig {
  visible: boolean;
  color: string;
  symbology: SymbologyConfig | null;
  pointSymbol: string;
  showArrows: boolean;
  showFlowPulse: boolean;
  clustered: boolean;
  labelField: string | null;
  activeFilters: FilterDef[];
  filterCombineMode: 'AND' | 'OR';
  popupConfig: PopupConfig | null;
  ageConfig: AgeConfig | null;
}

export interface SavedSearchCondition {
  field: string;
  operator: string;
  value: string;
  valueEnd?: string;
  layerName?: string;
}

export interface SavedSearchGroup {
  layerName: string;
  combineMode: 'AND' | 'OR';
  conditions: SavedSearchCondition[];
}

export interface SavedSearch {
  id: string;
  name: string;
  conditionGroups: SavedSearchGroup[];
}

export interface WorkspaceConfig {
  basemap: string;
  center: [number, number];
  zoom: number;
  layers: Record<string, PerLayerConfig>;
  layerOrder?: string[];
  bookmarks: Array<{ id: string; name: string; center: [number, number]; zoom: number }>;
  savedSearches?: SavedSearch[];
  /** Active advanced search filter mode applied to the map */
  searchFilterMode?: 'none' | 'hide' | 'dim';
  /** Active condition groups driving the search filter */
  searchConditionGroups?: SavedSearchGroup[];
}

export interface UserStoredConfig {
  workspaces: Record<string, WorkspaceConfig>;
  bookmarks: Bookmark[];
}

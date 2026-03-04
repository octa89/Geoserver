import type { SymbologyConfig } from './symbology';
import type { FilterDef, PopupConfig, AgeConfig, Bookmark } from './layer';

export interface PerLayerConfig {
  visible: boolean;
  color: string;
  symbology: SymbologyConfig | null;
  pointSymbol: string;
  showArrows: boolean;
  clustered: boolean;
  labelField: string | null;
  activeFilters: FilterDef[];
  filterCombineMode: 'AND' | 'OR';
  popupConfig: PopupConfig | null;
  ageConfig: AgeConfig | null;
}

export interface WorkspaceConfig {
  basemap: string;
  center: [number, number];
  zoom: number;
  layers: Record<string, PerLayerConfig>;
  layerOrder?: string[];
  bookmarks: Array<{ id: string; name: string; center: [number, number]; zoom: number }>;
}

export interface UserStoredConfig {
  workspaces: Record<string, WorkspaceConfig>;
  bookmarks: Bookmark[];
}

import type L from 'leaflet';

export interface GeoServerLayer {
  fullName: string;   // workspace:layerName
  shortName: string;  // layerName
  label: string;      // display label
}

export interface LayerConfig {
  fullName: string;
  label: string;
  visible: boolean;
  color: string;
  geomType: string;
  pointSymbol: string;
  clustered: boolean;
  showArrows: boolean;
  labelField: string | null;
  fields: string[];
  featureCount: number;
  totalFeatureCount: number;
  symbology: import('./symbology').SymbologyConfig | null;
  activeFilters: FilterDef[];
  filterCombineMode: 'AND' | 'OR';
  popupConfig: PopupConfig | null;
  ageConfig: AgeConfig | null;
}

export interface FilterDef {
  cql: string;
  label: string;
}

export interface PopupConfig {
  fieldOrder: string[];
  hiddenFields: Record<string, boolean>;
  titleText?: string;
  titleField?: string;
}

export interface AgeConfig {
  field: string;
  unit: 'years' | 'months';
  computedField?: string;
}

export interface LeafletRefs {
  leafletLayer: L.GeoJSON;
  clusterGroup: L.MarkerClusterGroup | null;
  geojson: GeoJSON.FeatureCollection;
  arrowDecorators: L.Layer[];
  labelManager: unknown;
}

export interface Bookmark {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
}

/**
 * Non-reactive registry for Leaflet layer instances.
 * These are imperative objects that should NOT live in Zustand
 * (they're not serializable and would cause unnecessary re-renders).
 */
import type L from 'leaflet';
import type { LabelManager } from '../lib/labels';

export interface LeafletLayerRefs {
  leafletLayer: L.GeoJSON;
  clusterGroup: L.MarkerClusterGroup | null;
  geojson: GeoJSON.FeatureCollection;
  arrowDecorators: L.Layer[];
  flowPulseCleanup: (() => void) | null;
  labelManager: LabelManager | null;
}

const registry = new Map<string, LeafletLayerRefs>();

export function getLayerRefs(name: string): LeafletLayerRefs | undefined {
  return registry.get(name);
}

export function setLayerRefs(name: string, refs: LeafletLayerRefs) {
  registry.set(name, refs);
}

export function removeLayerRefs(name: string) {
  registry.delete(name);
}

export function getAllLayerRefs(): Map<string, LeafletLayerRefs> {
  return registry;
}

export function clearRegistry() {
  registry.clear();
}

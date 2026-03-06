/**
 * useSession — save/load session state via the API abstraction layer.
 *
 * Dev mode (no VITE_DYNAMO_API_URL): localStorage.
 * Prod mode: DynamoDB via Lambda + API Gateway.
 *
 * Provides:
 *   saveSession()   — snapshot the Zustand store and persist it
 *   loadSession()   — restore a previously persisted session into the store
 *   autoSave        — call this once to enable debounced auto-save on store changes
 *   isSaving        — boolean flag while a save is in flight
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { useStore } from '../store';
import { buildConfigObject } from '../lib/configBuilder';
import { getCurrentUser } from '../config/auth';
import { saveConfig, loadConfig } from '../lib/api';
import type { PerLayerConfig } from '../types/session';
import type { BasemapKey } from '../config/constants';

const AUTO_SAVE_DELAY_MS = 2000;

// Global flag: when true, auto-save is suppressed (prevents saving stale state
// during the async load → restore sequence, especially under React StrictMode
// which double-invokes effects).
let _saveSuppressed = false;
export const suppressAutoSave = () => { _saveSuppressed = true; };
export const unsuppressAutoSave = () => { _saveSuppressed = false; };

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSession() {
  const [isSaving, setIsSaving] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Store setters needed for loadSession
  const setBasemap = useStore((s) => s.setBasemap);
  const setMapView = useStore((s) => s.setMapView);
  const setBookmarks = useStore((s) => s.setBookmarks);
  const setLayerSymbology = useStore((s) => s.setLayerSymbology);
  const setLayerFilters = useStore((s) => s.setLayerFilters);
  const setLayerLabelField = useStore((s) => s.setLayerLabelField);
  const setLayerVisibility = useStore((s) => s.setLayerVisibility);
  const setLayerColor = useStore((s) => s.setLayerColor);
  const setLayerClustered = useStore((s) => s.setLayerClustered);
  const setLayerArrows = useStore((s) => s.setLayerArrows);
  const setLayerPopupConfig = useStore((s) => s.setLayerPopupConfig);
  const setLayerPointSymbol = useStore((s) => s.setLayerPointSymbol);
  const setLayerAgeConfig = useStore((s) => s.setLayerAgeConfig);
  const setLayerOrder = useStore((s) => s.setLayerOrder);

  // ---- saveSession ----------------------------------------------------------

  const saveSession = useCallback(async () => {
    const user = getCurrentUser();
    if (!user) return;

    const { wsName, wsConfig } = buildConfigObject();
    if (!wsName) return;

    // Log what we're about to save so we can trace symbology issues
    for (const [name, cfg] of Object.entries(wsConfig.layers)) {
      const sym = cfg.symbology;
      console.log(`[SAVE] ${name}: symbology=${sym ? (sym as { mode: string }).mode : 'NULL'}, filters=${cfg.activeFilters?.length ?? 0}`);
    }

    setIsSaving(true);
    try {
      await saveConfig(user.username, wsName, wsConfig);
      console.log('[SAVE] ✓ saved to DynamoDB for workspace:', wsName);
    } catch (err) {
      console.warn('[SAVE] ✗ saveSession failed:', err);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // ---- loadSession ----------------------------------------------------------

  const loadSession = useCallback(async (workspace: string): Promise<import('../types/session').WorkspaceConfig | null> => {
    const user = getCurrentUser();
    if (!user) return null;

    const config = await loadConfig(user.username, workspace);
    if (!config) return null;

    // Apply map-level state
    if (config.basemap) {
      setBasemap(config.basemap as BasemapKey);
    }
    if (config.center && config.zoom != null) {
      setMapView(config.center, config.zoom);
    }

    // Apply bookmarks
    if (Array.isArray(config.bookmarks)) {
      setBookmarks(config.bookmarks);
    }

    // Apply per-layer state for every layer that already exists in the store
    if (config.layers) {
      const currentLayers = useStore.getState().layers;
      for (const [layerName, saved] of Object.entries(config.layers) as [string, PerLayerConfig][]) {
        if (!currentLayers[layerName]) continue; // layer not loaded yet — skip

        if (saved.visible !== undefined) setLayerVisibility(layerName, saved.visible);
        if (saved.color) setLayerColor(layerName, saved.color);
        if (saved.symbology !== undefined) setLayerSymbology(layerName, saved.symbology);
        if (saved.activeFilters) {
          setLayerFilters(layerName, saved.activeFilters, saved.filterCombineMode ?? 'AND');
        }
        if (saved.labelField !== undefined) setLayerLabelField(layerName, saved.labelField);
        if (saved.clustered !== undefined) setLayerClustered(layerName, saved.clustered);
        if (saved.showArrows !== undefined) setLayerArrows(layerName, saved.showArrows);
        if (saved.popupConfig !== undefined) setLayerPopupConfig(layerName, saved.popupConfig);
        if (saved.pointSymbol) setLayerPointSymbol(layerName, saved.pointSymbol);
        if (saved.ageConfig !== undefined) setLayerAgeConfig(layerName, saved.ageConfig);
      }
    }

    // Restore layer order — merge saved order with any newly discovered layers
    if (Array.isArray(config.layerOrder) && config.layerOrder.length > 0) {
      const currentLayers = useStore.getState().layers;
      const savedSet = new Set(config.layerOrder);
      // Start with saved order (only layers that still exist), then append new layers
      const merged = config.layerOrder.filter((n) => currentLayers[n]);
      for (const name of Object.keys(currentLayers)) {
        if (!savedSet.has(name)) {
          merged.push(name);
        }
      }
      setLayerOrder(merged);
    }

    return config;
  }, [
    setBasemap,
    setMapView,
    setBookmarks,
    setLayerSymbology,
    setLayerFilters,
    setLayerLabelField,
    setLayerVisibility,
    setLayerColor,
    setLayerClustered,
    setLayerArrows,
    setLayerPopupConfig,
    setLayerPointSymbol,
    setLayerAgeConfig,
    setLayerOrder,
  ]);

  // ---- autoSave setup -------------------------------------------------------
  // Subscribes to any Zustand store change and debounces a save call.
  // Call this effect once from MapPage after layers have loaded.

  const autoSave = useCallback((): (() => void) => {
    // Unsubscribe from any previous subscription before creating a new one
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    const unsub = useStore.subscribe(() => {
      if (_saveSuppressed) return; // skip during load sequence
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
      autoSaveTimer.current = setTimeout(() => {
        if (_saveSuppressed) return; // re-check at fire time
        saveSession();
      }, AUTO_SAVE_DELAY_MS);
    });

    unsubscribeRef.current = unsub;

    // Return cleanup function for callers that need to stop auto-save
    return () => {
      unsub();
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = null;
      }
      unsubscribeRef.current = null;
    };
  }, [saveSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  return { saveSession, loadSession, autoSave, isSaving };
}

import { useState, useCallback } from 'react';
import type { RefObject } from 'react';
import type L from 'leaflet';
import { useStore } from '../../store';
import { resetSymbology, refreshClusterAfterSymbology, applySymbologyOpacity, hasNonTrivialOpacity } from '../../lib/symbology';
import { getLayerRefs, setLayerRefs } from '../../store/leafletRegistry';
import { toggleArrows } from '../../lib/arrows';
import { toggleFlowPulse } from '../../lib/sewerFlow';
import { darkenColor } from '../../lib/colorUtils';
import { UniqueValuesPanel } from './UniqueValuesPanel';
import { GraduatedPanel } from './GraduatedPanel';
import { ProportionalPanel } from './ProportionalPanel';
import { RulesPanel } from './RulesPanel';

type SymbologyMode = 'single' | 'unique' | 'graduated' | 'proportional' | 'rules' | null;

interface ModeButton {
  key: SymbologyMode;
  label: string;
}

const MODE_BUTTONS: ModeButton[] = [
  { key: 'single', label: 'Single Symbol' },
  { key: 'unique', label: 'Unique Values' },
  { key: 'graduated', label: 'Graduated' },
  { key: 'proportional', label: 'Proportional' },
  { key: 'rules', label: 'Rules' },
];

interface SymbologyPanelProps {
  mapRef: RefObject<L.Map | null>;
}

/**
 * Main Symbology panel.
 *
 * - Layer selector dropdown (ordered by store.layerOrder)
 * - Flow direction arrows toggle (line layers, always visible)
 * - Mode grid: Single Symbol / Unique Values / Graduated / Proportional / Rules / Reset
 * - Sub-panel for the active mode (stays open, no toggle-off)
 */
export function SymbologyPanel({ mapRef }: SymbologyPanelProps) {
  // Subscribe only to layerOrder (stable). Read layers imperatively.
  const layerOrder = useStore((s) => s.layerOrder);
  const setLayerSymbology = useStore((s) => s.setLayerSymbology);
  const setLayerColor = useStore((s) => s.setLayerColor);
  const setLayerArrows = useStore((s) => s.setLayerArrows);
  const setLayerFlowPulse = useStore((s) => s.setLayerFlowPulse);
  const setLayerOpacity = useStore((s) => s.setLayerOpacity);

  const [selectedLayer, setSelectedLayer] = useState<string>(() => layerOrder[0] ?? '');
  const [mode, setMode] = useState<SymbologyMode>(null);
  // Force re-render counter — bumped after actions that change the selected layer's config
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  const layers = useStore.getState().layers;
  const orderedLayers = layerOrder.filter((n) => Boolean(layers[n]));
  const layerConfig = selectedLayer ? layers[selectedLayer] : null;

  const isLine = layerConfig
    ? layerConfig.geomType === 'LineString' || layerConfig.geomType === 'MultiLineString'
    : false;

  // ---- Single Symbol: change base color ------------------------------------

  const handleSingleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!selectedLayer || !layerConfig) return;
      const newColor = e.target.value;

      setLayerColor(selectedLayer, newColor);

      // Clear any advanced symbology and apply solid color
      if (layerConfig.symbology) {
        setLayerSymbology(selectedLayer, null);
      }
      bump();

      const refs = getLayerRefs(selectedLayer);
      if (refs) {
        resetSymbology(
          refs.leafletLayer,
          layerConfig.geomType,
          newColor,
          layerConfig.pointSymbol,
          refs.geojson
        );
        refreshClusterAfterSymbology(refs);

        // Re-apply opacity after style rebuild
        if (hasNonTrivialOpacity(null, layerConfig.opacity)) {
          applySymbologyOpacity(refs.leafletLayer, layerConfig.geomType, null, layerConfig.opacity);
        }

        // Refresh arrow decorators if active
        if (layerConfig.showArrows) {
          const map = mapRef.current;
          if (map) {
            const newDecorators = toggleArrows(
              map, selectedLayer, refs.leafletLayer,
              newColor, true, refs.arrowDecorators
            );
            setLayerRefs(selectedLayer, { ...refs, arrowDecorators: newDecorators });
          }
        }

        // Refresh flow pulse if active
        if (layerConfig.showFlowPulse) {
          const map = mapRef.current;
          if (map) {
            const updatedRefs = getLayerRefs(selectedLayer);
            if (updatedRefs) {
              const newCleanup = toggleFlowPulse(
                map, selectedLayer, updatedRefs.leafletLayer,
                newColor, true, updatedRefs.flowPulseCleanup
              );
              setLayerRefs(selectedLayer, { ...updatedRefs, flowPulseCleanup: newCleanup });
            }
          }
        }
      }
    },
    [selectedLayer, layerConfig, setLayerColor, setLayerSymbology, mapRef, bump]
  );

  // ---- Flow direction arrows toggle ----------------------------------------

  const handleArrowToggle = useCallback(() => {
    if (!selectedLayer || !layerConfig) return;
    const map = mapRef.current;
    if (!map) return;

    const refs = getLayerRefs(selectedLayer);
    if (!refs) return;

    const willShow = !layerConfig.showArrows;
    const newDecorators = toggleArrows(
      map, selectedLayer, refs.leafletLayer,
      layerConfig.color, willShow, refs.arrowDecorators
    );

    setLayerRefs(selectedLayer, { ...refs, arrowDecorators: newDecorators });
    setLayerArrows(selectedLayer, willShow);
    bump();
  }, [selectedLayer, layerConfig, setLayerArrows, mapRef, bump]);

  // ---- Flow pulse toggle ----------------------------------------------------

  const handleFlowPulseToggle = useCallback(() => {
    if (!selectedLayer || !layerConfig) return;
    const map = mapRef.current;
    if (!map) return;

    const refs = getLayerRefs(selectedLayer);
    if (!refs) return;

    const willShow = !layerConfig.showFlowPulse;
    const newCleanup = toggleFlowPulse(
      map, selectedLayer, refs.leafletLayer,
      layerConfig.color, willShow, refs.flowPulseCleanup
    );

    setLayerRefs(selectedLayer, { ...refs, flowPulseCleanup: newCleanup });
    setLayerFlowPulse(selectedLayer, willShow);
    bump();
  }, [selectedLayer, layerConfig, setLayerFlowPulse, mapRef, bump]);

  // ---- Reset ---------------------------------------------------------------

  const handleReset = () => {
    if (!selectedLayer) return;
    const layer = useStore.getState().layers[selectedLayer];
    if (!layer) return;

    const refs = getLayerRefs(selectedLayer);
    if (refs) {
      resetSymbology(
        refs.leafletLayer,
        layer.geomType,
        layer.color,
        layer.pointSymbol,
        refs.geojson
      );
      refreshClusterAfterSymbology(refs);

      // Re-apply opacity after style rebuild
      if (hasNonTrivialOpacity(null, layer.opacity)) {
        applySymbologyOpacity(refs.leafletLayer, layer.geomType, null, layer.opacity);
      }
    }

    setLayerSymbology(selectedLayer, null);
    setMode(null);
    bump();
  };

  // Clicking a mode always opens it (no toggle-off); clicking another switches
  const handleModeSelect = (m: SymbologyMode) => {
    setMode(m);
  };

  return (
    <div className="symbology-panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Layer selector */}
      <label style={{ fontSize: 11, color: '#aaa' }}>
        Layer
        <select
          className="symbology-layer-select"
          value={selectedLayer}
          onChange={(e) => {
            setSelectedLayer(e.target.value);
            setMode(null);
          }}
          style={{ display: 'block', width: '100%', marginTop: 2 }}
        >
          {orderedLayers.length === 0 && (
            <option value="">No layers loaded</option>
          )}
          {orderedLayers.map((name) => (
            <option key={name} value={name}>
              {layers[name]?.label ?? name}
            </option>
          ))}
        </select>
      </label>

      {/* Flow direction arrows — line layers only (always visible) */}
      {selectedLayer && layerConfig && isLine && (
        <button
          onClick={handleArrowToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '5px 8px',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 3,
            border: `1px solid ${layerConfig.showArrows ? '#42d4f4' : '#3a3a5a'}`,
            background: layerConfig.showArrows ? '#1e3a4a' : '#2d2d44',
            color: layerConfig.showArrows ? '#42d4f4' : '#bbb',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <span style={{ fontSize: 14 }}>{layerConfig.showArrows ? '\u27A4' : '\u2192'}</span>
          {layerConfig.showArrows ? 'Flow Arrows ON' : 'Show Flow Direction'}
        </button>
      )}

      {/* Flow pulse — line layers only */}
      {selectedLayer && layerConfig && isLine && (
        <button
          onClick={handleFlowPulseToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '5px 8px',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 3,
            border: `1px solid ${layerConfig.showFlowPulse ? '#42d4f4' : '#3a3a5a'}`,
            background: layerConfig.showFlowPulse ? '#1e3a4a' : '#2d2d44',
            color: layerConfig.showFlowPulse ? '#42d4f4' : '#bbb',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <span style={{ fontSize: 14 }}>{layerConfig.showFlowPulse ? '\u2248' : '\u223C'}</span>
          {layerConfig.showFlowPulse ? 'Flow Pulse ON' : 'Show Flow Pulse'}
        </button>
      )}

      {/* Mode grid */}
      {selectedLayer && (
        <div className="symbology-mode-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {MODE_BUTTONS.map(({ key, label }) => (
            <button
              key={key}
              className={`symbology-mode-btn${mode === key ? ' symbology-mode-btn--active' : ''}`}
              onClick={() => handleModeSelect(key)}
              style={{
                padding: '5px 6px',
                fontSize: 11,
                borderRadius: 3,
                border: '1px solid',
                borderColor: mode === key ? '#42d4f4' : '#3a3a5a',
                background: mode === key ? '#1e3a4a' : '#2d2d44',
                color: mode === key ? '#42d4f4' : '#bbb',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              {label}
            </button>
          ))}

          <button
            className="symbology-reset-btn"
            onClick={handleReset}
            style={{
              gridColumn: '1 / -1',
              padding: '5px 6px',
              fontSize: 11,
              borderRadius: 3,
              border: '1px solid #5a3a3a',
              background: '#3a1a1a',
              color: '#e94560',
              cursor: 'pointer',
            }}
          >
            Reset to Default
          </button>
        </div>
      )}

      {/* Sub-panels */}
      {selectedLayer && mode === 'single' && layerConfig && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '8px 10px',
          background: '#2d2d44',
          borderRadius: 4,
          border: '1px solid #3a3a5a',
        }}>
          <div style={{ fontSize: 11, color: '#aaa', fontWeight: 600 }}>
            Pick a color for all features
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="color"
              value={layerConfig.color}
              onChange={handleSingleColorChange}
              title="Layer color"
              style={{
                width: 40,
                height: 30,
                padding: 0,
                border: `2px solid ${darkenColor(layerConfig.color)}`,
                borderRadius: 4,
                cursor: 'pointer',
                background: 'none',
              }}
            />
            <span style={{ fontSize: 13, color: '#ccc', fontFamily: 'monospace' }}>
              {layerConfig.color.toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>Opacity</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round((layerConfig.opacity ?? 1) * 100)}
              onChange={(e) => {
                if (!selectedLayer) return;
                const opacity = Number(e.target.value) / 100;
                setLayerOpacity(selectedLayer, opacity);
                bump();
                const refs = getLayerRefs(selectedLayer);
                if (refs) {
                  applySymbologyOpacity(refs.leafletLayer, layerConfig.geomType, null, opacity);
                }
              }}
              style={{ flex: 1, height: 4, accentColor: '#42d4f4', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 11, color: '#ccc', minWidth: 30, textAlign: 'right' }}>
              {Math.round((layerConfig.opacity ?? 1) * 100)}%
            </span>
          </div>
        </div>
      )}
      {selectedLayer && mode === 'unique' && (
        <UniqueValuesPanel layerName={selectedLayer} />
      )}
      {selectedLayer && mode === 'graduated' && (
        <GraduatedPanel layerName={selectedLayer} />
      )}
      {selectedLayer && mode === 'proportional' && (
        <ProportionalPanel layerName={selectedLayer} />
      )}
      {selectedLayer && mode === 'rules' && (
        <RulesPanel layerName={selectedLayer} />
      )}

      {/* Hint when no layer loaded */}
      {orderedLayers.length === 0 && (
        <p style={{ fontSize: 11, color: '#555', margin: 0 }}>
          Load a layer first to apply symbology.
        </p>
      )}
    </div>
  );
}

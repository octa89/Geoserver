import { useState } from 'react';
import { useStore } from '../../store';
import { resetSymbology, refreshClusterAfterSymbology } from '../../lib/symbology';
import { getLayerRefs } from '../../store/leafletRegistry';
import { UniqueValuesPanel } from './UniqueValuesPanel';
import { GraduatedPanel } from './GraduatedPanel';
import { ProportionalPanel } from './ProportionalPanel';
import { RulesPanel } from './RulesPanel';

type SymbologyMode = 'unique' | 'graduated' | 'proportional' | 'rules' | null;

interface ModeButton {
  key: SymbologyMode;
  label: string;
}

const MODE_BUTTONS: ModeButton[] = [
  { key: 'unique', label: 'Unique Values' },
  { key: 'graduated', label: 'Graduated' },
  { key: 'proportional', label: 'Proportional' },
  { key: 'rules', label: 'Rules' },
];

/**
 * Main Symbology panel.
 *
 * - Layer selector dropdown (ordered by store.layerOrder)
 * - Mode grid: Unique Values / Graduated / Proportional / Rules / Reset
 * - Sub-panel for the active mode
 */
export function SymbologyPanel() {
  const layers = useStore((s) => s.layers);
  const layerOrder = useStore((s) => s.layerOrder);
  const setLayerSymbology = useStore((s) => s.setLayerSymbology);

  // Default to the first loaded layer
  const [selectedLayer, setSelectedLayer] = useState<string>(() => layerOrder[0] ?? '');
  const [mode, setMode] = useState<SymbologyMode>(null);

  const orderedLayers = layerOrder.filter((n) => Boolean(layers[n]));

  const handleReset = () => {
    if (!selectedLayer) return;
    const layer = layers[selectedLayer];
    if (!layer) return;

    const refs = getLayerRefs(selectedLayer);
    if (refs) {
      resetSymbology(
        refs.leafletLayer,
        layer.geomType,
        layer.color,
        layer.pointSymbol
      );
      refreshClusterAfterSymbology(refs);
    }

    setLayerSymbology(selectedLayer, null);
    setMode(null);
  };

  const handleModeSelect = (m: SymbologyMode) => {
    setMode((prev) => (prev === m ? null : m));
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

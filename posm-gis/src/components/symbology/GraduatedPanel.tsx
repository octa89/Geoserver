import { useState, useMemo } from 'react';
import { useStore } from '../../store';
import { applyGraduated, refreshClusterAfterSymbology, applySymbologyOpacity, hasNonTrivialOpacity } from '../../lib/symbology';
import { getLayerRefs } from '../../store/leafletRegistry';
import { RampPicker } from './RampPicker';

interface GraduatedPanelProps {
  layerName: string;
}

type ClassifyMethod = 'equalInterval' | 'quantile' | 'jenks';

/**
 * Panel for Graduated symbology mode.
 * Only shows numeric fields. Allows method, class count, and color ramp selection.
 */
export function GraduatedPanel({ layerName }: GraduatedPanelProps) {
  const layer = useStore((s) => s.layers[layerName]);
  const setLayerSymbology = useStore((s) => s.setLayerSymbology);

  const refs = getLayerRefs(layerName);

  // Filter to only numeric fields using live geojson data when available
  const numericFields = useMemo<string[]>(() => {
    const fields = layer?.fields ?? [];
    if (!refs?.geojson?.features?.length) return fields;
    return fields.filter((f) => {
      // Check if any of the first 10 features have a numeric value for this field
      const sample = refs.geojson.features.slice(0, 10);
      return sample.some((feat) => {
        const val = feat.properties?.[f];
        return val !== null && val !== undefined && isFinite(Number(val));
      });
    });
  }, [layer?.fields, refs]);

  const [field, setField] = useState<string>(numericFields[0] ?? '');
  const [method, setMethod] = useState<ClassifyMethod>('equalInterval');
  const [nClasses, setNClasses] = useState(5);
  const [ramp, setRamp] = useState('YlOrRd');
  const [error, setError] = useState<string | null>(null);

  const handleApply = () => {
    setError(null);
    if (!field) {
      setError('Please select a numeric field.');
      return;
    }
    if (!refs) {
      setError('Layer not loaded yet. Toggle visibility to load it.');
      return;
    }

    const result = applyGraduated(
      refs.leafletLayer,
      refs.geojson,
      layer.geomType,
      layer.pointSymbol,
      { field, method, nClasses, ramp }
    );

    refreshClusterAfterSymbology(refs);
    if (hasNonTrivialOpacity(result, layer.opacity)) {
      applySymbologyOpacity(refs.leafletLayer, layer.geomType, result, layer.opacity);
    }
    setLayerSymbology(layerName, result);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 11, color: '#aaa' }}>
        Numeric Field
        <select
          className="symbology-field-select"
          value={field}
          onChange={(e) => setField(e.target.value)}
          style={{ display: 'block', width: '100%', marginTop: 2 }}
        >
          {numericFields.length === 0 && (
            <option value="">No numeric fields detected</option>
          )}
          {numericFields.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </label>

      <label style={{ fontSize: 11, color: '#aaa' }}>
        Classification Method
        <select
          className="symbology-field-select"
          value={method}
          onChange={(e) => setMethod(e.target.value as ClassifyMethod)}
          style={{ display: 'block', width: '100%', marginTop: 2 }}
        >
          <option value="equalInterval">Equal Interval</option>
          <option value="quantile">Quantile</option>
          <option value="jenks">Jenks Natural Breaks</option>
        </select>
      </label>

      <label style={{ fontSize: 11, color: '#aaa' }}>
        Classes: {nClasses}
        <input
          type="range"
          min={3}
          max={9}
          step={1}
          value={nClasses}
          onChange={(e) => setNClasses(Number(e.target.value))}
          style={{ display: 'block', width: '100%', marginTop: 2, accentColor: '#42d4f4' }}
        />
      </label>

      <div style={{ fontSize: 11, color: '#aaa' }}>
        Color Ramp
        <div style={{ marginTop: 4 }}>
          <RampPicker value={ramp} onChange={setRamp} />
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 11, color: '#e94560', margin: 0 }}>{error}</p>
      )}

      <button className="symbology-apply-btn" onClick={handleApply}>
        Apply
      </button>
    </div>
  );
}

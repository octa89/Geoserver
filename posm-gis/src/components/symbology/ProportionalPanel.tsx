import { useState, useMemo } from 'react';
import { useStore } from '../../store';
import { applyProportional, refreshClusterAfterSymbology } from '../../lib/symbology';
import { getLayerRefs } from '../../store/leafletRegistry';

interface ProportionalPanelProps {
  layerName: string;
}

/**
 * Panel for Proportional symbology mode.
 * Scales marker radius (or line weight) by a numeric field value.
 */
export function ProportionalPanel({ layerName }: ProportionalPanelProps) {
  const layer = useStore((s) => s.layers[layerName]);
  const setLayerSymbology = useStore((s) => s.setLayerSymbology);

  const refs = getLayerRefs(layerName);

  const numericFields = useMemo<string[]>(() => {
    const fields = layer?.fields ?? [];
    if (!refs?.geojson?.features?.length) return fields;
    return fields.filter((f) => {
      const sample = refs.geojson.features.slice(0, 10);
      return sample.some((feat) => {
        const val = feat.properties?.[f];
        return val !== null && val !== undefined && isFinite(Number(val));
      });
    });
  }, [layer?.fields, refs]);

  const [field, setField] = useState<string>(numericFields[0] ?? '');
  const [minSize, setMinSize] = useState(4);
  const [maxSize, setMaxSize] = useState(30);
  const [color, setColor] = useState(layer?.color ?? '#3388ff');
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
    if (minSize >= maxSize) {
      setError('Min size must be less than max size.');
      return;
    }

    const result = applyProportional(
      refs.leafletLayer,
      refs.geojson,
      layer.geomType,
      layer.pointSymbol,
      { field, minSize, maxSize, color }
    );

    refreshClusterAfterSymbology(refs);
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

      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ flex: 1, fontSize: 11, color: '#aaa' }}>
          Min Size
          <input
            type="number"
            min={1}
            max={50}
            value={minSize}
            onChange={(e) => setMinSize(Number(e.target.value))}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 2,
              background: '#2d2d44',
              border: '1px solid #444',
              color: '#e0e0e0',
              borderRadius: 3,
              padding: '2px 4px',
              fontSize: 11,
            }}
          />
        </label>

        <label style={{ flex: 1, fontSize: 11, color: '#aaa' }}>
          Max Size
          <input
            type="number"
            min={1}
            max={100}
            value={maxSize}
            onChange={(e) => setMaxSize(Number(e.target.value))}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 2,
              background: '#2d2d44',
              border: '1px solid #444',
              color: '#e0e0e0',
              borderRadius: 3,
              padding: '2px 4px',
              fontSize: 11,
            }}
          />
        </label>
      </div>

      <label style={{ fontSize: 11, color: '#aaa', display: 'flex', alignItems: 'center', gap: 8 }}>
        Color
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          style={{ width: 36, height: 22, border: 'none', background: 'none', cursor: 'pointer' }}
        />
        <span style={{ color: '#666', fontFamily: 'monospace' }}>{color}</span>
      </label>

      {error && (
        <p style={{ fontSize: 11, color: '#e94560', margin: 0 }}>{error}</p>
      )}

      <button className="symbology-apply-btn" onClick={handleApply}>
        Apply
      </button>
    </div>
  );
}

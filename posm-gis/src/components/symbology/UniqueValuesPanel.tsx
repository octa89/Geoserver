import { useState } from 'react';
import { useStore } from '../../store';
import { applyUniqueValues, refreshClusterAfterSymbology } from '../../lib/symbology';
import { getLayerRefs } from '../../store/leafletRegistry';

interface UniqueValuesPanelProps {
  layerName: string;
}

/**
 * Panel for Unique Values symbology mode.
 * Allows selecting a field and optionally grouping date values by year.
 */
export function UniqueValuesPanel({ layerName }: UniqueValuesPanelProps) {
  const layer = useStore((s) => s.layers[layerName]);
  const setLayerSymbology = useStore((s) => s.setLayerSymbology);

  const fields = layer?.fields ?? [];
  const [field, setField] = useState<string>(fields[0] ?? '');
  const [groupByYear, setGroupByYear] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApply = () => {
    setError(null);
    if (!field) {
      setError('Please select a field.');
      return;
    }

    const refs = getLayerRefs(layerName);
    if (!refs) {
      setError('Layer not loaded yet. Toggle visibility to load it.');
      return;
    }

    const result = applyUniqueValues(
      refs.leafletLayer,
      refs.geojson,
      layer.geomType,
      layer.pointSymbol,
      field,
      groupByYear
    );

    refreshClusterAfterSymbology(refs);
    setLayerSymbology(layerName, result);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 11, color: '#aaa' }}>
        Field
        <select
          className="symbology-field-select"
          value={field}
          onChange={(e) => setField(e.target.value)}
          style={{ display: 'block', width: '100%', marginTop: 2 }}
        >
          {fields.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </label>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          color: '#aaa',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={groupByYear}
          onChange={(e) => setGroupByYear(e.target.checked)}
          style={{ accentColor: '#42d4f4' }}
        />
        Group by Year
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

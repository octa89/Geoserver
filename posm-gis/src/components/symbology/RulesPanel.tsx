import { useState } from 'react';
import { useStore } from '../../store';
import { applyRules, refreshClusterAfterSymbology, applySymbologyOpacity, hasNonTrivialOpacity } from '../../lib/symbology';
import { getLayerRefs } from '../../store/leafletRegistry';
import type { RuleDef } from '../../types/symbology';

interface RulesPanelProps {
  layerName: string;
}

const OPERATORS = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IS NULL', 'IS NOT NULL'];

const nullOperators = new Set(['IS NULL', 'IS NOT NULL']);

function makeRule(fields: string[]): RuleDef {
  return {
    field: fields[0] ?? '',
    operator: '=',
    value: '',
    color: '#3388ff',
  };
}

/**
 * Panel for Rules-based symbology mode.
 * Renders a list of rule cards; the first matching rule colors each feature.
 */
export function RulesPanel({ layerName }: RulesPanelProps) {
  const layer = useStore((s) => s.layers[layerName]);
  const setLayerSymbology = useStore((s) => s.setLayerSymbology);

  const fields = layer?.fields ?? [];

  const [rules, setRules] = useState<RuleDef[]>([makeRule(fields)]);
  const [defaultColor, setDefaultColor] = useState('#888888');
  const [error, setError] = useState<string | null>(null);

  const updateRule = (index: number, partial: Partial<RuleDef>) => {
    setRules((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...partial } : r))
    );
  };

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  const addRule = () => {
    setRules((prev) => [...prev, makeRule(fields)]);
  };

  const handleApply = () => {
    setError(null);
    if (rules.length === 0) {
      setError('Add at least one rule.');
      return;
    }

    const refs = getLayerRefs(layerName);
    if (!refs) {
      setError('Layer not loaded yet. Toggle visibility to load it.');
      return;
    }

    const result = applyRules(
      refs.leafletLayer,
      refs.geojson,
      layer.geomType,
      layer.pointSymbol,
      { rules, defaultColor }
    );

    refreshClusterAfterSymbology(refs);
    if (hasNonTrivialOpacity(result, layer.opacity)) {
      applySymbologyOpacity(refs.leafletLayer, layer.geomType, result, layer.opacity);
    }
    setLayerSymbology(layerName, result);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rules.map((rule, idx) => (
        <div
          key={idx}
          style={{
            background: '#2d2d44',
            border: '1px solid #3a3a5a',
            borderRadius: 4,
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>Rule {idx + 1}</span>
            <button
              onClick={() => removeRule(idx)}
              style={{
                background: 'none',
                border: 'none',
                color: '#e94560',
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
                padding: '0 2px',
              }}
              title="Remove rule"
              aria-label="Remove rule"
            >
              x
            </button>
          </div>

          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {/* Field */}
            <select
              className="symbology-field-select"
              value={rule.field}
              onChange={(e) => updateRule(idx, { field: e.target.value })}
              style={{ flex: '1 1 90px', minWidth: 80 }}
            >
              {fields.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>

            {/* Operator */}
            <select
              className="symbology-field-select"
              value={rule.operator}
              onChange={(e) => updateRule(idx, { operator: e.target.value })}
              style={{ flex: '0 0 auto' }}
            >
              {OPERATORS.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>

            {/* Value (hidden for null-check operators) */}
            {!nullOperators.has(rule.operator) && (
              <input
                type="text"
                value={rule.value}
                onChange={(e) => updateRule(idx, { value: e.target.value })}
                placeholder="value"
                style={{
                  flex: '1 1 70px',
                  minWidth: 60,
                  background: '#1a1a2e',
                  border: '1px solid #444',
                  color: '#e0e0e0',
                  borderRadius: 3,
                  padding: '2px 5px',
                  fontSize: 11,
                }}
              />
            )}
          </div>

          {/* Color */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#aaa' }}>
            Color
            <input
              type="color"
              value={rule.color}
              onChange={(e) => updateRule(idx, { color: e.target.value })}
              style={{ width: 32, height: 20, border: 'none', background: 'none', cursor: 'pointer' }}
            />
            <span style={{ color: '#666', fontFamily: 'monospace', fontSize: 10 }}>{rule.color}</span>
          </label>
        </div>
      ))}

      <button
        onClick={addRule}
        style={{
          background: '#2d2d44',
          border: '1px dashed #444',
          color: '#42d4f4',
          borderRadius: 3,
          padding: '4px 8px',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        + Add Rule
      </button>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#aaa' }}>
        Default Color
        <input
          type="color"
          value={defaultColor}
          onChange={(e) => setDefaultColor(e.target.value)}
          style={{ width: 32, height: 20, border: 'none', background: 'none', cursor: 'pointer' }}
        />
        <span style={{ color: '#666', fontFamily: 'monospace', fontSize: 10 }}>{defaultColor}</span>
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

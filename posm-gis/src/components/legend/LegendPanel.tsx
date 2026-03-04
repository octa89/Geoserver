import { useStore } from '../../store';
import type {
  SymbologyConfig,
  UniqueSymbology,
  GraduatedSymbology,
  ProportionalSymbology,
  RuleSymbology,
} from '../../types/symbology';
import { COLOR_RAMPS } from '../../config/constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Swatch({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <span
      className="legend-swatch"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 2,
        background: color,
        border: '1px solid rgba(255,255,255,0.15)',
        flexShrink: 0,
      }}
    />
  );
}

function LegendEntry({ color, label, size }: { color: string; label: string; size?: number }) {
  return (
    <div
      className="legend-entry"
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#ccc', marginBottom: 2 }}
    >
      <Swatch color={color} size={size} />
      <span className="legend-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-mode legend renderers
// ---------------------------------------------------------------------------

function UniqueValuesLegend({ sym }: { sym: UniqueSymbology }) {
  const entries = Object.entries(sym.valueColorMap);
  return (
    <>
      {entries.map(([val, color]) => (
        <LegendEntry key={val} color={color} label={val || '(empty)'} />
      ))}
    </>
  );
}

function GraduatedLegend({ sym }: { sym: GraduatedSymbology }) {
  const { breaks, colors } = sym;
  if (!breaks.length || !colors.length) return null;

  return (
    <>
      {colors.map((color, i) => {
        const lo = breaks[i] !== undefined ? breaks[i].toLocaleString(undefined, { maximumFractionDigits: 2 }) : '?';
        const hi = breaks[i + 1] !== undefined ? breaks[i + 1].toLocaleString(undefined, { maximumFractionDigits: 2 }) : '?';
        const label = `${lo} - ${hi}`;
        return <LegendEntry key={i} color={color} label={label} />;
      })}
    </>
  );
}

function ProportionalLegend({ sym }: { sym: ProportionalSymbology }) {
  const swatchColor = sym.color ?? '#3388ff';
  const minVal = sym.minVal !== undefined ? sym.minVal : '—';
  const maxVal = sym.maxVal !== undefined ? sym.maxVal : '—';
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span
          style={{
            display: 'inline-block',
            width: sym.minSize,
            height: sym.minSize,
            borderRadius: '50%',
            background: swatchColor,
            border: '1px solid rgba(255,255,255,0.15)',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 10, color: '#ccc' }}>{String(minVal)} (min)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            display: 'inline-block',
            width: Math.min(sym.maxSize, 24),
            height: Math.min(sym.maxSize, 24),
            borderRadius: '50%',
            background: swatchColor,
            border: '1px solid rgba(255,255,255,0.15)',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 10, color: '#ccc' }}>{String(maxVal)} (max)</span>
      </div>
      <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>Field: {sym.field}</div>
    </>
  );
}

function RulesLegend({ sym }: { sym: RuleSymbology }) {
  return (
    <>
      {sym.rules.map((rule, i) => {
        const isNull = rule.operator === 'IS NULL' || rule.operator === 'IS NOT NULL';
        const label = isNull
          ? `${rule.field} ${rule.operator}`
          : `${rule.field} ${rule.operator} ${rule.value}`;
        return <LegendEntry key={i} color={rule.color} label={label} />;
      })}
      <LegendEntry color={sym.defaultColor} label="(default)" />
    </>
  );
}

function SymbologyLegend({ sym }: { sym: SymbologyConfig }) {
  switch (sym.mode) {
    case 'unique':
      return <UniqueValuesLegend sym={sym} />;
    case 'graduated':
      return <GraduatedLegend sym={sym} />;
    case 'proportional':
      return <ProportionalLegend sym={sym} />;
    case 'rules':
      return <RulesLegend sym={sym} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Ramp preview strip (small inline gradient) for graduated mode label
// ---------------------------------------------------------------------------

function RampStrip({ ramp }: { ramp: string }) {
  const stops = COLOR_RAMPS[ramp];
  if (!stops) return null;
  return (
    <span
      style={{
        display: 'inline-block',
        width: 36,
        height: 8,
        borderRadius: 2,
        background: `linear-gradient(to right, ${stops.join(', ')})`,
        verticalAlign: 'middle',
        marginLeft: 4,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// LegendPanel
// ---------------------------------------------------------------------------

/**
 * Reads all visible layers from the store and renders appropriate legend
 * entries based on their symbology configuration.
 */
export function LegendPanel() {
  const layers = useStore((s) => s.layers);
  const layerOrder = useStore((s) => s.layerOrder);

  // Only show visible layers, in display order (reversed so top layer is first)
  const visibleLayers = [...layerOrder]
    .reverse()
    .filter((name) => layers[name]?.visible);

  if (visibleLayers.length === 0) {
    return (
      <p style={{ fontSize: 11, color: '#555', margin: 0 }}>
        No visible layers.
      </p>
    );
  }

  return (
    <div className="legend-panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {visibleLayers.map((name) => {
        const layer = layers[name];
        const sym = layer.symbology;

        return (
          <div key={name} className="legend-layer-block">
            <div
              className="legend-layer-title"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#e0e0e0',
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {/* Swatch showing mode type or default color */}
              {sym?.mode === 'graduated' ? (
                <RampStrip ramp={(sym as GraduatedSymbology).ramp} />
              ) : (
                <Swatch color={layer.color} size={10} />
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {layer.label}
              </span>
              {sym && (
                <span style={{ fontSize: 9, color: '#888', marginLeft: 'auto', flexShrink: 0 }}>
                  {sym.mode}
                </span>
              )}
            </div>

            <div style={{ paddingLeft: 4 }}>
              {sym ? (
                <SymbologyLegend sym={sym} />
              ) : (
                <LegendEntry color={layer.color} label={layer.label} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

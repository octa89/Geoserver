import { useRef, useState, useCallback } from 'react';
import { useStore } from '../../store';
import { recolorSymbology, resetSymbology, refreshClusterAfterSymbology } from '../../lib/symbology';
import { getLayerRefs } from '../../store/leafletRegistry';
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

/**
 * Clickable swatch that opens a hidden color input when clicked.
 * Used for layers without symbology (single symbol mode).
 */
function ClickableSwatch({ color, layerName, size = 12 }: { color: string; layerName: string; size?: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const setLayerColor = useStore((s) => s.setLayerColor);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    setLayerColor(layerName, newColor);

    const layer = useStore.getState().layers[layerName];
    if (!layer) return;

    const refs = getLayerRefs(layerName);
    if (refs) {
      resetSymbology(
        refs.leafletLayer,
        layer.geomType,
        newColor,
        layer.pointSymbol,
        refs.geojson
      );
      refreshClusterAfterSymbology(refs);
    }
  };

  return (
    <span style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
      <span
        className="legend-swatch"
        onClick={() => inputRef.current?.click()}
        title="Click to change color"
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          borderRadius: 2,
          background: color,
          border: '1px solid rgba(255,255,255,0.15)',
          cursor: 'pointer',
          transition: 'box-shadow 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 0 2px #42d4f4'; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
      />
      <input
        ref={inputRef}
        type="color"
        value={color}
        onChange={handleChange}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          opacity: 0,
          overflow: 'hidden',
          border: 'none',
          padding: 0,
        }}
        tabIndex={-1}
      />
    </span>
  );
}


function ClickableLegendEntry({ color, label, layerName, size }: { color: string; label: string; layerName: string; size?: number }) {
  return (
    <div
      className="legend-entry"
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#ccc', marginBottom: 2 }}
    >
      <ClickableSwatch color={color} layerName={layerName} size={size} />
      <span className="legend-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clickable symbology swatch — updates a specific color in the symbology config
// ---------------------------------------------------------------------------

function ClickableSymSwatch({
  color,
  onColorChange,
  size = 12,
}: {
  color: string;
  onColorChange: (newColor: string) => void;
  size?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <span style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
      <span
        className="legend-swatch"
        onClick={() => inputRef.current?.click()}
        title="Click to change color"
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          borderRadius: 2,
          background: color,
          border: '1px solid rgba(255,255,255,0.15)',
          cursor: 'pointer',
          transition: 'box-shadow 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 0 2px #42d4f4'; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
      />
      <input
        ref={inputRef}
        type="color"
        value={color}
        onChange={(e) => onColorChange(e.target.value)}
        style={{
          position: 'absolute',
          top: 0, left: 0,
          width: 0, height: 0,
          opacity: 0,
          overflow: 'hidden',
          border: 'none',
          padding: 0,
        }}
        tabIndex={-1}
      />
    </span>
  );
}

/** Apply a modified symbology config to the store + Leaflet map */
function commitSymbology(layerName: string, newSym: SymbologyConfig) {
  const setLayerSymbology = useStore.getState().setLayerSymbology;
  setLayerSymbology(layerName, newSym);

  const layer = useStore.getState().layers[layerName];
  const refs = getLayerRefs(layerName);
  if (!refs || !layer) return;

  recolorSymbology(refs.leafletLayer, refs.geojson, layer.geomType, layer.pointSymbol, newSym);
  refreshClusterAfterSymbology(refs);
}

// ---------------------------------------------------------------------------
// Per-mode legend renderers
// ---------------------------------------------------------------------------

function UniqueValuesLegend({ sym, onUpdate }: { sym: UniqueSymbology; onUpdate: (s: SymbologyConfig) => void }) {
  const entries = Object.entries(sym.valueColorMap);
  return (
    <>
      {entries.map(([val, color]) => (
        <div
          key={val}
          className="legend-entry"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#ccc', marginBottom: 2 }}
        >
          <ClickableSymSwatch
            color={color}
            onColorChange={(newColor) => {
              onUpdate({ ...sym, valueColorMap: { ...sym.valueColorMap, [val]: newColor } });
            }}
          />
          <span className="legend-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {val || '(empty)'}
          </span>
        </div>
      ))}
    </>
  );
}

function GraduatedLegend({ sym, onUpdate }: { sym: GraduatedSymbology; onUpdate: (s: SymbologyConfig) => void }) {
  const { breaks, colors } = sym;
  if (!breaks.length || !colors.length) return null;

  return (
    <>
      {colors.map((color, i) => {
        const lo = breaks[i] !== undefined ? breaks[i].toLocaleString(undefined, { maximumFractionDigits: 2 }) : '?';
        const hi = breaks[i + 1] !== undefined ? breaks[i + 1].toLocaleString(undefined, { maximumFractionDigits: 2 }) : '?';
        const label = `${lo} - ${hi}`;
        return (
          <div
            key={i}
            className="legend-entry"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#ccc', marginBottom: 2 }}
          >
            <ClickableSymSwatch
              color={color}
              onColorChange={(newColor) => {
                const newColors = [...sym.colors];
                newColors[i] = newColor;
                onUpdate({ ...sym, colors: newColors });
              }}
            />
            <span className="legend-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
            </span>
          </div>
        );
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

function RulesLegend({ sym, onUpdate }: { sym: RuleSymbology; onUpdate: (s: SymbologyConfig) => void }) {
  return (
    <>
      {sym.rules.map((rule, i) => {
        const isNull = rule.operator === 'IS NULL' || rule.operator === 'IS NOT NULL';
        const label = isNull
          ? `${rule.field} ${rule.operator}`
          : `${rule.field} ${rule.operator} ${rule.value}`;
        return (
          <div
            key={i}
            className="legend-entry"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#ccc', marginBottom: 2 }}
          >
            <ClickableSymSwatch
              color={rule.color}
              onColorChange={(newColor) => {
                const newRules = sym.rules.map((r, j) => j === i ? { ...r, color: newColor } : r);
                onUpdate({ ...sym, rules: newRules });
              }}
            />
            <span className="legend-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
            </span>
          </div>
        );
      })}
      <div
        className="legend-entry"
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#ccc', marginBottom: 2 }}
      >
        <ClickableSymSwatch
          color={sym.defaultColor}
          onColorChange={(newColor) => {
            onUpdate({ ...sym, defaultColor: newColor });
          }}
        />
        <span className="legend-label">(default)</span>
      </div>
    </>
  );
}

function SymbologyLegend({ sym, onUpdate }: { sym: SymbologyConfig; onUpdate: (s: SymbologyConfig) => void }) {
  switch (sym.mode) {
    case 'unique':
      return <UniqueValuesLegend sym={sym} onUpdate={onUpdate} />;
    case 'graduated':
      return <GraduatedLegend sym={sym} onUpdate={onUpdate} />;
    case 'proportional':
      return <ProportionalLegend sym={sym} />;
    case 'rules':
      return <RulesLegend sym={sym} onUpdate={onUpdate} />;
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
 *
 * When no symbology is active (single symbol), the color swatch is clickable
 * to change the layer's base color.
 */
/**
 * Per-layer legend block with pending color edits and an OK button.
 */
function LayerLegendBlock({ name }: { name: string }) {
  const layer = useStore((s) => s.layers[name]);
  const sym = layer?.symbology ?? null;

  // Pending symbology: holds user color edits before they're applied to the map
  const [pending, setPending] = useState<SymbologyConfig | null>(null);
  const hasPending = pending !== null;

  // The symbology to render (pending edits take priority over store)
  const displaySym = pending ?? sym;

  const handleApply = useCallback(() => {
    if (!pending) return;
    commitSymbology(name, pending);
    setPending(null);
  }, [pending, name]);

  // Reset pending when store symbology changes externally (e.g. new symbology applied from panel)
  const symRef = useRef(sym);
  if (sym !== symRef.current) {
    symRef.current = sym;
    if (pending) setPending(null);
  }

  const [layerCollapsed, setLayerCollapsed] = useState(false);

  if (!layer) return null;

  return (
    <div className="legend-layer-block">
      <div
        className="legend-layer-title"
        onClick={() => setLayerCollapsed(!layerCollapsed)}
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#e0e0e0',
          marginBottom: layerCollapsed ? 0 : 4,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{
          fontSize: 8, color: '#42d4f4', lineHeight: 1, flexShrink: 0,
          transition: 'transform 0.15s',
          transform: layerCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          display: 'inline-block',
        }}>
          &#9660;
        </span>
        {displaySym?.mode === 'graduated' ? (
          <RampStrip ramp={(displaySym as GraduatedSymbology).ramp} />
        ) : !displaySym ? (
          <span onClick={(e) => e.stopPropagation()}>
            <ClickableSwatch color={layer.color} layerName={name} size={10} />
          </span>
        ) : (
          <Swatch color={layer.color} size={10} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {layer.label}
        </span>
        {displaySym && (
          <span style={{ fontSize: 9, color: '#888', marginLeft: 'auto', flexShrink: 0 }}>
            {displaySym.mode}
          </span>
        )}
      </div>

      {!layerCollapsed && (
        <>
          <div style={{ paddingLeft: 4 }}>
            {displaySym ? (
              <SymbologyLegend sym={displaySym} onUpdate={setPending} />
            ) : (
              <ClickableLegendEntry color={layer.color} label={layer.label} layerName={name} />
            )}
          </div>

          {hasPending && (
            <button
              onClick={handleApply}
              style={{
                marginTop: 4,
                padding: '3px 12px',
                fontSize: 10,
                fontWeight: 700,
                background: '#42d4f4',
                color: '#0a0a1a',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              OK
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function LegendPanel() {
  const layers = useStore((s) => s.layers);
  const layerOrder = useStore((s) => s.layerOrder);

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
      {visibleLayers.map((name) => (
        <LayerLegendBlock key={name} name={name} />
      ))}
    </div>
  );
}

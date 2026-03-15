import { useRef, useState, useCallback, useEffect } from 'react';
import { useStore } from '../../store';
import { recolorSymbology, resetSymbology, refreshClusterAfterSymbology, applySymbologyOpacity, hasNonTrivialOpacity } from '../../lib/symbology';
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

function Swatch({ color, size = 12, opacity = 1 }: { color: string; size?: number; opacity?: number }) {
  return (
    <span
      className="legend-swatch"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 2,
        background: color,
        opacity,
        border: '1px solid rgba(255,255,255,0.15)',
        flexShrink: 0,
      }}
    />
  );
}

/**
 * Clickable swatch that opens a popover with color picker + opacity slider.
 * Used for layers without symbology (single symbol mode).
 */
function ClickableSwatch({ color, layerName, size = 12 }: { color: string; layerName: string; size?: number }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const setLayerColor = useStore((s) => s.setLayerColor);
  const setLayerOpacity = useStore((s) => s.setLayerOpacity);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    setLayerColor(layerName, newColor);

    const layer = useStore.getState().layers[layerName];
    if (!layer) return;

    const refs = getLayerRefs(layerName);
    if (refs) {
      resetSymbology(refs.leafletLayer, layer.geomType, newColor, layer.pointSymbol, refs.geojson);
      refreshClusterAfterSymbology(refs);
      if (hasNonTrivialOpacity(null, layer.opacity)) {
        applySymbologyOpacity(refs.leafletLayer, layer.geomType, null, layer.opacity);
      }
    }
  };

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const opacity = Number(e.target.value) / 100;
    setLayerOpacity(layerName, opacity);

    const layer = useStore.getState().layers[layerName];
    if (!layer) return;

    const refs = getLayerRefs(layerName);
    if (refs) {
      applySymbologyOpacity(refs.leafletLayer, layer.geomType, null, opacity);
    }
  };

  const layer = useStore.getState().layers[layerName];
  const currentOpacity = layer?.opacity ?? 1;

  return (
    <span ref={containerRef} style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
      <span
        className="legend-swatch"
        onClick={() => setOpen(!open)}
        title="Click to edit color & opacity"
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          borderRadius: 2,
          background: color,
          opacity: currentOpacity,
          border: '1px solid rgba(255,255,255,0.15)',
          cursor: 'pointer',
          transition: 'box-shadow 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 0 2px #42d4f4'; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
      />
      {open && (
        <div style={{
          position: 'absolute', top: size + 4, left: 0, zIndex: 200,
          background: '#1a1a2e', border: '1px solid #3a3a5a', borderRadius: 6,
          padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
          minWidth: 150, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: '#888', minWidth: 38 }}>Color</span>
            <input type="color" value={color} onChange={handleColorChange}
              style={{ width: 28, height: 20, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
            <span style={{ fontSize: 9, color: '#666', fontFamily: 'monospace' }}>{color}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: '#888', minWidth: 38 }}>Opacity</span>
            <input type="range" min={0} max={100} step={5}
              value={Math.round(currentOpacity * 100)} onChange={handleOpacityChange}
              style={{ width: 60, height: 3, accentColor: '#42d4f4', cursor: 'pointer' }} />
            <span style={{ fontSize: 9, color: '#aaa' }}>{Math.round(currentOpacity * 100)}%</span>
          </div>
        </div>
      )}
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
// Clickable symbology swatch — popover with color picker + opacity slider
// ---------------------------------------------------------------------------

function ClickableSymSwatch({
  color,
  opacity = 1,
  onColorChange,
  onOpacityChange,
  size = 12,
}: {
  color: string;
  opacity?: number;
  onColorChange: (newColor: string) => void;
  onOpacityChange?: (newOpacity: number) => void;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <span ref={containerRef} style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
      <span
        className="legend-swatch"
        onClick={() => setOpen(!open)}
        title="Click to edit color & opacity"
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          borderRadius: 2,
          background: color,
          opacity,
          border: '1px solid rgba(255,255,255,0.15)',
          cursor: 'pointer',
          transition: 'box-shadow 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 0 2px #42d4f4'; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
      />
      {open && (
        <div style={{
          position: 'absolute', top: size + 4, left: 0, zIndex: 200,
          background: '#1a1a2e', border: '1px solid #3a3a5a', borderRadius: 6,
          padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
          minWidth: 150, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: '#888', minWidth: 38 }}>Color</span>
            <input type="color" value={color} onChange={(e) => onColorChange(e.target.value)}
              style={{ width: 28, height: 20, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
            <span style={{ fontSize: 9, color: '#666', fontFamily: 'monospace' }}>{color}</span>
          </div>
          {onOpacityChange && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: '#888', minWidth: 38 }}>Opacity</span>
              <input type="range" min={0} max={100} step={5}
                value={Math.round(opacity * 100)}
                onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
                style={{ width: 60, height: 3, accentColor: '#42d4f4', cursor: 'pointer' }} />
              <span style={{ fontSize: 9, color: '#aaa' }}>{Math.round(opacity * 100)}%</span>
            </div>
          )}
        </div>
      )}
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

  if (hasNonTrivialOpacity(newSym, layer.opacity)) {
    applySymbologyOpacity(refs.leafletLayer, layer.geomType, newSym, layer.opacity);
  }
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
            opacity={sym.valueOpacityMap?.[val] ?? 1}
            onColorChange={(newColor) => {
              onUpdate({ ...sym, valueColorMap: { ...sym.valueColorMap, [val]: newColor } });
            }}
            onOpacityChange={(newOpacity) => {
              onUpdate({ ...sym, valueOpacityMap: { ...(sym.valueOpacityMap ?? {}), [val]: newOpacity } });
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
              opacity={sym.opacities?.[i] ?? 1}
              onColorChange={(newColor) => {
                const newColors = [...sym.colors];
                newColors[i] = newColor;
                onUpdate({ ...sym, colors: newColors });
              }}
              onOpacityChange={(newOpacity) => {
                const newOpacities = [...(sym.opacities ?? sym.colors.map(() => 1))];
                newOpacities[i] = newOpacity;
                onUpdate({ ...sym, opacities: newOpacities });
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

function ProportionalLegend({ sym, onUpdate }: { sym: ProportionalSymbology; onUpdate: (s: SymbologyConfig) => void }) {
  const swatchColor = sym.color ?? '#3388ff';
  const minVal = sym.minVal !== undefined ? sym.minVal : '\u2014';
  const maxVal = sym.maxVal !== undefined ? sym.maxVal : '\u2014';
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <ClickableSymSwatch
          color={swatchColor}
          opacity={sym.opacity ?? 1}
          size={Math.max(sym.minSize, 8)}
          onColorChange={(newColor) => {
            onUpdate({ ...sym, color: newColor });
          }}
          onOpacityChange={(newOpacity) => {
            onUpdate({ ...sym, opacity: newOpacity });
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
            opacity: sym.opacity ?? 1,
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
              opacity={rule.opacity ?? 1}
              onColorChange={(newColor) => {
                const newRules = sym.rules.map((r, j) => j === i ? { ...r, color: newColor } : r);
                onUpdate({ ...sym, rules: newRules });
              }}
              onOpacityChange={(newOpacity) => {
                const newRules = sym.rules.map((r, j) => j === i ? { ...r, opacity: newOpacity } : r);
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
          opacity={sym.defaultOpacity ?? 1}
          onColorChange={(newColor) => {
            onUpdate({ ...sym, defaultColor: newColor });
          }}
          onOpacityChange={(newOpacity) => {
            onUpdate({ ...sym, defaultOpacity: newOpacity });
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
      return <ProportionalLegend sym={sym} onUpdate={onUpdate} />;
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
 * Per-layer legend block with pending color/opacity edits and an OK button.
 */
function LayerLegendBlock({ name }: { name: string }) {
  const layer = useStore((s) => s.layers[name]);
  const sym = layer?.symbology ?? null;

  // Pending symbology: holds user color/opacity edits before they're applied to the map
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

  const [layerCollapsed, setLayerCollapsed] = useState(true);

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
  // Subscribe to a visibility-only selector so we re-render when layers are
  // shown/hidden, but NOT on every color/symbology/filter change.
  const visibleSet = useStore((s) => {
    const vis: string[] = [];
    for (const n of s.layerOrder) {
      if (s.layers[n]?.visible) vis.push(n);
    }
    return vis.join(',');
  });

  const visibleLayers = visibleSet.split(',').filter(Boolean).reverse();

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

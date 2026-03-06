import { useState, useCallback } from 'react';
import L from 'leaflet';
import { useStore } from '../../store';
import type {
  UniqueSymbology,
  GraduatedSymbology,
  ProportionalSymbology,
  RuleSymbology,
} from '../../types/symbology';
import { darkenColor } from '../../lib/colorUtils';

/**
 * Floating map legend control positioned in the top-right corner.
 * Styled like a modern Leaflet control with a collapsible header.
 * Shows all visible layers with their symbology legend entries.
 */
export function MapLegendControl() {
  const layers = useStore((s) => s.layers);
  const layerOrder = useStore((s) => s.layerOrder);
  const [collapsed, setCollapsed] = useState(false);

  const visibleLayers = [...layerOrder].reverse().filter((n) => layers[n]?.visible);

  // Ref callback: prevent mouse/wheel events from propagating to the Leaflet map.
  // Uses a callback ref so it fires when the DOM element actually mounts (not on
  // an initial null render when there are no visible layers).
  const legendRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  }, []);

  if (visibleLayers.length === 0) return null;

  return (
    <div
      ref={legendRef}
      className="map-legend-control"
      style={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 1000,
        background: 'rgba(26,26,46,0.95)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(66,212,244,0.3)',
        borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        minWidth: collapsed ? 44 : 200,
        maxWidth: 360,
        maxHeight: collapsed ? 40 : 'calc(85vh - 40px)',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: collapsed ? '8px 12px' : '10px 14px',
          cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid rgba(66,212,244,0.2)',
          userSelect: 'none',
        }}
      >
        {!collapsed && (
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#42d4f4',
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}>
            Legend
          </span>
        )}
        <span style={{
          fontSize: 16,
          color: '#42d4f4',
          lineHeight: 1,
          fontWeight: 'bold',
        }}>
          {collapsed ? '\u25C0' : '\u25BC'}
        </span>
      </div>

      {/* Content */}
      {!collapsed && (
        <div style={{
          padding: '10px 14px',
          overflowY: 'auto',
          maxHeight: 'calc(85vh - 80px)',
        }}>
          {visibleLayers.map((name) => (
            <CollapsibleLayerLegend key={name} name={name} layer={layers[name]} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible per-layer legend block
// ---------------------------------------------------------------------------

function CollapsibleLayerLegend({ name, layer }: { name: string; layer: import('../../types/layer').LayerConfig }) {
  const [layerCollapsed, setLayerCollapsed] = useState(false);
  const sym = layer.symbology;

  return (
    <div key={name} style={{ marginBottom: 12 }}>
      {/* Layer title — clickable to toggle */}
      <div
        onClick={() => setLayerCollapsed(!layerCollapsed)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: layerCollapsed ? 0 : 6,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{
          fontSize: 10, color: '#42d4f4', lineHeight: 1, flexShrink: 0,
          transition: 'transform 0.15s',
          transform: layerCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          display: 'inline-block',
        }}>
          &#9660;
        </span>
        <LayerSwatch color={layer.color} geomType={layer.geomType} />
        <span style={{
          fontSize: 13, fontWeight: 600, color: '#e8e8e8',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1,
        }}>
          {layer.label}
        </span>
        <span style={{ fontSize: 11, color: layer.activeFilters?.length ? '#42d4f4' : '#888', flexShrink: 0 }}>
          {layer.activeFilters?.length
            ? `${layer.featureCount.toLocaleString()}/${layer.totalFeatureCount.toLocaleString()}`
            : layer.featureCount.toLocaleString()}
        </span>
      </div>

      {/* Symbology entries — collapsible */}
      {!layerCollapsed && (
        <div style={{ paddingLeft: 4 }}>
          {sym ? (
            <SymLegend sym={sym} />
          ) : (
            <LegendRow color={layer.color} label="All features" geomType={layer.geomType} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LayerSwatch({ color, geomType }: { color: string; geomType: string }) {
  const isPoint = geomType === 'Point' || geomType === 'MultiPoint';
  const isLine = geomType === 'LineString' || geomType === 'MultiLineString';

  if (isPoint) {
    return (
      <span style={{
        width: 14, height: 14, borderRadius: '50%',
        background: color, border: `2px solid ${darkenColor(color)}`,
        flexShrink: 0, display: 'inline-block',
      }} />
    );
  }
  if (isLine) {
    return (
      <span style={{
        width: 22, height: 4, borderRadius: 2,
        background: color, flexShrink: 0, display: 'inline-block',
      }} />
    );
  }
  return (
    <span style={{
      width: 16, height: 12, borderRadius: 2,
      background: color, border: `1.5px solid ${darkenColor(color)}`,
      opacity: 0.7, flexShrink: 0, display: 'inline-block',
    }} />
  );
}

function LegendRow({ color, label, geomType }: { color: string; label: string; geomType?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0' }}>
      {geomType ? (
        <LayerSwatch color={color} geomType={geomType} />
      ) : (
        <span style={{
          width: 14, height: 14, borderRadius: 3,
          background: color, border: '1px solid rgba(255,255,255,0.15)',
          flexShrink: 0, display: 'inline-block',
        }} />
      )}
      <span style={{
        fontSize: 12, color: '#ccc',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    </div>
  );
}

function SymLegend({ sym }: { sym: import('../../types/symbology').SymbologyConfig }) {
  switch (sym.mode) {
    case 'unique':
      return <UniqueEntries sym={sym} />;
    case 'graduated':
      return <GraduatedEntries sym={sym} />;
    case 'proportional':
      return <PropEntries sym={sym} />;
    case 'rules':
      return <RuleEntries sym={sym} />;
    default:
      return null;
  }
}

function UniqueEntries({ sym }: { sym: UniqueSymbology }) {
  const entries = Object.entries(sym.valueColorMap);
  const maxShow = 15;
  const shown = entries.slice(0, maxShow);
  return (
    <>
      {shown.map(([val, color]) => (
        <LegendRow key={val} color={color} label={val || '(empty)'} />
      ))}
      {entries.length > maxShow && (
        <span style={{ fontSize: 11, color: '#888', paddingLeft: 21 }}>
          +{entries.length - maxShow} more
        </span>
      )}
    </>
  );
}

function GraduatedEntries({ sym }: { sym: GraduatedSymbology }) {
  return (
    <>
      {sym.colors.map((color, i) => {
        const lo = sym.breaks[i]?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '?';
        const hi = sym.breaks[i + 1]?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '?';
        return <LegendRow key={i} color={color} label={`${lo} — ${hi}`} />;
      })}
    </>
  );
}

function PropEntries({ sym }: { sym: ProportionalSymbology }) {
  const c = sym.color ?? '#3388ff';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 0' }}>
      <span style={{
        width: Math.max(sym.minSize / 2, 6), height: Math.max(sym.minSize / 2, 6),
        borderRadius: '50%', background: c, border: '1px solid rgba(255,255,255,0.15)',
        display: 'inline-block',
      }} />
      <span style={{ fontSize: 12, color: '#ccc' }}>
        {sym.minVal ?? '?'} — {sym.maxVal ?? '?'} ({sym.field})
      </span>
      <span style={{
        width: Math.min(sym.maxSize / 2, 16), height: Math.min(sym.maxSize / 2, 16),
        borderRadius: '50%', background: c, border: '1px solid rgba(255,255,255,0.15)',
        display: 'inline-block',
      }} />
    </div>
  );
}

function RuleEntries({ sym }: { sym: RuleSymbology }) {
  return (
    <>
      {sym.rules.map((rule, i) => {
        const isNull = rule.operator === 'IS NULL' || rule.operator === 'IS NOT NULL';
        const lbl = isNull
          ? `${rule.field} ${rule.operator}`
          : `${rule.field} ${rule.operator} ${rule.value}`;
        return <LegendRow key={i} color={rule.color} label={lbl} />;
      })}
      <LegendRow color={sym.defaultColor} label="(default)" />
    </>
  );
}

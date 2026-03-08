import { useState, useCallback } from 'react';
import L from 'leaflet';
import type {
  SymbologyConfig,
  UniqueSymbology,
  GraduatedSymbology,
  ProportionalSymbology,
  RuleSymbology,
} from '../../types/symbology';
import { darkenColor } from '../../lib/colorUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShareLayerInfo {
  name: string;
  label: string;
  color: string;
  geomType: string;
  symbology: SymbologyConfig | null;
  featureCount: number;
}

interface ShareLegendProps {
  layers: ShareLayerInfo[];
  hiddenLayers?: Record<string, boolean>;
  onToggleLayer?: (layerName: string) => void;
}

// ---------------------------------------------------------------------------
// ShareLegend — standalone legend for the public share view
// ---------------------------------------------------------------------------

export function ShareLegend({ layers, hiddenLayers = {}, onToggleLayer }: ShareLegendProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Ref callback: prevent mouse/wheel events from propagating to the Leaflet map.
  const legendRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  }, []);

  if (layers.length === 0) return null;

  return (
    <div
      ref={legendRef}
      className="share-legend"
      style={{
        position: 'absolute',
        top: 56,
        right: 12,
        zIndex: 1000,
        background: 'rgba(26,26,46,0.95)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(66,212,244,0.3)',
        borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        minWidth: collapsed ? 44 : 240,
        maxWidth: 360,
        maxHeight: collapsed ? 40 : '50vh',
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
          {collapsed ? '\u25B6' : '\u25BC'}
        </span>
      </div>

      {/* Content */}
      {!collapsed && (
        <div style={{
          padding: '10px 14px',
          overflowY: 'auto',
          maxHeight: 'calc(50vh - 50px)',
        }}>
          {layers.map((layer) => (
            <CollapsibleShareLayerLegend
              key={layer.name}
              layer={layer}
              isHidden={!!hiddenLayers[layer.name]}
              onToggleLayer={onToggleLayer}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible per-layer legend block for share view
// ---------------------------------------------------------------------------

function CollapsibleShareLayerLegend({
  layer,
  isHidden,
  onToggleLayer,
}: {
  layer: ShareLayerInfo;
  isHidden: boolean;
  onToggleLayer?: (layerName: string) => void;
}) {
  const [layerCollapsed, setLayerCollapsed] = useState(false);

  const handleToggle = useCallback(() => {
    onToggleLayer?.(layer.name);
  }, [onToggleLayer, layer.name]);

  return (
    <div style={{ marginBottom: 12, opacity: isHidden ? 0.4 : 1, transition: 'opacity 0.15s' }}>
      {/* Layer title — clickable to toggle collapse */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: layerCollapsed ? 0 : 6,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        {onToggleLayer && (
          <input
            type="checkbox"
            checked={!isHidden}
            onChange={handleToggle}
            onClick={(e) => e.stopPropagation()}
            title={isHidden ? 'Show layer' : 'Hide layer'}
            style={{ margin: 0, cursor: 'pointer', accentColor: '#42d4f4', flexShrink: 0 }}
          />
        )}
        <span
          onClick={() => setLayerCollapsed(!layerCollapsed)}
          style={{
            fontSize: 10, color: '#42d4f4', lineHeight: 1, flexShrink: 0,
            transition: 'transform 0.15s',
            transform: layerCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            display: 'inline-block',
          }}
        >
          &#9660;
        </span>
        <div
          onClick={() => setLayerCollapsed(!layerCollapsed)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, overflow: 'hidden' }}
        >
          <LayerSwatch color={layer.color} geomType={layer.geomType} />
          <span style={{
            fontSize: 13, fontWeight: 600, color: '#e8e8e8',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {layer.label}
          </span>
          <span style={{ fontSize: 11, color: '#888', flexShrink: 0 }}>
            {layer.featureCount.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Symbology entries — collapsible */}
      {!layerCollapsed && (
        <div style={{ paddingLeft: 4 }}>
          {layer.symbology ? (
            <SymLegend sym={layer.symbology} />
          ) : (
            <LegendRow color={layer.color} label="All features" geomType={layer.geomType} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components (same visual patterns as MapLegendControl)
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

function SymLegend({ sym }: { sym: SymbologyConfig }) {
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

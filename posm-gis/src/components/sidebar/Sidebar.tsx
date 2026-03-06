import { useRef, useState, useCallback, useEffect } from 'react';
import type { RefObject } from 'react';
import type L from 'leaflet';
import { useStore } from '../../store';
import { BASEMAPS } from '../../config/constants';
import type { BasemapKey } from '../../config/constants';
import { LayerPanel } from './LayerPanel';
import { FilterPanel } from '../filter/FilterPanel';
import { SymbologyPanel } from '../symbology/SymbologyPanel';
import { LegendPanel } from '../legend/LegendPanel';
import { BookmarkPanel } from './BookmarkPanel';
import { ShareModal } from '../share/ShareModal';
import { useSession } from '../../hooks/useSession';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIDEBAR_MIN_WIDTH = 200;   // px
const SIDEBAR_MAX_WIDTH = 600;   // px
const SIDEBAR_DEFAULT_WIDTH = 280; // px

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SidebarProps {
  mapRef: RefObject<L.Map | null>;
  user?: { displayName: string; role?: string };
  onLogout?: () => void;
  isAdmin?: boolean;
  onSwitchWorkspace?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

/**
 * Resizable sidebar with:
 * - A header bar (POSM GIS branding + collapse toggle)
 * - Basemap switcher
 * - LayerPanel (layer list with search)
 * - Placeholders for Symbology, Legend, and Bookmarks panels
 *
 * Drag-to-resize is implemented via a thin handle on the right edge.
 * Width is stored in local state; the map container automatically fills the
 * remaining horizontal space because the parent uses a flex layout.
 */
export function Sidebar({ mapRef, user, onLogout, isAdmin, onSwitchWorkspace, mobileOpen, onMobileClose }: SidebarProps) {
  const storeSidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  // On mobile, when the overlay is open, always show expanded content
  const sidebarOpen = mobileOpen || storeSidebarOpen;
  const basemap = useStore((s) => s.basemap);
  const setBasemap = useStore((s) => s.setBasemap);
  const currentWorkspace = useStore((s) => s.currentWorkspace);

  const { saveSession, isSaving } = useSession();
  const [saveFlash, setSaveFlash] = useState(false);

  const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // ---- Drag-to-resize logic -----------------------------------------------

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarRef.current?.offsetWidth ?? width;
    e.preventDefault();
  }, [width]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      const next = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, startWidth.current + delta)
      );
      setWidth(next);
    };

    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      // Notify Leaflet to recalculate its container size
      mapRef.current?.invalidateSize();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [mapRef]);

  // ---- Basemap change -------------------------------------------------------

  const handleBasemapChange = useCallback(
    (key: BasemapKey) => {
      setBasemap(key);
    },
    [setBasemap]
  );

  // ---- Render ---------------------------------------------------------------

  return (
    <div
      ref={sidebarRef}
      className={`sidebar ${sidebarOpen ? 'sidebar--open' : 'sidebar--collapsed'}${mobileOpen ? ' sidebar--mobile-open' : ''}`}
      style={{
        position: 'relative',
        width: sidebarOpen ? width : 40,
        minWidth: sidebarOpen ? SIDEBAR_MIN_WIDTH : 40,
        maxWidth: sidebarOpen ? SIDEBAR_MAX_WIDTH : 40,
        transition: isDragging.current ? 'none' : 'width 0.15s ease',
        display: 'flex',
        flexDirection: 'column',
        background: '#1a1a2e',
        color: '#e0e0e0',
        overflow: 'hidden',
        flexShrink: 0,
        zIndex: 1000,
      }}
    >
      {/* ----- Header -------------------------------------------------------- */}
      <div
        className="sidebar-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 10px',
          borderBottom: '1px solid #2d2d44',
          flexShrink: 0,
          gap: 8,
        }}
      >
        <button
          className="sidebar-toggle"
          onClick={() => {
            if (mobileOpen && onMobileClose) {
              onMobileClose();
            } else {
              setSidebarOpen(!sidebarOpen);
            }
            // Give the browser a tick to reflow before telling Leaflet
            setTimeout(() => mapRef.current?.invalidateSize(), 200);
          }}
          title={mobileOpen ? 'Close menu' : sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          style={{
            background: 'none',
            border: 'none',
            color: '#ccc',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: 0,
            flexShrink: 0,
          }}
          aria-label={mobileOpen ? 'Close menu' : sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {mobileOpen ? '\u2715' : sidebarOpen ? '\u276E' : '\u276F'}
        </button>

        {sidebarOpen && (
          <>
            <span
              className="sidebar-title"
              style={{ fontWeight: 700, fontSize: 15, letterSpacing: 0.5, color: '#42d4f4' }}
            >
              POSM GIS
            </span>

            {/* Save button */}
            <button
              onClick={async () => {
                await saveSession();
                setSaveFlash(true);
                setTimeout(() => setSaveFlash(false), 1500);
              }}
              disabled={isSaving}
              title="Save current configuration"
              aria-label="Save config"
              style={{
                background: saveFlash ? '#2ecc71' : 'none',
                border: `1px solid ${saveFlash ? '#2ecc71' : '#42d4f4'}`,
                borderRadius: 4,
                color: saveFlash ? '#fff' : '#42d4f4',
                cursor: isSaving ? 'wait' : 'pointer',
                fontSize: 11,
                fontWeight: 600,
                lineHeight: 1,
                padding: '4px 8px',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.2s',
              }}
            >
              {saveFlash ? 'Saved!' : isSaving ? 'Saving...' : 'Save'}
            </button>

            {/* Share button */}
            <button
              onClick={() => setShareModalOpen(true)}
              title="Share this map view"
              aria-label="Share map"
              style={{
                background: 'none',
                border: '1px solid #42d4f4',
                borderRadius: 4,
                color: '#42d4f4',
                cursor: 'pointer',
                fontSize: 13,
                lineHeight: 1,
                padding: '3px 7px',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              &#x1F517;
            </button>

            {user && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 }}>
                <span style={{ color: '#888', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.displayName}</span>
                {onLogout && (
                  <button
                    onClick={onLogout}
                    style={{
                      background: '#e94560', color: '#fff', border: 'none',
                      borderRadius: 4, padding: '4px 10px',
                      fontSize: 11, cursor: 'pointer', fontWeight: 600,
                    }}
                  >
                    Logout
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ----- Workspace bar ------------------------------------------------ */}
      {sidebarOpen && currentWorkspace && (
        <div
          className="ws-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 18px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: '#0f3460',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span style={{
            color: '#7f8fa6',
            fontSize: 11,
            flexShrink: 0,
          }}>
            Workspace:
          </span>
          <span style={{
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }} title={currentWorkspace}>
            {currentWorkspace}
          </span>
          {isAdmin && onSwitchWorkspace && (
            <button
              onClick={onSwitchWorkspace}
              title="Switch workspace"
              className="ws-switch-btn"
              style={{
                background: 'transparent',
                border: '1px solid #42d4f4',
                color: '#42d4f4',
                borderRadius: 4,
                padding: '3px 12px',
                fontSize: 11,
                cursor: 'pointer',
                fontWeight: 600,
                flexShrink: 0,
                transition: 'background 0.2s, color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#42d4f4';
                e.currentTarget.style.color = '#0f3460';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#42d4f4';
              }}
            >
              Switch
            </button>
          )}
        </div>
      )}

      {/* ----- Scrollable content ------------------------------------------- */}
      {sidebarOpen && (
        <div
          className="sidebar-content"
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
          }}
        >
          {/* Basemap switcher */}
          <section
            className="sidebar-section sidebar-section--basemap"
            style={{ padding: '8px 10px', borderBottom: '1px solid #2d2d44' }}
          >
            <div
              style={{
                display: 'flex',
                gap: 4,
                flexWrap: 'wrap',
              }}
            >
              {(Object.keys(BASEMAPS) as BasemapKey[]).map((key) => (
                <button
                  key={key}
                  className={`basemap-btn ${basemap === key ? 'basemap-btn--active' : ''}`}
                  onClick={() => handleBasemapChange(key)}
                  style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 3,
                    border: '1px solid #444',
                    background: basemap === key ? '#3a86ff' : '#2d2d44',
                    color: basemap === key ? '#fff' : '#bbb',
                    cursor: 'pointer',
                  }}
                >
                  {BASEMAPS[key].label}
                </button>
              ))}
            </div>
          </section>

          {/* Layers panel */}
          <section
            className="sidebar-section sidebar-section--layers"
            style={{ padding: '8px 10px', borderBottom: '1px solid #2d2d44' }}
          >
            <h4
              style={{
                margin: '0 0 6px 0',
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                color: '#888',
              }}
            >
              Layers
            </h4>
            <LayerPanel mapRef={mapRef} />
          </section>

          {/* Filters panel */}
          <section
            className="sidebar-section sidebar-section--filters"
            style={{ padding: '8px 10px', borderBottom: '1px solid #2d2d44' }}
          >
            <h4
              style={{
                margin: '0 0 6px 0',
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                color: '#888',
              }}
            >
              Filters
            </h4>
            <FilterPanel mapRef={mapRef} />
          </section>

          {/* Symbology panel */}
          <section
            className="sidebar-section sidebar-section--symbology"
            style={{ padding: '8px 10px', borderBottom: '1px solid #2d2d44' }}
          >
            <h4
              style={{
                margin: '0 0 6px 0',
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                color: '#888',
              }}
            >
              Symbology
            </h4>
            <SymbologyPanel mapRef={mapRef} />
          </section>

          {/* Legend panel */}
          <section
            className="sidebar-section sidebar-section--legend"
            style={{ padding: '8px 10px', borderBottom: '1px solid #2d2d44' }}
          >
            <h4
              style={{
                margin: '0 0 6px 0',
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                color: '#888',
              }}
            >
              Legend
            </h4>
            <LegendPanel />
          </section>

          {/* Bookmarks panel */}
          <section
            className="sidebar-section sidebar-section--bookmarks"
            style={{ padding: '8px 10px' }}
          >
            <h4
              style={{
                margin: '0 0 6px 0',
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                color: '#888',
              }}
            >
              Bookmarks
            </h4>
            <BookmarkPanel mapRef={mapRef} />
          </section>
        </div>
      )}

      {/* ----- Drag handle (right edge) -------------------------------------- */}
      {sidebarOpen && (
        <div
          className="sidebar-resize-handle"
          onMouseDown={onMouseDown}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            height: '100%',
            cursor: 'col-resize',
            zIndex: 10,
            borderRadius: '0 2px 2px 0',
          }}
          title="Drag to resize sidebar"
          aria-hidden="true"
        />
      )}

      {/* ----- Share Modal --------------------------------------------------- */}
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
      />
    </div>
  );
}

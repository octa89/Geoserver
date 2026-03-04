/**
 * BookmarkPanel — manage map position bookmarks.
 *
 * - "Save Bookmark" button opens an inline text input for the bookmark name.
 * - Saved bookmarks are listed with a "Go" button (flies the map to the
 *   bookmark's center/zoom) and a "Delete" button.
 * - State is managed via the Zustand store (addBookmark / removeBookmark).
 */

import { useState, useCallback, type RefObject } from 'react';
import type L from 'leaflet';
import { useStore } from '../../store';
import type { Bookmark } from '../../types/layer';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BookmarkPanelProps {
  mapRef: RefObject<L.Map | null>;
}

// ---------------------------------------------------------------------------
// Styles (inline, dark theme)
// ---------------------------------------------------------------------------

const BTN_BASE: React.CSSProperties = {
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 8px',
  lineHeight: 1.4,
};

const BTN_PRIMARY: React.CSSProperties = {
  ...BTN_BASE,
  background: '#42d4f4',
  color: '#1a1a2e',
};

const BTN_DANGER: React.CSSProperties = {
  ...BTN_BASE,
  background: 'transparent',
  color: '#e94560',
  border: '1px solid #e94560',
  padding: '2px 6px',
};

const BTN_GO: React.CSSProperties = {
  ...BTN_BASE,
  background: '#2d2d44',
  color: '#42d4f4',
  border: '1px solid #42d4f4',
  padding: '2px 8px',
};

const INPUT_STYLE: React.CSSProperties = {
  background: '#12122a',
  border: '1px solid #42d4f4',
  borderRadius: 3,
  color: '#e0e0e0',
  fontSize: 11,
  padding: '4px 6px',
  flex: 1,
  outline: 'none',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BookmarkPanel({ mapRef }: BookmarkPanelProps) {
  const bookmarks = useStore((s) => s.bookmarks);
  const addBookmark = useStore((s) => s.addBookmark);
  const removeBookmark = useStore((s) => s.removeBookmark);
  const center = useStore((s) => s.center);
  const zoom = useStore((s) => s.zoom);

  const [isAdding, setIsAdding] = useState(false);
  const [bookmarkName, setBookmarkName] = useState('');

  // ---- Save ----------------------------------------------------------------

  const handleSaveClick = useCallback(() => {
    setIsAdding(true);
    setBookmarkName('');
  }, []);

  const handleConfirmSave = useCallback(() => {
    const name = bookmarkName.trim();
    if (!name) return;

    const bookmark: Bookmark = {
      id: Date.now().toString(36),
      name,
      center,
      zoom,
    };

    addBookmark(bookmark);
    setIsAdding(false);
    setBookmarkName('');
  }, [bookmarkName, center, zoom, addBookmark]);

  const handleCancelSave = useCallback(() => {
    setIsAdding(false);
    setBookmarkName('');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleConfirmSave();
      if (e.key === 'Escape') handleCancelSave();
    },
    [handleConfirmSave, handleCancelSave]
  );

  // ---- Go ------------------------------------------------------------------

  const handleGo = useCallback(
    (bookmark: Bookmark) => {
      const map = mapRef.current;
      if (!map) return;
      map.flyTo(bookmark.center, bookmark.zoom, { duration: 1.2 });
    },
    [mapRef]
  );

  // ---- Delete --------------------------------------------------------------

  const handleDelete = useCallback(
    (id: string) => {
      removeBookmark(id);
    },
    [removeBookmark]
  );

  // ---- Render --------------------------------------------------------------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Save bookmark button / inline input */}
      {!isAdding ? (
        <button style={BTN_PRIMARY} onClick={handleSaveClick}>
          + Save Bookmark
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            autoFocus
            type="text"
            placeholder="Bookmark name..."
            value={bookmarkName}
            onChange={(e) => setBookmarkName(e.target.value)}
            onKeyDown={handleKeyDown}
            style={INPUT_STYLE}
            maxLength={80}
          />
          <button
            style={{ ...BTN_BASE, background: '#42d4f4', color: '#1a1a2e', padding: '4px 8px' }}
            onClick={handleConfirmSave}
            title="Save"
          >
            Save
          </button>
          <button
            style={{ ...BTN_BASE, background: 'transparent', color: '#888', padding: '4px 6px' }}
            onClick={handleCancelSave}
            title="Cancel"
          >
            x
          </button>
        </div>
      )}

      {/* Bookmark list */}
      {bookmarks.length === 0 ? (
        <p style={{ fontSize: 11, color: '#555', margin: 0 }}>No bookmarks saved yet.</p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {bookmarks.map((bm) => (
            <li
              key={bm.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 6px',
                background: '#12122a',
                borderRadius: 4,
                border: '1px solid #2d2d44',
              }}
            >
              {/* Name */}
              <span
                style={{
                  flex: 1,
                  fontSize: 11,
                  color: '#e0e0e0',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={bm.name}
              >
                {bm.name}
              </span>

              {/* Go button */}
              <button style={BTN_GO} onClick={() => handleGo(bm)} title="Fly to bookmark">
                Go
              </button>

              {/* Delete button */}
              <button
                style={BTN_DANGER}
                onClick={() => handleDelete(bm.id)}
                title="Delete bookmark"
              >
                x
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

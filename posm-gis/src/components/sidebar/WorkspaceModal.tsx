import { useState, useEffect, useCallback } from 'react';
import { discoverAllWorkspaces } from '../../lib/geoserver';

interface WorkspaceModalProps {
  isOpen: boolean;
  onSelect: (workspaces: string[]) => void;
  /** Pre-filtered list of workspaces the user has access to, or null for admin (discover all). */
  userWorkspaces: string[] | null;
  /** If provided, the modal can be cancelled (e.g. when switching workspace). */
  onCancel?: () => void;
}

/**
 * Modal dialog for selecting which GeoServer workspace(s) to load.
 * - Admin users (__ALL__ access): discovers all workspaces from GeoServer, shows a dropdown
 * - Non-admin users with multiple workspaces: shows their assigned workspaces
 * - Users with a single workspace: this modal is never shown (auto-loads)
 */
export function WorkspaceModal({ isOpen, onSelect, userWorkspaces, onCancel }: WorkspaceModalProps) {
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState('');

  // Discover workspaces when the modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (userWorkspaces) {
      // Non-admin with multiple workspaces — just show the list
      setWorkspaces(userWorkspaces);
      setSelected(userWorkspaces[0] ?? '');
      return;
    }

    // Admin: discover all workspaces from GeoServer
    setDiscovering(true);
    setError('');
    discoverAllWorkspaces()
      .then((ws) => {
        if (ws.length === 0) {
          setError('No workspaces found on GeoServer.');
        }
        setWorkspaces(ws);
        setSelected(ws[0] ?? '');
      })
      .catch((err) => {
        console.error('Workspace discovery failed:', err);
        setError('Failed to discover workspaces from GeoServer.');
      })
      .finally(() => setDiscovering(false));
  }, [isOpen, userWorkspaces]);

  const handleLoadSelected = useCallback(() => {
    if (selected) {
      onSelect([selected]);
    }
  }, [selected, onSelect]);

  const handleLoadAll = useCallback(() => {
    if (workspaces.length > 0) {
      onSelect(workspaces);
    }
  }, [workspaces, onSelect]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onCancel) {
          onCancel();
        } else if (workspaces.length > 0) {
          handleLoadSelected();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, workspaces, handleLoadSelected, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onCancel ? () => onCancel() : undefined}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        cursor: onCancel ? 'pointer' : 'default',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a1a2e',
          border: '1px solid rgba(66,212,244,0.3)',
          borderRadius: 12,
          padding: '32px 36px',
          width: 420,
          maxWidth: '90vw',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          cursor: 'default',
        }}
      >
        <h2 style={{
          color: '#42d4f4',
          fontSize: 22,
          fontWeight: 700,
          margin: '0 0 8px 0',
          textAlign: 'center',
        }}>
          Select Workspace
        </h2>
        <p style={{
          color: '#7f8fa6',
          fontSize: 13,
          margin: '0 0 20px 0',
          textAlign: 'center',
        }}>
          Choose a workspace to load, or load all layers.
        </p>

        {discovering && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{
              width: 30, height: 30,
              border: '3px solid rgba(66,212,244,0.3)',
              borderTopColor: '#42d4f4',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 8px',
            }} />
            <span style={{ color: '#888', fontSize: 13 }}>Discovering workspaces...</span>
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(233,69,96,0.15)',
            border: '1px solid rgba(233,69,96,0.3)',
            color: '#e94560',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 13,
            textAlign: 'center',
            marginBottom: 12,
          }}>
            {error}
          </div>
        )}

        {!discovering && workspaces.length > 0 && (
          <>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              style={{
                width: '100%',
                background: '#0f3460',
                border: '1px solid rgba(66,212,244,0.3)',
                color: '#e0e0e0',
                borderRadius: 6,
                padding: '10px 14px',
                fontSize: 14,
                outline: 'none',
                marginBottom: 16,
                cursor: 'pointer',
              }}
            >
              {workspaces.map((ws) => (
                <option key={ws} value={ws}>{ws}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 10 }}>
              {onCancel && (
                <button
                  onClick={onCancel}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    color: '#888',
                    border: '1px solid #2d2d44',
                    borderRadius: 6,
                    padding: '10px 0',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleLoadAll}
                style={{
                  flex: 1,
                  background: '#0f3460',
                  color: '#42d4f4',
                  border: '1px solid rgba(66,212,244,0.3)',
                  borderRadius: 6,
                  padding: '10px 0',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Load All Workspaces
              </button>
              <button
                onClick={handleLoadSelected}
                style={{
                  flex: 1,
                  background: '#42d4f4',
                  color: '#0f3460',
                  border: 'none',
                  borderRadius: 6,
                  padding: '10px 0',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Load Selected
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

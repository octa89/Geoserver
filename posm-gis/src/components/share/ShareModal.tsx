import { useEffect, useRef, useState, useCallback } from 'react';
import { buildConfigObject } from '../../lib/configBuilder';
import { getCurrentUser } from '../../config/auth';
import { createShareLink } from '../../lib/api';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  isGuest?: boolean;
}

// ---------------------------------------------------------------------------
// ShareModal
// ---------------------------------------------------------------------------

/**
 * Modal overlay for sharing the current map view.
 *
 * Responsibilities:
 * - Lazily generate a share URL when the modal first opens.
 * - Display the URL in a read-only input.
 * - Provide Copy / Open / Email / WhatsApp / Teams actions.
 * - Close on X button, overlay click, or Escape key.
 */
export function ShareModal({ isOpen, onClose, isGuest }: ShareModalProps) {
  const [shareUrl, setShareUrl] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Generate share URL whenever the modal opens (skip for guests)
  useEffect(() => {
    if (!isOpen || isGuest) return;

    let cancelled = false;
    setCreating(true);
    setError(null);
    setCopied(false);

    const user = getCurrentUser();
    const { wsName, wsConfig } = buildConfigObject();

    createShareLink(user?.username ?? 'anonymous', wsName, wsConfig)
      .then((result) => {
        if (!cancelled) {
          setShareUrl(result.url);
          setCreating(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[ShareModal] createShareLink failed:', err);
          setError('Failed to create share link');
          setCreating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, isGuest]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the input text
      inputRef.current?.select();
    }
  }, [shareUrl]);

  // Open in new tab
  const handleOpenTab = useCallback(() => {
    if (shareUrl) window.open(shareUrl, '_blank', 'noopener,noreferrer');
  }, [shareUrl]);

  // Email share
  const handleEmail = useCallback(() => {
    if (!shareUrl) return;
    const subject = encodeURIComponent('POSM GIS — Shared Map View');
    const body = encodeURIComponent(
      `I wanted to share this map view with you:\n\n${shareUrl}`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  }, [shareUrl]);

  // WhatsApp share
  const handleWhatsApp = useCallback(() => {
    if (!shareUrl) return;
    const text = encodeURIComponent(`POSM GIS — Shared Map View: ${shareUrl}`);
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  }, [shareUrl]);

  // Microsoft Teams share
  const handleTeams = useCallback(() => {
    if (!shareUrl) return;
    const encodedUrl = encodeURIComponent(shareUrl);
    const preview = encodeURIComponent('POSM GIS — Shared Map View');
    window.open(
      `https://teams.microsoft.com/share?href=${encodedUrl}&msgText=${preview}`,
      '_blank',
      'noopener,noreferrer'
    );
  }, [shareUrl]);

  // Click on overlay closes the modal
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!isOpen) return null;

  // ---- Styles (inline to keep share-specific CSS self-contained) -----------

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  };

  const modalStyle: React.CSSProperties = {
    background: '#1a1a2e',
    border: '1px solid #42d4f4',
    borderRadius: 8,
    padding: '24px 28px',
    width: 480,
    maxWidth: '95vw',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    color: '#e0e0e0',
    fontFamily: "'Segoe UI', sans-serif",
  };

  const titleRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const closeBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 20,
    lineHeight: 1,
    padding: 0,
  };

  const inputRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    background: '#0a0a1a',
    border: '1px solid #42d4f4',
    borderRadius: 4,
    color: '#e0e0e0',
    fontSize: 12,
    padding: '6px 10px',
    outline: 'none',
    fontFamily: 'monospace',
  };

  const baseBtnStyle: React.CSSProperties = {
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 14px',
  };

  const copyBtnStyle: React.CSSProperties = {
    ...baseBtnStyle,
    background: copied ? '#2ecc71' : '#42d4f4',
    color: '#0a0a1a',
    transition: 'background 0.2s',
    minWidth: 72,
  };

  const actionsBtnStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
  };

  const actionBtnBase: React.CSSProperties = {
    ...baseBtnStyle,
    background: '#2d2d44',
    color: '#e0e0e0',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  };

  return (
    <div style={overlayStyle} onClick={handleOverlayClick} aria-modal="true" role="dialog">
      <div ref={modalRef} style={modalStyle}>
        {/* Header */}
        <div style={titleRowStyle}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#42d4f4', letterSpacing: 0.4 }}>
            Share Map View
          </span>
          <button
            style={closeBtnStyle}
            onClick={onClose}
            aria-label="Close share dialog"
            title="Close"
          >
            &times;
          </button>
        </div>

        {/* Guest restriction message */}
        {isGuest ? (
          <div style={{
            background: 'rgba(66,212,244,0.08)',
            border: '1px solid rgba(66,212,244,0.25)',
            borderRadius: 6,
            padding: '16px 18px',
            textAlign: 'center',
          }}>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: '#e0e0e0', fontWeight: 600 }}>
              Sign in required
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#999', lineHeight: 1.6 }}>
              You need to sign in as a registered user to share maps.
              Guest accounts have view-only access.
            </p>
          </div>
        ) : (
        <>
        {/* Description */}
        <p style={{ margin: 0, fontSize: 12, color: '#999', lineHeight: 1.5 }}>
          Anyone with this link can view the current map — layers, symbology, zoom
          level, and basemap are all captured in the snapshot.
        </p>

        {/* URL row */}
        {creating ? (
          <div style={{ textAlign: 'center', padding: 8, color: '#42d4f4', fontSize: 12 }}>
            Creating share link...
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 8, color: '#e74c3c', fontSize: 12 }}>
            {error}
          </div>
        ) : (
          <div style={inputRowStyle}>
            <input
              ref={inputRef}
              type="text"
              readOnly
              value={shareUrl}
              style={inputStyle}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Share URL"
            />
            <button style={copyBtnStyle} onClick={handleCopy} title="Copy to clipboard">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}

        {/* Action buttons */}
        {!creating && !error && (
          <div>
            <p style={{ margin: '0 0 8px 0', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Share via
            </p>
            <div style={actionsBtnStyle}>
              <button style={actionBtnBase} onClick={handleOpenTab} title="Open in new browser tab">
                <span style={{ fontSize: 14 }}>&#x1F517;</span>
                Open in New Tab
              </button>

              <button style={actionBtnBase} onClick={handleEmail} title="Share by email">
                <span style={{ fontSize: 14 }}>&#x2709;</span>
                Email
              </button>

              <button
                style={{ ...actionBtnBase, background: '#25D366', color: '#fff' }}
                onClick={handleWhatsApp}
                title="Share on WhatsApp"
              >
                <span style={{ fontSize: 14 }}>&#x1F4AC;</span>
                WhatsApp
              </button>

              <button
                style={{ ...actionBtnBase, background: '#6264A7', color: '#fff' }}
                onClick={handleTeams}
                title="Share on Microsoft Teams"
              >
                <span style={{ fontSize: 14 }}>&#x1F4BB;</span>
                Teams
              </button>
            </div>
          </div>
        )}

        {/* Footer note */}
        <p style={{ margin: 0, fontSize: 10, color: '#555' }}>
          Share links expire after 7 days.
        </p>
        </>
        )}
      </div>
    </div>
  );
}

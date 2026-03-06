/**
 * API abstraction layer for POSM GIS persistence.
 *
 * Dev mode (VITE_DYNAMO_API_URL not set): uses localStorage for zero-dependency local dev.
 * Prod mode (VITE_DYNAMO_API_URL set): calls HTTP API Gateway → Lambda → DynamoDB.
 */

import type { WorkspaceConfig } from '../types/session';
import type { ShareSnapshot } from '../types/share';

// Inline types to avoid circular dependency with auth.ts
interface AppUser {
  username: string;
  displayName: string;
  city: string;
  groups: string[];
  role: 'admin' | 'user';
}

interface AppGroup {
  id: string;
  label: string;
  workspaces: string[];
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DYNAMO_API_URL = import.meta.env.VITE_DYNAMO_API_URL || '';
const USE_REMOTE = !!DYNAMO_API_URL;
const API_BASE = DYNAMO_API_URL || (import.meta.env.VITE_API_URL || '/api');

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

/**
 * Save a workspace config for a user.
 * Dev: localStorage. Prod: POST /api/config.
 */
export async function saveConfig(
  username: string,
  workspace: string,
  config: WorkspaceConfig
): Promise<void> {
  if (!USE_REMOTE) {
    try {
      localStorage.setItem(
        `posm_session_${username}_${workspace}`,
        JSON.stringify(config)
      );
    } catch (err) {
      console.warn('[api] localStorage write failed:', err);
    }
    return;
  }

  const resp = await fetch(`${API_BASE}/api/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, workspace, config }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    console.warn('[api] saveConfig failed:', resp.status, detail);
    throw new Error(`saveConfig HTTP ${resp.status}: ${detail}`);
  }
}

/**
 * Load a workspace config for a user.
 * Dev: localStorage. Prod: GET /api/config?username=X&workspace=Y.
 */
export async function loadConfig(
  username: string,
  workspace: string
): Promise<WorkspaceConfig | null> {
  if (!USE_REMOTE) {
    try {
      const raw = localStorage.getItem(
        `posm_session_${username}_${workspace}`
      );
      if (!raw) return null;
      return JSON.parse(raw) as WorkspaceConfig;
    } catch (err) {
      console.warn('[api] localStorage read failed:', err);
      return null;
    }
  }

  try {
    const resp = await fetch(
      `${API_BASE}/api/config?username=${encodeURIComponent(username)}&workspace=${encodeURIComponent(workspace)}`
    );
    if (!resp.ok) return null;
    return (await resp.json()) as WorkspaceConfig;
  } catch (err) {
    console.warn('[api] loadConfig failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Share system
// ---------------------------------------------------------------------------

/**
 * Create a share link for the current map view.
 * Dev: localStorage. Prod: POST /api/share.
 */
export async function createShareLink(
  username: string,
  wsName: string,
  wsConfig: WorkspaceConfig
): Promise<{ id: string; url: string }> {
  if (!USE_REMOTE) {
    const shareId = Math.random().toString(36).substring(2, 10);
    const snapshot: ShareSnapshot = {
      wsName,
      wsConfig,
      created_at: new Date().toISOString(),
    };
    localStorage.setItem(`posm_share_${shareId}`, JSON.stringify(snapshot));
    return { id: shareId, url: `${window.location.origin}/share/${shareId}` };
  }

  const resp = await fetch(`${API_BASE}/api/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, wsName, wsConfig }),
  });

  if (!resp.ok) {
    throw new Error(`createShareLink failed: ${resp.status}`);
  }

  const data = await resp.json();
  return {
    id: data.id,
    url: `${window.location.origin}/share/${data.id}`,
  };
}

/**
 * Load a share snapshot by ID.
 * Dev: localStorage. Prod: GET /api/share/{shareId}.
 */
export async function loadShareSnapshot(
  shareId: string
): Promise<ShareSnapshot | null> {
  if (!USE_REMOTE) {
    try {
      const raw = localStorage.getItem(`posm_share_${shareId}`);
      if (!raw) return null;
      return JSON.parse(raw) as ShareSnapshot;
    } catch {
      return null;
    }
  }

  try {
    const resp = await fetch(`${API_BASE}/api/share/${encodeURIComponent(shareId)}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    return {
      wsName: data.wsName,
      wsConfig: data.wsConfig,
      created_at: data.createdAt,
    };
  } catch (err) {
    console.warn('[api] loadShareSnapshot failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auth persistence
// ---------------------------------------------------------------------------

export { USE_REMOTE };

/**
 * Load users and groups.
 * Dev: localStorage. Prod: GET /api/auth/data.
 */
export async function loadAuthData(): Promise<{ users: AppUser[]; groups: AppGroup[] }> {
  if (!USE_REMOTE) {
    const users = JSON.parse(localStorage.getItem('posm_users') || '[]');
    const groups = JSON.parse(localStorage.getItem('posm_groups') || '[]');
    return { users, groups };
  }

  try {
    const resp = await fetch(`${API_BASE}/api/auth/data`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.warn('[api] loadAuthData failed:', err);
    // Fallback to localStorage cache
    const users = JSON.parse(localStorage.getItem('posm_users') || '[]');
    const groups = JSON.parse(localStorage.getItem('posm_groups') || '[]');
    return { users, groups };
  }
}

/**
 * Save users, groups, and/or passwords.
 * Dev: localStorage. Prod: POST /api/auth/data.
 */
export async function saveAuthData(payload: {
  users?: AppUser[];
  groups?: AppGroup[];
  passwords?: Record<string, string>;
}): Promise<void> {
  if (!USE_REMOTE) {
    if (payload.users) localStorage.setItem('posm_users', JSON.stringify(payload.users));
    if (payload.groups) localStorage.setItem('posm_groups', JSON.stringify(payload.groups));
    if (payload.passwords) localStorage.setItem('posm_passwords', JSON.stringify(payload.passwords));
    return;
  }

  const resp = await fetch(`${API_BASE}/api/auth/data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    console.warn('[api] saveAuthData failed:', resp.status, detail);
    throw new Error(`saveAuthData HTTP ${resp.status}`);
  }
}

/**
 * Validate login credentials server-side.
 * Dev: not used. Prod: POST /api/auth/login.
 */
export async function remoteLogin(
  username: string,
  passwordHash: string
): Promise<AppUser | null> {
  try {
    const resp = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, passwordHash }),
    });

    if (resp.status === 401) return null;
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    return data.user as AppUser;
  } catch (err) {
    console.warn('[api] remoteLogin failed:', err);
    return null;
  }
}

/**
 * Seed default admin in DynamoDB if empty.
 * Dev: no-op. Prod: POST /api/auth/init.
 */
export async function initAuthRemote(defaultPasswordHash: string): Promise<void> {
  if (!USE_REMOTE) return;

  try {
    await fetch(`${API_BASE}/api/auth/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultPasswordHash }),
    });
  } catch (err) {
    console.warn('[api] initAuthRemote failed:', err);
  }
}

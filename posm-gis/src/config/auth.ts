/**
 * Auth system with dual-mode persistence:
 * - Dev (no VITE_DYNAMO_API_URL): localStorage only
 * - Prod (VITE_DYNAMO_API_URL set): DynamoDB via Lambda, localStorage as cache
 *
 * Sessions (current logged-in user) always use sessionStorage.
 */

import {
  USE_REMOTE,
  loadAuthData,
  saveAuthData,
  remoteLogin,
  initAuthRemote,
} from '../lib/api';

export interface AppUser {
  username: string;
  displayName: string;
  city: string;
  groups: string[];
  role: 'admin' | 'user';
}

export interface AppGroup {
  id: string;
  label: string;
  workspaces: string[];  // ['__ALL__'] means all workspaces
}

const USERS_KEY = 'posm_users';
const GROUPS_KEY = 'posm_groups';
const SESSION_KEY = 'posm_current_user';
const WORKSPACE_KEY = 'posm_selected_workspace';
const PASSWORD_STORE_KEY = 'posm_passwords';

// ---- Default data ----
const DEFAULT_USERS: AppUser[] = [
  {
    username: 'admin',
    displayName: 'Administrator',
    city: '',
    groups: ['all_access'],
    role: 'admin',
  },
];

const DEFAULT_GROUPS: AppGroup[] = [
  {
    id: 'all_access',
    label: 'Full Access',
    workspaces: ['__ALL__'],
  },
];

const DEFAULT_PASSWORD = 'POSMRocksGISCentral2026';

// ---- Password utilities ----

function getPasswordStore(): Record<string, string> {
  const raw = localStorage.getItem(PASSWORD_STORE_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch { /* ignore */ }
  }
  return {};
}

function setPasswordStore(store: Record<string, string>) {
  localStorage.setItem(PASSWORD_STORE_KEY, JSON.stringify(store));
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Set (or update) a stored password hash for a user. */
export async function setUserPassword(username: string, password: string): Promise<void> {
  const store = getPasswordStore();
  store[username] = await hashPassword(password);
  setPasswordStore(store);

  if (USE_REMOTE) {
    try { await saveAuthData({ passwords: store }); } catch (e) {
      console.warn('[auth] Remote password sync failed:', e);
    }
  }
}

/** Remove the stored password hash for a user. */
export async function removeUserPassword(username: string): Promise<void> {
  const store = getPasswordStore();
  delete store[username];
  setPasswordStore(store);

  if (USE_REMOTE) {
    try { await saveAuthData({ passwords: store }); } catch (e) {
      console.warn('[auth] Remote password sync failed:', e);
    }
  }
}

// ---- Initialize ----

export async function initAuth() {
  const defaultHash = await hashPassword(DEFAULT_PASSWORD);

  // Always seed localStorage with defaults if empty (works offline / before Lambda deploy)
  if (!localStorage.getItem(USERS_KEY)) {
    localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
  }
  if (!localStorage.getItem(GROUPS_KEY)) {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(DEFAULT_GROUPS));
  }
  const passwords = getPasswordStore();
  if (!passwords['admin']) {
    passwords['admin'] = defaultHash;
    setPasswordStore(passwords);
  }

  // In remote mode, also sync with DynamoDB (non-blocking — falls back to localStorage on failure)
  if (USE_REMOTE) {
    try {
      await initAuthRemote(defaultHash);
      const { users, groups } = await loadAuthData();
      if (users.length > 0) {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
      }
      if (groups.length > 0) {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
      }
    } catch (err) {
      console.warn('[auth] Remote auth sync failed, using localStorage:', err);
    }
  }
}

// ---- User CRUD ----

export function getUsers(): AppUser[] {
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) return DEFAULT_USERS;
  try { return JSON.parse(raw); } catch { return DEFAULT_USERS; }
}

export async function setUsers(users: AppUser[]): Promise<void> {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  if (USE_REMOTE) {
    try { await saveAuthData({ users }); } catch (e) {
      console.warn('[auth] Remote users sync failed:', e);
    }
  }
}

export function getGroups(): AppGroup[] {
  const raw = localStorage.getItem(GROUPS_KEY);
  if (!raw) return DEFAULT_GROUPS;
  try { return JSON.parse(raw); } catch { return DEFAULT_GROUPS; }
}

export async function setGroups(groups: AppGroup[]): Promise<void> {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  if (USE_REMOTE) {
    try { await saveAuthData({ groups }); } catch (e) {
      console.warn('[auth] Remote groups sync failed:', e);
    }
  }
}

// ---- Login / Logout ----

export async function login(username: string, password: string): Promise<AppUser | null> {
  const inputHash = await hashPassword(password);

  // Try remote login first if available
  if (USE_REMOTE) {
    try {
      const user = await remoteLogin(username, inputHash);
      if (user) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
        return user;
      }
      // remoteLogin returned null — could be bad credentials OR endpoint not deployed.
      // Fall through to local validation as fallback.
    } catch {
      console.warn('[auth] Remote login failed, falling back to local validation');
    }
  }

  // Local validation (primary in dev, fallback in prod if Lambda not deployed)
  const users = getUsers();
  const user = users.find(u => u.username === username);
  if (!user) return null;

  const passwords = getPasswordStore();
  const storedHash = passwords[username];
  if (!storedHash) return null;
  if (inputHash !== storedHash) return null;

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(WORKSPACE_KEY);
}

export function getCurrentUser(): AppUser | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ---- Workspaces ----

export function getUserWorkspaces(user: AppUser): string[] {
  const groups = getGroups();
  const userGroups = groups.filter(g => user.groups.includes(g.id));
  const workspaces = new Set<string>();
  for (const g of userGroups) {
    if (g.workspaces.includes('__ALL__')) return ['__ALL__'];
    g.workspaces.forEach(w => workspaces.add(w));
  }
  return Array.from(workspaces);
}

export function getSelectedWorkspace(): string | null {
  return sessionStorage.getItem(WORKSPACE_KEY);
}

export function setSelectedWorkspace(ws: string) {
  sessionStorage.setItem(WORKSPACE_KEY, ws);
}

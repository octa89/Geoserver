/**
 * Local auth system for development.
 * In production this will be replaced by AWS Cognito via Amplify Auth.
 *
 * For now: stores users in localStorage, sessions in sessionStorage.
 */

export interface AppUser {
  username: string;
  displayName: string;
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

// ---- Default admin user (password checked client-side for dev) ----
const DEFAULT_USERS: AppUser[] = [
  {
    username: 'admin',
    displayName: 'Administrator',
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

// Hashed passwords (SHA-256 hex). For dev only — Cognito handles this in production.
const PASSWORD_STORE_KEY = 'posm_passwords';

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

/** Set (or update) a stored password hash for a user. Used by AdminPage. */
export async function setUserPassword(username: string, password: string): Promise<void> {
  const store = getPasswordStore();
  store[username] = await hashPassword(password);
  setPasswordStore(store);
}

/** Remove the stored password hash for a user. Used by AdminPage on delete. */
export function removeUserPassword(username: string): void {
  const store = getPasswordStore();
  delete store[username];
  setPasswordStore(store);
}

// ---- Initialize defaults ----
export async function initAuth() {
  if (!localStorage.getItem(USERS_KEY)) {
    localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
  }
  if (!localStorage.getItem(GROUPS_KEY)) {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(DEFAULT_GROUPS));
  }
  // Set default admin password if not already set
  const passwords = getPasswordStore();
  if (!passwords['admin']) {
    passwords['admin'] = await hashPassword('POSMRocksGISCentral2026');
    setPasswordStore(passwords);
  }
}

// ---- User CRUD ----
export function getUsers(): AppUser[] {
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) return DEFAULT_USERS;
  try { return JSON.parse(raw); } catch { return DEFAULT_USERS; }
}

export function setUsers(users: AppUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function getGroups(): AppGroup[] {
  const raw = localStorage.getItem(GROUPS_KEY);
  if (!raw) return DEFAULT_GROUPS;
  try { return JSON.parse(raw); } catch { return DEFAULT_GROUPS; }
}

export function setGroups(groups: AppGroup[]) {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
}

// ---- Login / Logout ----
export async function login(username: string, password: string): Promise<AppUser | null> {
  const users = getUsers();
  const user = users.find(u => u.username === username);
  if (!user) return null;

  const passwords = getPasswordStore();
  const storedHash = passwords[username];
  if (!storedHash) return null;

  const inputHash = await hashPassword(password);
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

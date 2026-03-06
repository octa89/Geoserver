import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getUsers,
  setUsers,
  getGroups,
  setGroups,
  getCurrentUser,
  login,
  logout,
  setUserPassword,
  removeUserPassword,
} from '../config/auth';
import type { AppUser, AppGroup } from '../config/auth';
import { discoverAllWorkspaces } from '../lib/geoserver';

// ---- Style constants ----
const BG_MAIN = '#0a0a1a';
const BG_CARD = '#1a1a2e';
const BG_ROW_ALT = '#16213e';
const ACCENT = '#42d4f4';
const DANGER = '#e94560';
const TEXT_PRIMARY = '#e0e0e0';
const TEXT_MUTED = '#8888a0';
const BORDER = '#2a2a4a';

const inputStyle: React.CSSProperties = {
  background: '#0d0d1f',
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: TEXT_PRIMARY,
  padding: '7px 10px',
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const btnStyle = (variant: 'primary' | 'danger' | 'ghost' = 'primary'): React.CSSProperties => ({
  padding: '6px 14px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  background:
    variant === 'primary' ? ACCENT :
    variant === 'danger'  ? DANGER :
    'transparent',
  color:
    variant === 'ghost' ? TEXT_MUTED : '#0a0a1a',
  transition: 'opacity 0.15s',
});

const thStyle: React.CSSProperties = {
  padding: '9px 12px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 700,
  color: TEXT_MUTED,
  borderBottom: `1px solid ${BORDER}`,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle = (alt: boolean): React.CSSProperties => ({
  padding: '9px 12px',
  fontSize: 13,
  color: TEXT_PRIMARY,
  background: alt ? BG_ROW_ALT : 'transparent',
  verticalAlign: 'middle',
});

// ---- Blank form shapes ----
const blankUser = (): Omit<AppUser, 'username'> & { username: string; password: string } => ({
  username: '',
  displayName: '',
  city: '',
  password: '',
  groups: [],
  role: 'user',
});

// ================================================================
// USERS SECTION
// ================================================================

interface UserFormState {
  username: string;
  displayName: string;
  city: string;
  password: string;
  groups: string[];
  role: 'admin' | 'user';
}

interface UsersSectionProps {
  currentUsername: string;
  allGroups: AppGroup[];
}

function UsersSection({ currentUsername, allGroups }: UsersSectionProps) {
  const [users, setLocalUsers] = useState<AppUser[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUsername, setEditingUsername] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormState>({ ...blankUser() });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const refresh = useCallback(() => setLocalUsers(getUsers()), []);

  useEffect(() => { refresh(); }, [refresh]);

  function openAdd() {
    setEditingUsername(null);
    setForm({ ...blankUser() });
    setError('');
    setShowAddForm(true);
  }

  function openEdit(user: AppUser) {
    setShowAddForm(false);
    setEditingUsername(user.username);
    setForm({
      username: user.username,
      displayName: user.displayName,
      city: user.city ?? '',
      password: '',
      groups: [...user.groups],
      role: user.role,
    });
    setError('');
  }

  function cancelForm() {
    setShowAddForm(false);
    setEditingUsername(null);
    setForm({ ...blankUser() });
    setError('');
  }

  function toggleGroup(groupId: string) {
    setForm(prev => ({
      ...prev,
      groups: prev.groups.includes(groupId)
        ? prev.groups.filter(g => g !== groupId)
        : [...prev.groups, groupId],
    }));
  }

  async function handleSave() {
    setError('');
    if (!form.username.trim()) { setError('Username is required.'); return; }
    if (!form.displayName.trim()) { setError('Display name is required.'); return; }

    const isAdding = !editingUsername;
    if (isAdding && !form.password) { setError('Password is required for new users.'); return; }

    const existingUsers = getUsers();

    if (isAdding && existingUsers.some(u => u.username === form.username.trim())) {
      setError('Username already exists.');
      return;
    }

    setSaving(true);
    try {
      const updatedUser: AppUser = {
        username: form.username.trim(),
        displayName: form.displayName.trim(),
        city: form.city.trim(),
        groups: form.groups,
        role: form.role,
      };

      if (isAdding) {
        await setUserPassword(updatedUser.username, form.password);
        await setUsers([...existingUsers, updatedUser]);
      } else {
        // editing
        const updated = existingUsers.map(u =>
          u.username === editingUsername ? updatedUser : u
        );
        if (form.password) {
          await setUserPassword(updatedUser.username, form.password);
        }
        await setUsers(updated);
      }

      refresh();
      cancelForm();
    } catch (e) {
      setError('Failed to save user.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(username: string) {
    if (username === currentUsername) return; // should not be reachable
    const updated = getUsers().filter(u => u.username !== username);
    await removeUserPassword(username);
    await setUsers(updated);
    refresh();
    setConfirmDelete(null);
  }

  const isFormOpen = showAddForm || editingUsername !== null;

  return (
    <div style={{ background: BG_CARD, borderRadius: 10, padding: 20, border: `1px solid ${BORDER}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, color: ACCENT, fontWeight: 700, letterSpacing: '0.04em' }}>
          Users
        </h2>
        {!isFormOpen && (
          <button style={btnStyle('primary')} onClick={openAdd}>+ Add User</button>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Username</th>
              <th style={thStyle}>Display Name</th>
              <th style={thStyle}>City/Customer</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Groups</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const isEditing = editingUsername === u.username;
              return (
                <tr key={u.username}>
                  <td style={tdStyle(i % 2 === 1)}>
                    <span style={{ fontFamily: 'monospace', color: isEditing ? ACCENT : TEXT_PRIMARY }}>
                      {u.username}
                    </span>
                    {u.username === currentUsername && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: ACCENT, background: '#0d2233', borderRadius: 4, padding: '1px 5px' }}>you</span>
                    )}
                  </td>
                  <td style={tdStyle(i % 2 === 1)}>{u.displayName}</td>
                  <td style={tdStyle(i % 2 === 1)}>
                    <span style={{ fontSize: 12, color: TEXT_MUTED }}>{u.city || '—'}</span>
                  </td>
                  <td style={tdStyle(i % 2 === 1)}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: u.role === 'admin' ? '#1a0d2e' : '#0d1a2e',
                      color: u.role === 'admin' ? '#c084fc' : ACCENT,
                      border: `1px solid ${u.role === 'admin' ? '#4a2070' : BORDER}`,
                    }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={tdStyle(i % 2 === 1)}>
                    <span style={{ fontSize: 12, color: TEXT_MUTED }}>{u.groups.join(', ') || '—'}</span>
                  </td>
                  <td style={tdStyle(i % 2 === 1)}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        style={{ ...btnStyle('ghost'), fontSize: 12, padding: '4px 10px', border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }}
                        onClick={() => isEditing ? cancelForm() : openEdit(u)}
                      >
                        {isEditing ? 'Cancel' : 'Edit'}
                      </button>
                      {u.username !== currentUsername && (
                        confirmDelete === u.username ? (
                          <>
                            <button style={{ ...btnStyle('danger'), fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(u.username)}>
                              Confirm
                            </button>
                            <button style={{ ...btnStyle('ghost'), fontSize: 12, padding: '4px 10px' }} onClick={() => setConfirmDelete(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            style={{ ...btnStyle('danger'), fontSize: 12, padding: '4px 10px', opacity: 0.8 }}
                            onClick={() => setConfirmDelete(u.username)}
                          >
                            Delete
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Inline form for add or edit */}
      {isFormOpen && (
        <div style={{
          marginTop: 20,
          background: '#0d0d1f',
          border: `1px solid ${ACCENT}44`,
          borderRadius: 8,
          padding: 18,
        }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, color: ACCENT }}>
            {showAddForm ? 'Add New User' : `Edit: ${editingUsername}`}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: TEXT_MUTED }}>Username *</span>
              <input
                style={inputStyle}
                value={form.username}
                readOnly={!showAddForm}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                placeholder="e.g. jsmith"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: TEXT_MUTED }}>Display Name *</span>
              <input
                style={inputStyle}
                value={form.displayName}
                onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))}
                placeholder="e.g. John Smith"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: TEXT_MUTED }}>City/Customer</span>
              <input
                style={inputStyle}
                value={form.city}
                onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                placeholder="e.g. Miami"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: TEXT_MUTED }}>
                Password {showAddForm ? '*' : '(leave blank to keep current)'}
              </span>
              <input
                style={inputStyle}
                type="password"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder={showAddForm ? 'New password' : 'New password (optional)'}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: TEXT_MUTED }}>Role *</span>
              <select
                style={inputStyle}
                value={form.role}
                onChange={e => setForm(p => ({ ...p, role: e.target.value as 'admin' | 'user' }))}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </label>
          </div>

          {/* Groups checkboxes */}
          <div style={{ marginTop: 14 }}>
            <span style={{ fontSize: 12, color: TEXT_MUTED, display: 'block', marginBottom: 8 }}>Groups</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {allGroups.length === 0 && (
                <span style={{ fontSize: 12, color: TEXT_MUTED }}>No groups defined yet.</span>
              )}
              {allGroups.map(g => (
                <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: TEXT_PRIMARY }}>
                  <input
                    type="checkbox"
                    checked={form.groups.includes(g.id)}
                    onChange={() => toggleGroup(g.id)}
                    style={{ accentColor: ACCENT }}
                  />
                  <span>{g.label}</span>
                  <span style={{ fontSize: 11, color: TEXT_MUTED }}>({g.id})</span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ marginTop: 12, color: DANGER, fontSize: 13 }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button style={btnStyle('primary')} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save User'}
            </button>
            <button style={{ ...btnStyle('ghost'), border: `1px solid ${BORDER}` }} onClick={cancelForm}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// GROUPS SECTION
// ================================================================

interface GroupFormState {
  id: string;
  label: string;
  selectedWorkspaces: string[];
  allAccess: boolean;
}

const blankGroupForm = (): GroupFormState => ({
  id: '',
  label: '',
  selectedWorkspaces: [],
  allAccess: false,
});

function groupToForm(g: AppGroup): GroupFormState {
  const isAll = g.workspaces.includes('__ALL__');
  return {
    id: g.id,
    label: g.label,
    allAccess: isAll,
    selectedWorkspaces: isAll ? [] : [...g.workspaces],
  };
}

function GroupsSection() {
  const [groups, setLocalGroups] = useState<AppGroup[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<GroupFormState>(blankGroupForm());
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [availableWorkspaces, setAvailableWorkspaces] = useState<string[]>([]);
  const [wsLoading, setWsLoading] = useState(false);

  const refresh = useCallback(() => setLocalGroups(getGroups()), []);

  useEffect(() => { refresh(); }, [refresh]);

  // Fetch available workspaces from GeoServer
  useEffect(() => {
    setWsLoading(true);
    discoverAllWorkspaces()
      .then(ws => setAvailableWorkspaces(ws))
      .catch(() => setAvailableWorkspaces([]))
      .finally(() => setWsLoading(false));
  }, []);

  function openAdd() {
    setEditingId(null);
    setForm(blankGroupForm());
    setError('');
    setShowAddForm(true);
  }

  function openEdit(g: AppGroup) {
    setShowAddForm(false);
    setEditingId(g.id);
    setForm(groupToForm(g));
    setError('');
  }

  function cancelForm() {
    setShowAddForm(false);
    setEditingId(null);
    setForm(blankGroupForm());
    setError('');
  }

  async function handleSave() {
    setError('');
    if (!form.id.trim()) { setError('Group ID is required.'); return; }
    if (!form.label.trim()) { setError('Label is required.'); return; }

    const isAdding = !editingId;
    const existing = getGroups();

    if (isAdding && existing.some(g => g.id === form.id.trim())) {
      setError('Group ID already exists.');
      return;
    }

    const workspaces: string[] = form.allAccess
      ? ['__ALL__']
      : form.selectedWorkspaces;

    const updatedGroup: AppGroup = {
      id: form.id.trim(),
      label: form.label.trim(),
      workspaces,
    };

    if (isAdding) {
      await setGroups([...existing, updatedGroup]);
    } else {
      await setGroups(existing.map(g => g.id === editingId ? updatedGroup : g));
    }

    refresh();
    cancelForm();
  }

  async function handleDelete(id: string) {
    await setGroups(getGroups().filter(g => g.id !== id));
    refresh();
    setConfirmDelete(null);
  }

  const isFormOpen = showAddForm || editingId !== null;

  return (
    <div style={{ background: BG_CARD, borderRadius: 10, padding: 20, border: `1px solid ${BORDER}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, color: ACCENT, fontWeight: 700, letterSpacing: '0.04em' }}>
          Groups
        </h2>
        {!isFormOpen && (
          <button style={btnStyle('primary')} onClick={openAdd}>+ Add Group</button>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Label</th>
              <th style={thStyle}>Workspaces</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => {
              const isEditing = editingId === g.id;
              const wsDisplay = g.workspaces.includes('__ALL__')
                ? <span style={{ color: '#c084fc', fontWeight: 600, fontSize: 12 }}>ALL</span>
                : <span style={{ fontSize: 12, color: TEXT_MUTED }}>{g.workspaces.join(', ') || '—'}</span>;
              return (
                <tr key={g.id}>
                  <td style={tdStyle(i % 2 === 1)}>
                    <span style={{ fontFamily: 'monospace', color: isEditing ? ACCENT : TEXT_PRIMARY }}>{g.id}</span>
                  </td>
                  <td style={tdStyle(i % 2 === 1)}>{g.label}</td>
                  <td style={tdStyle(i % 2 === 1)}>{wsDisplay}</td>
                  <td style={tdStyle(i % 2 === 1)}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        style={{ ...btnStyle('ghost'), fontSize: 12, padding: '4px 10px', border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }}
                        onClick={() => isEditing ? cancelForm() : openEdit(g)}
                      >
                        {isEditing ? 'Cancel' : 'Edit'}
                      </button>
                      {confirmDelete === g.id ? (
                        <>
                          <button style={{ ...btnStyle('danger'), fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(g.id)}>
                            Confirm
                          </button>
                          <button style={{ ...btnStyle('ghost'), fontSize: 12, padding: '4px 10px' }} onClick={() => setConfirmDelete(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          style={{ ...btnStyle('danger'), fontSize: 12, padding: '4px 10px', opacity: 0.8 }}
                          onClick={() => setConfirmDelete(g.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Inline form */}
      {isFormOpen && (
        <div style={{
          marginTop: 20,
          background: '#0d0d1f',
          border: `1px solid ${ACCENT}44`,
          borderRadius: 8,
          padding: 18,
        }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, color: ACCENT }}>
            {showAddForm ? 'Add New Group' : `Edit: ${editingId}`}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: TEXT_MUTED }}>Group ID *</span>
              <input
                style={inputStyle}
                value={form.id}
                readOnly={!showAddForm}
                onChange={e => setForm(p => ({ ...p, id: e.target.value }))}
                placeholder="e.g. field_team"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: TEXT_MUTED }}>Label *</span>
              <input
                style={inputStyle}
                value={form.label}
                onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                placeholder="e.g. Field Team"
              />
            </label>
          </div>

          {/* Workspace selection */}
          <div style={{ marginTop: 14 }}>
            <span style={{ fontSize: 12, color: TEXT_MUTED, display: 'block', marginBottom: 8 }}>Workspaces</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10, fontSize: 13, color: TEXT_PRIMARY }}>
              <input
                type="checkbox"
                checked={form.allAccess}
                onChange={e => setForm(p => ({ ...p, allAccess: e.target.checked }))}
                style={{ accentColor: ACCENT }}
              />
              <span>__ALL__ (grant access to all workspaces)</span>
            </label>
            {!form.allAccess && (
              <div>
                {wsLoading ? (
                  <span style={{ fontSize: 12, color: TEXT_MUTED }}>Loading workspaces...</span>
                ) : availableWorkspaces.length === 0 ? (
                  <span style={{ fontSize: 12, color: TEXT_MUTED }}>No workspaces found on GeoServer.</span>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {availableWorkspaces.map(ws => (
                      <label key={ws} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: TEXT_PRIMARY }}>
                        <input
                          type="checkbox"
                          checked={form.selectedWorkspaces.includes(ws)}
                          onChange={() => setForm(p => ({
                            ...p,
                            selectedWorkspaces: p.selectedWorkspaces.includes(ws)
                              ? p.selectedWorkspaces.filter(w => w !== ws)
                              : [...p.selectedWorkspaces, ws],
                          }))}
                          style={{ accentColor: ACCENT }}
                        />
                        <span>{ws}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div style={{ marginTop: 12, color: DANGER, fontSize: 13 }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button style={btnStyle('primary')} onClick={handleSave}>Save Group</button>
            <button style={{ ...btnStyle('ghost'), border: `1px solid ${BORDER}` }} onClick={cancelForm}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// ADMIN PAGE (root)
// ================================================================

export function AdminPage() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState<AppUser | null>(() => {
    const cur = getCurrentUser();
    return cur && cur.role === 'admin' ? cur : null;
  });
  const [allGroups, setAllGroups] = useState<AppGroup[]>([]);

  // Admin login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Refresh group list so UsersSection always has the latest
  useEffect(() => {
    setAllGroups(getGroups());
  }, []);

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoggingIn(true);
    try {
      const user = await login(username, password);
      if (!user) {
        setError('Invalid username or password');
      } else if (user.role !== 'admin') {
        setError('Admin access required');
        logout();
      } else {
        setAdminUser(user);
      }
    } catch {
      setError('Login failed');
    } finally {
      setLoggingIn(false);
    }
  }

  function handleLogout() {
    logout();
    setAdminUser(null);
    navigate('/login', { replace: true });
  }

  // Show admin login gate if not authenticated as admin
  if (!adminUser) {
    return (
      <div style={{
        minHeight: '100vh',
        background: BG_MAIN,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
      }}>
        <div style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '36px 32px',
          width: 340,
        }}>
          <h2 style={{ color: ACCENT, margin: '0 0 4px', fontSize: 20, fontWeight: 800, letterSpacing: '0.04em' }}>
            Admin Login
          </h2>
          <p style={{ color: TEXT_MUTED, fontSize: 13, margin: '0 0 20px' }}>
            Sign in with an admin account to manage users
          </p>
          <form onSubmit={handleAdminLogin}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: TEXT_MUTED, marginBottom: 4 }}>Username</label>
              <input
                style={inputStyle}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Admin username"
                autoFocus
                required
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: TEXT_MUTED, marginBottom: 4 }}>Password</label>
              <input
                style={inputStyle}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
              />
            </div>
            {error && (
              <div style={{ color: DANGER, fontSize: 13, marginBottom: 12 }}>{error}</div>
            )}
            <button
              type="submit"
              disabled={loggingIn}
              style={{
                ...btnStyle('primary'),
                width: '100%',
                padding: '10px',
                fontSize: 14,
                opacity: loggingIn ? 0.6 : 1,
              }}
            >
              {loggingIn ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <button
            type="button"
            onClick={() => navigate('/login')}
            style={{
              ...btnStyle('ghost'),
              width: '100%',
              marginTop: 12,
              padding: '8px',
              color: TEXT_MUTED,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
            }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: BG_MAIN,
      fontFamily: "'Segoe UI', 'Inter', sans-serif",
      color: TEXT_PRIMARY,
    }}>
      {/* Header */}
      <header style={{
        background: BG_CARD,
        borderBottom: `1px solid ${BORDER}`,
        padding: '0 24px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: ACCENT, letterSpacing: '0.06em' }}>
            POSM GIS Admin
          </span>
          <span style={{ color: BORDER, fontSize: 18 }}>|</span>
          <button
            style={{ ...btnStyle('ghost'), fontSize: 13, color: TEXT_MUTED, padding: '4px 8px' }}
            onClick={() => navigate('/map')}
          >
            Back to Map
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: TEXT_MUTED }}>
            Signed in as <strong style={{ color: TEXT_PRIMARY }}>{adminUser.displayName}</strong>
          </span>
          <button style={{ ...btnStyle('danger'), opacity: 0.9 }} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Body */}
      <main style={{ padding: '28px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))',
          gap: 24,
          alignItems: 'start',
        }}>
          <UsersSection
            currentUsername={adminUser.username}
            allGroups={allGroups}
          />
          <GroupsSection />
        </div>
      </main>
    </div>
  );
}

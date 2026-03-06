import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../config/auth';
import type { AppUser } from '../config/auth';

interface LoginPageProps {
  onLogin: (user: AppUser) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(username, password);
      if (user) {
        onLogin(user);
        navigate('/map');
      } else {
        setError('Invalid username or password');
      }
    } catch {
      setError('Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>POSM GIS</h1>
          <p>Geographic Information System</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => navigate('/admin')}
          style={{
            marginTop: 16,
            width: '100%',
            background: 'transparent',
            border: '1px solid rgba(66,212,244,0.3)',
            borderRadius: 6,
            padding: '10px',
            fontSize: 13,
            color: '#7f8fa6',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#42d4f4';
            e.currentTarget.style.color = '#42d4f4';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(66,212,244,0.3)';
            e.currentTarget.style.color = '#7f8fa6';
          }}
        >
          Manage Users
        </button>
      </div>
    </div>
  );
}

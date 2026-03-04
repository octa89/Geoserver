import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { LoginPage } from './routes/LoginPage';
import { MapPage } from './routes/MapPage';
import { SharePage } from './routes/SharePage';
import { AdminPage } from './routes/AdminPage';
import { initAuth, getCurrentUser } from './config/auth';
import type { AppUser } from './config/auth';
import './App.css';

export default function App() {
  const [initialized, setInitialized] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);

  useEffect(() => {
    initAuth().then(() => {
      setUser(getCurrentUser());
      setInitialized(true);
    });
  }, []);

  if (!initialized) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0a0a1a', color: '#42d4f4',
        fontFamily: "'Segoe UI', sans-serif",
      }}>
        Initializing...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage onLogin={setUser} />} />
        <Route path="/share/:shareId" element={<SharePage />} />
        <Route
          path="/map"
          element={user ? <MapPage user={user} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/admin"
          element={
            user && user.role === 'admin'
              ? <AdminPage />
              : <Navigate to={user ? '/map' : '/login'} replace />
          }
        />
        <Route
          path="/"
          element={user ? <Navigate to="/map" replace /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

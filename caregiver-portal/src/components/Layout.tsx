import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="page">
      <nav className="nav">
        <div className="nav-inner">
          <Link to="/" className="nav-brand">
            Karuna
          </Link>

          <div className="nav-links">
            <Link
              to="/"
              className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
            >
              Dashboard
            </Link>

            <span className="text-muted" style={{ padding: '0 0.5rem' }}>|</span>

            <span className="text-muted">{user?.name}</span>

            <button
              className="btn btn-secondary btn-sm"
              onClick={handleLogout}
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main style={{ flex: 1 }}>
        {children}
      </main>

      <footer style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        Karuna Caregiver Portal
      </footer>
    </div>
  );
}

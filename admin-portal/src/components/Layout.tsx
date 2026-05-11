import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const navItems = [
    { path: '/', icon: '📊', label: 'Dashboard' },
    { path: '/users', icon: '👥', label: 'Users' },
    { path: '/circles', icon: '🔵', label: 'Care Circles' },
    { path: '/ai-usage', icon: '🤖', label: 'AI Usage' },
    { path: '/health-alerts', icon: '🏥', label: 'Health Alerts' },
    { path: '/medications', icon: '💊', label: 'Medications' },
    { path: '/feature-flags', icon: '🚩', label: 'Feature Flags' },
    { path: '/audit-logs', icon: '📜', label: 'Audit Logs' },
    { path: '/settings', icon: '⚙️', label: 'Settings' },
  ];

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">Karuna Admin</div>
          <div className="sidebar-subtitle">Management Portal</div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ position: 'absolute', bottom: '1rem', left: 0, right: 0, padding: '0 1rem' }}>
          <div style={{ padding: '1rem', background: 'var(--bg)', borderRadius: '8px', marginBottom: '0.75rem' }}>
            <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{admin?.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{admin?.role}</div>
          </div>
          <button onClick={handleLogout} className="btn btn-secondary" style={{ width: '100%' }}>
            Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}

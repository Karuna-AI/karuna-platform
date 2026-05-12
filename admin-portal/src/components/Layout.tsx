import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const perms = admin?.permissions ?? {};

  const navItems = [
    { path: '/', icon: '📊', label: 'Dashboard', visible: true },
    { path: '/users', icon: '👥', label: 'Users', visible: perms.canViewUsers === true },
    { path: '/circles', icon: '🔵', label: 'Care Circles', visible: perms.canViewCircles === true },
    { path: '/ai-usage', icon: '🤖', label: 'AI Usage', visible: perms.canViewAnalytics === true },
    { path: '/health-alerts', icon: '🏥', label: 'Health Alerts', visible: perms.canViewAlerts === true },
    { path: '/medications', icon: '💊', label: 'Medications', visible: perms.canViewMedications === true },
    { path: '/feature-flags', icon: '🚩', label: 'Feature Flags', visible: perms.canViewFeatureFlags === true },
    { path: '/audit-logs', icon: '📜', label: 'Audit Logs', visible: perms.canViewAuditLogs === true },
    { path: '/settings', icon: '⚙️', label: 'Settings', visible: perms.canViewSettings === true },
    { path: '/admins', icon: '🔐', label: 'Admin Management', visible: admin?.role === 'super_admin' },
  ].filter((item) => item.visible);

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

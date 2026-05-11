import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useIdleTimeout } from './hooks/useIdleTimeout';
import { useEffect } from 'react';
import api from './services/api';
import SessionTimeoutModal from './components/SessionTimeoutModal';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import Circles from './pages/Circles';
import CircleDetail from './pages/CircleDetail';
import FeatureFlags from './pages/FeatureFlags';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';
import AIUsageAnalytics from './pages/AIUsageAnalytics';
import HealthAlerts from './pages/HealthAlerts';
import MedicationReports from './pages/MedicationReports';
import Layout from './components/Layout';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { admin, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const { showWarning, remainingSeconds, resetTimer } = useIdleTimeout(logout, () => { api.getProfile(); });

  useEffect(() => {
    const handler = () => { logout(); navigate('/login', { replace: true }); };
    window.addEventListener('karuna:auth:unauthorized', handler);
    return () => window.removeEventListener('karuna:auth:unauthorized', handler);
  }, [logout, navigate]);

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  if (!admin) {
    return <Navigate to="/login" />;
  }

  return (
    <>
      {children}
      {showWarning && (
        <SessionTimeoutModal
          remainingSeconds={remainingSeconds}
          onStayLoggedIn={resetTimer}
          onLogout={logout}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/users" element={<Users />} />
                <Route path="/users/:id" element={<UserDetail />} />
                <Route path="/circles" element={<Circles />} />
                <Route path="/circles/:id" element={<CircleDetail />} />
                <Route path="/feature-flags" element={<FeatureFlags />} />
                <Route path="/ai-usage" element={<AIUsageAnalytics />} />
                <Route path="/health-alerts" element={<HealthAlerts />} />
                <Route path="/medications" element={<MedicationReports />} />
                <Route path="/audit-logs" element={<AuditLogs />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={
                  <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>404</div>
                    <h2 style={{ marginBottom: '0.5rem' }}>Page Not Found</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                      The page you're looking for doesn't exist.
                    </p>
                    <a href="/" className="btn btn-primary">Go to Dashboard</a>
                  </div>
                } />
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

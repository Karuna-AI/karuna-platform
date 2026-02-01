import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useIdleTimeout } from './hooks/useIdleTimeout';
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
  const { showWarning, remainingSeconds, resetTimer } = useIdleTimeout(logout);

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
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';

import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CareCircleDetail from './pages/CareCircleDetail';
import AcceptInvitation from './pages/AcceptInvitation';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ErrorBoundary from './components/ErrorBoundary';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="page" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <Layout>{children}</Layout>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="page" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    const raw = new URLSearchParams(location.search).get('redirect') || '/';
    const redirectTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

function ConsentErrorListener() {
  const { showToast } = useToast();
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<string>).detail || 'Access denied: patient has not granted consent for this data.';
      showToast(msg, 'error');
    };
    window.addEventListener('karuna:consent:denied', handler);
    return () => window.removeEventListener('karuna:consent:denied', handler);
  }, [showToast]);
  return null;
}

function AppRoutes() {
  return (
    <>
      <ConsentErrorListener />
      <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />

      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <ForgotPassword />
          </PublicRoute>
        }
      />
      {/* Reset password is always public — token is single-use */}
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Invitation route (semi-public) */}
      <Route path="/invite/:token" element={<AcceptInvitation />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/circles/:id"
        element={
          <ProtectedRoute>
            <CareCircleDetail />
          </ProtectedRoute>
        }
      />

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

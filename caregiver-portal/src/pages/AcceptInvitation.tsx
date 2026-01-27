import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function AcceptInvitation() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'auth-required'>('loading');
  const [error, setError] = useState('');
  const [circleName, setCircleName] = useState('');

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      setStatus('auth-required');
      return;
    }

    acceptInvitation();
  }, [token, isAuthenticated, authLoading]);

  const acceptInvitation = async () => {
    if (!token) {
      setError('Invalid invitation link');
      setStatus('error');
      return;
    }

    const result = await api.acceptInvitation(token);

    if (result.success && result.data) {
      setCircleName(result.data.name);
      setStatus('success');
    } else {
      setError(result.error || 'Failed to accept invitation');
      setStatus('error');
    }
  };

  if (authLoading || status === 'loading') {
    return (
      <div className="page" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="card" style={{ maxWidth: '400px', textAlign: 'center' }}>
          <div className="loading">
            <div className="spinner" />
          </div>
          <p className="text-muted" style={{ marginTop: '1rem' }}>Processing invitation...</p>
        </div>
      </div>
    );
  }

  if (status === 'auth-required') {
    return (
      <div className="page" style={{ justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
        <div className="card" style={{ maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📩</div>
          <h2 style={{ marginBottom: '1rem' }}>You've Been Invited!</h2>
          <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
            Please sign in or create an account to join the care circle.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <Link
              to={`/login?redirect=/invite/${token}`}
              className="btn btn-primary"
            >
              Sign In
            </Link>
            <Link
              to={`/register?redirect=/invite/${token}`}
              className="btn btn-secondary"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="page" style={{ justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
        <div className="card" style={{ maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
          <h2 style={{ marginBottom: '1rem' }}>Invitation Failed</h2>
          <p className="text-muted" style={{ marginBottom: '1.5rem' }}>{error}</p>
          <Link to="/" className="btn btn-primary">
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
      <div className="card" style={{ maxWidth: '400px', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
        <h2 style={{ marginBottom: '1rem' }}>Welcome!</h2>
        <p style={{ marginBottom: '1.5rem' }}>
          You've successfully joined <strong>{circleName}</strong>
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

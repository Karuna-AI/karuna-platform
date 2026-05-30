import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const validate = () => {
    const errors: Record<string, string> = {};
    if (password.length < 8) errors.password = 'Password must be at least 8 characters';
    if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    if (!token) {
      setError('Missing reset token. Please use the link from your email.');
      return;
    }

    setError('');
    setIsLoading(true);
    const result = await api.resetPassword(token, password);
    setIsLoading(false);

    if (result.success) {
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } else {
      setError(result.error || 'Failed to reset password. The link may have expired.');
    }
  };

  if (!token) {
    return (
      <div className="page" style={{ justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
        <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ marginBottom: '0.75rem' }}>Invalid reset link</h2>
          <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
            This password reset link is missing a token. Please request a new reset link.
          </p>
          <Link to="/forgot-password" className="btn btn-primary btn-block">Request New Link</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>Karuna</h1>
          <p className="text-muted">Caregiver Portal</p>
        </div>

        {success ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <h2 style={{ marginBottom: '0.75rem' }}>Password reset!</h2>
            <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
              Your password has been updated. Redirecting you to sign in...
            </p>
            <Link to="/login" className="btn btn-primary btn-block">Sign In Now</Link>
          </div>
        ) : (
          <>
            <h2 style={{ marginBottom: '0.5rem' }}>Set new password</h2>
            <p className="text-muted" style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              Choose a strong password with at least 8 characters.
            </p>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                {error}{' '}
                {error.toLowerCase().includes('expired') && (
                  <Link to="/forgot-password">Request a new link</Link>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="password">New Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className={`form-input${fieldErrors.password ? ' input-error' : ''}`}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: '' })); }}
                    onBlur={() => { if (password.length > 0 && password.length < 8) setFieldErrors((p) => ({ ...p, password: 'Password must be at least 8 characters' })); }}
                    placeholder="Enter new password"
                    disabled={isLoading}
                    autoFocus
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="confirmPassword"
                    type={showConfirm ? 'text' : 'password'}
                    className={`form-input${fieldErrors.confirmPassword ? ' input-error' : ''}`}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); if (fieldErrors.confirmPassword) setFieldErrors((p) => ({ ...p, confirmPassword: '' })); }}
                    onBlur={() => { if (confirmPassword && confirmPassword !== password) setFieldErrors((p) => ({ ...p, confirmPassword: 'Passwords do not match' })); }}
                    placeholder="Confirm new password"
                    disabled={isLoading}
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowConfirm(!showConfirm)}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
                  >
                    {showConfirm ? '🙈' : '👁️'}
                  </button>
                </div>
                {fieldErrors.confirmPassword && <p className="field-error">{fieldErrors.confirmPassword}</p>}
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={isLoading}>
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: '1.5rem' }}>
              <Link to="/login">Back to Sign In</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

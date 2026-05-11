import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { register } = useAuth();
  const navigate = useNavigate();

  const validateField = (field: string, value: string, extra?: string): string => {
    if (field === 'name') return value.trim().length < 2 ? 'Name must be at least 2 characters' : '';
    if (field === 'email') return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? 'Enter a valid email address' : '';
    if (field === 'password') return value.length < 8 ? 'Password must be at least 8 characters' : '';
    if (field === 'confirmPassword') return value !== extra ? 'Passwords do not match' : '';
    return '';
  };

  const handleBlur = (field: string, value: string, extra?: string) => {
    const err = validateField(field, value, extra);
    setFieldErrors((prev) => ({ ...prev, [field]: err }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const errors = {
      name: validateField('name', name),
      email: validateField('email', email),
      password: validateField('password', password),
      confirmPassword: validateField('confirmPassword', confirmPassword, password),
    };
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setIsLoading(true);

    const result = await register({
      name,
      email,
      password,
      phone: phone || undefined,
    });

    if (result.success) {
      const searchParams = new URLSearchParams(window.location.search);
      const redirectParam = searchParams.get('redirect');
      navigate(redirectParam || '/', { replace: true });
    } else {
      setError(result.error || 'Registration failed');
    }

    setIsLoading(false);
  };

  return (
    <div className="page" style={{ justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>Karuna</h1>
          <p className="text-muted">Caregiver Portal</p>
        </div>

        <h2 style={{ marginBottom: '1.5rem' }}>Create Account</h2>

        {error && (
          <div className="alert alert-error">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="name">Full Name</label>
            <input
              id="name"
              type="text"
              className={`form-input${fieldErrors.name ? ' input-error' : ''}`}
              value={name}
              onChange={(e) => { setName(e.target.value); if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: '' })); }}
              onBlur={(e) => handleBlur('name', e.target.value)}
              placeholder="Enter your full name"
              required
              disabled={isLoading}
            />
            {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className={`form-input${fieldErrors.email ? ' input-error' : ''}`}
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: '' })); }}
              onBlur={(e) => handleBlur('email', e.target.value)}
              placeholder="Enter your email"
              required
              disabled={isLoading}
            />
            {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="phone">Phone (optional)</label>
            <input
              id="phone"
              type="tel"
              className="form-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Enter your phone number"
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className={`form-input${fieldErrors.password ? ' input-error' : ''}`}
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: '' })); }}
                onBlur={(e) => handleBlur('password', e.target.value)}
                placeholder="Create a password (min 6 characters)"
                required
                disabled={isLoading}
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
                type={showPassword ? 'text' : 'password'}
                className={`form-input${fieldErrors.confirmPassword ? ' input-error' : ''}`}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); if (fieldErrors.confirmPassword) setFieldErrors((p) => ({ ...p, confirmPassword: '' })); }}
                onBlur={(e) => handleBlur('confirmPassword', e.target.value, password)}
                placeholder="Confirm your password"
                required
                disabled={isLoading}
                style={{ paddingRight: '2.5rem' }}
              />
            </div>
            {fieldErrors.confirmPassword && <p className="field-error">{fieldErrors.confirmPassword}</p>}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isLoading}
          >
            {isLoading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          Already have an account?{' '}
          <Link to={`/login${new URLSearchParams(window.location.search).get('redirect') ? `?redirect=${encodeURIComponent(new URLSearchParams(window.location.search).get('redirect')!)}` : ''}`}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

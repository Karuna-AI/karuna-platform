import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface AdminAccount {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'support';
  created_at: string;
}

interface CreateAdminForm {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'support';
}

export default function AdminManagement() {
  const { admin } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateAdminForm>({ name: '', email: '', password: '', role: 'admin' });
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  useEffect(() => {
    if (admin?.role !== 'super_admin') {
      navigate('/', { replace: true });
    }
  }, [admin, navigate]);

  const loadAdmins = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setIsLoading(true);
    setLoadError('');
    const result = await api.getAdmins();
    if (abortRef.current?.signal.aborted) return;
    if (result.success) {
      setAdmins(result.data.admins ?? result.data ?? []);
    } else {
      setLoadError(result.error || 'Failed to load admins');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (!createForm.name.trim() || !createForm.email.trim()) {
      setCreateError('Name and email are required.');
      return;
    }
    if (createForm.password.length < 8) {
      setCreateError('Password must be at least 8 characters.');
      return;
    }
    setIsCreating(true);
    const result = await api.createAdmin({
      name: createForm.name.trim(),
      email: createForm.email.trim(),
      password: createForm.password,
      role: createForm.role,
    });
    setIsCreating(false);
    if (result.success) {
      setShowCreateModal(false);
      setCreateForm({ name: '', email: '', password: '', role: 'admin' });
      loadAdmins();
      showToast('Admin created successfully', 'success');
    } else {
      setCreateError(result.error || 'Failed to create admin.');
    }
  };

  const roleBadge = (role: AdminAccount['role']) => {
    if (role === 'super_admin') return <span className="badge badge-error">super_admin</span>;
    if (role === 'admin') return <span className="badge badge-info">admin</span>;
    return <span className="badge">support</span>;
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  if (admin?.role !== 'super_admin') return null;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Admin Management</h1>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          + Create Admin
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : loadError ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--error, #e53e3e)' }}>
            <p>{loadError}</p>
            <button className="btn btn-secondary" onClick={loadAdmins} style={{ marginTop: '1rem' }}>
              Retry
            </button>
          </div>
        ) : admins.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔐</div>
            <p>No admin accounts found</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.name}</td>
                    <td>{a.email}</td>
                    <td>{roleBadge(a.role)}</td>
                    <td>{formatDate(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
        >
          <div className="card" style={{ width: '100%', maxWidth: '480px', margin: '1rem' }}>
            <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Create Admin</h2>
            <form onSubmit={handleCreateSubmit}>
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input
                  type="text"
                  className="form-input"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email *</label>
                <input
                  type="email"
                  className="form-input"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password *</label>
                <input
                  type="password"
                  className="form-input"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="Min 8 characters"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Role *</label>
                <select
                  className="form-select"
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as 'admin' | 'support' })}
                >
                  <option value="admin">admin</option>
                  <option value="support">support</option>
                </select>
              </div>
              {createError && (
                <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{createError}</div>
              )}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowCreateModal(false); setCreateError(''); }}
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isCreating}>
                  {isCreating ? 'Creating…' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [circles, setCircles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (id) loadUser();
  }, [id]);

  const loadUser = async () => {
    const result = await api.getUserDetail(id!);
    if (result.success) {
      setUser(result.data.user);
      setCircles(result.data.circles);
    }
    setIsLoading(false);
  };

  const handleSuspend = async () => {
    setActionError('');
    const result = await api.suspendUser(id!, suspendReason);
    if (result.success) {
      setShowSuspendModal(false);
      setSuspendReason('');
      loadUser();
    } else {
      setActionError(result.error || 'Failed to suspend user');
    }
  };

  const handleUnsuspend = async () => {
    const result = await api.unsuspendUser(id!);
    if (result.success) {
      loadUser();
    }
  };

  const handleResetPassword = async () => {
    setActionError('');
    if (newPassword.length < 6) {
      setActionError('Password must be at least 6 characters');
      return;
    }
    const result = await api.resetUserPassword(id!, newPassword);
    if (result.success) {
      setShowResetModal(false);
      setNewPassword('');
      setSuccessMessage('Password reset successfully');
      setTimeout(() => setSuccessMessage(''), 5000); // Auto-dismiss after 5 seconds
    } else {
      setActionError(result.error || 'Failed to reset password');
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  if (isLoading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  if (!user) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>User not found</p>
          <button onClick={() => navigate('/users')} className="btn btn-secondary">Back to Users</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => navigate('/users')} className="btn btn-secondary btn-sm" style={{ marginBottom: '1rem' }}>
        ← Back to Users
      </button>

      {successMessage && (
        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
          {successMessage}
        </div>
      )}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="profile-header">
          <div className="profile-avatar">
            {user.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="profile-info">
            <h2>{user.name}</h2>
            <div className="profile-meta">
              <span>{user.email}</span>
              {user.suspended_at ? (
                <span className="badge badge-error">Suspended</span>
              ) : user.is_active ? (
                <span className="badge badge-success">Active</span>
              ) : (
                <span className="badge">Inactive</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          {user.suspended_at ? (
            <button onClick={handleUnsuspend} className="btn btn-success">Unsuspend</button>
          ) : (
            <button onClick={() => setShowSuspendModal(true)} className="btn btn-danger">Suspend User</button>
          )}
          <button onClick={() => setShowResetModal(true)} className="btn btn-secondary">Reset Password</button>
        </div>
      </div>

      <div className="detail-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <div className="detail-item">
            <div className="detail-label">Phone</div>
            <div className="detail-value">{user.phone || '-'}</div>
          </div>
        </div>
        <div className="card">
          <div className="detail-item">
            <div className="detail-label">Login Count</div>
            <div className="detail-value">{user.login_count || 0}</div>
          </div>
        </div>
        <div className="card">
          <div className="detail-item">
            <div className="detail-label">Last Login</div>
            <div className="detail-value">{formatDate(user.last_login_at)}</div>
          </div>
        </div>
        <div className="card">
          <div className="detail-item">
            <div className="detail-label">Registered</div>
            <div className="detail-value">{formatDate(user.created_at)}</div>
          </div>
        </div>
      </div>

      {user.suspended_at && (
        <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>
          <strong>Suspended:</strong> {user.suspended_reason || 'No reason provided'}
          <br />
          <small>Suspended on {formatDate(user.suspended_at)}</small>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Care Circles ({circles.length})</h3>
        </div>
        {circles.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No care circles</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Circle Name</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {circles.map((circle) => (
                  <tr key={circle.id}>
                    <td>{circle.name}</td>
                    <td><span className="badge badge-primary">{circle.role}</span></td>
                    <td>{formatDate(circle.joined_at)}</td>
                    <td>
                      <button
                        onClick={() => navigate(`/circles/${circle.id}`)}
                        className="btn btn-sm btn-secondary"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Suspend Modal */}
      {showSuspendModal && (
        <div className="modal-overlay" onClick={() => setShowSuspendModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Suspend User</h3>
              <button className="modal-close" onClick={() => setShowSuspendModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {actionError && <div className="alert alert-error">{actionError}</div>}
              <div className="form-group">
                <label className="form-label">Reason for suspension</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="Enter reason..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowSuspendModal(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={handleSuspend} className="btn btn-danger">Suspend</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && (
        <div className="modal-overlay" onClick={() => setShowResetModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Reset Password</h3>
              <button className="modal-close" onClick={() => setShowResetModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {actionError && <div className="alert alert-error">{actionError}</div>}
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowResetModal(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={handleResetPassword} className="btn btn-primary">Reset Password</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

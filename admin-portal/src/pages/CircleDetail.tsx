import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import type { AdminCircle, CircleMember, CircleStats } from '../types';

export default function CircleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [circle, setCircle] = useState<AdminCircle | null>(null);
  const [members, setMembers] = useState<CircleMember[]>([]);
  const [stats, setStats] = useState<CircleStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editRecipient, setEditRecipient] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState('');

  // Status toggle state
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [statusError, setStatusError] = useState('');

  // Remove member state
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [removeMemberError, setRemoveMemberError] = useState('');

  useEffect(() => {
    if (id) loadCircle();
  }, [id]);

  const loadCircle = async () => {
    setLoadError('');
    const result = await api.getCircleDetail(id!);
    if (result.success) {
      setCircle(result.data.circle);
      setMembers(result.data.members);
      setStats(result.data.stats);
    } else {
      setLoadError(result.error || 'Failed to load circle');
    }
    setIsLoading(false);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');
    setIsEditing(true);
    const result = await api.updateCircle(id!, {
      name: editName || undefined,
      care_recipient_name: editRecipient || undefined,
    });
    setIsEditing(false);
    if (result.success) {
      setCircle(result.data.circle);
      setShowEditModal(false);
    } else {
      setEditError(result.error || 'Failed to update circle');
    }
  };

  const handleToggleStatus = async () => {
    if (!circle) return;
    const action = circle.is_active ? 'deactivate' : 'activate';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this circle?`)) return;
    setStatusError('');
    setIsTogglingStatus(true);
    const result = circle.is_active
      ? await api.deactivateCircle(id!)
      : await api.activateCircle(id!);
    setIsTogglingStatus(false);
    if (result.success) {
      setCircle(result.data.circle);
    } else {
      setStatusError(result.error || `Failed to ${action} circle`);
    }
  };

  const handleRemoveMember = async (member: CircleMember) => {
    if (member.role === 'owner') return;
    if (!confirm(`Remove ${member.name} from this circle?`)) return;
    setRemoveMemberError('');
    setRemovingMemberId(member.id);
    const result = await api.removeCircleMember(id!, member.id);
    setRemovingMemberId(null);
    if (result.success) {
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    } else {
      setRemoveMemberError(result.error || 'Failed to remove member');
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  if (isLoading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  if (loadError || !circle) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>{loadError || 'Circle not found'}</p>
          <button onClick={() => navigate('/circles')} className="btn btn-secondary">Back to Circles</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => navigate('/circles')} className="btn btn-secondary btn-sm" style={{ marginBottom: '1rem' }}>
        ← Back to Circles
      </button>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ marginBottom: '0.25rem' }}>{circle.name}</h2>
            <p style={{ color: 'var(--text-muted)' }}>Caring for: {circle.care_recipient_name}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {circle.is_active ? (
              <span className="badge badge-success">Active</span>
            ) : (
              <span className="badge">Inactive</span>
            )}
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => {
                setEditName(circle.name);
                setEditRecipient(circle.care_recipient_name);
                setEditError('');
                setShowEditModal(true);
              }}
            >
              Edit
            </button>
            <button
              className={`btn btn-sm ${circle.is_active ? 'btn-warning' : 'btn-primary'}`}
              onClick={handleToggleStatus}
              disabled={isTogglingStatus}
            >
              {isTogglingStatus ? '...' : circle.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </div>
        {statusError && (
          <div style={{ color: 'var(--error, #e53e3e)', fontSize: '0.875rem', marginTop: '0.75rem' }}>{statusError}</div>
        )}
      </div>

      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-label">Members</div>
          <div className="stat-value">{members.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Medications</div>
          <div className="stat-value">{stats?.medications || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Appointments</div>
          <div className="stat-value">{stats?.appointments || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Alerts</div>
          <div className="stat-value" style={{ color: stats?.active_alerts > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {stats?.active_alerts || 0}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="card">
          <div className="detail-item">
            <div className="detail-label">Subscription</div>
            <div className="detail-value">{circle.subscription_tier || 'Free'}</div>
          </div>
        </div>
        <div className="card">
          <div className="detail-item">
            <div className="detail-label">Created</div>
            <div className="detail-value">{formatDate(circle.created_at)}</div>
          </div>
        </div>
        <div className="card">
          <div className="detail-item">
            <div className="detail-label">Notes</div>
            <div className="detail-value">{stats?.notes || 0}</div>
          </div>
        </div>
        <div className="card">
          <div className="detail-item">
            <div className="detail-label">Health Records</div>
            <div className="detail-value">{stats?.health_records || 0}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Members ({members.length})</h3>
        </div>
        {removeMemberError && (
          <div style={{ color: 'var(--error, #e53e3e)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>{removeMemberError}</div>
        )}
        {members.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No members</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td style={{ fontWeight: 500 }}>{member.name}</td>
                    <td>{member.email}</td>
                    <td>
                      <span className={`badge ${member.role === 'owner' ? 'badge-primary' : ''}`}>
                        {member.role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${member.status === 'active' ? 'badge-success' : ''}`}>
                        {member.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => navigate(`/users/${member.user_id}`)}
                          className="btn btn-sm btn-secondary"
                        >
                          View User
                        </button>
                        {member.role !== 'owner' && (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleRemoveMember(member)}
                            disabled={removingMemberId === member.id}
                          >
                            {removingMemberId === member.id ? '...' : 'Remove'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => { setShowEditModal(false); setEditError(''); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Edit Circle</h3>
              <button className="modal-close" onClick={() => { setShowEditModal(false); setEditError(''); }}>×</button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Circle Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    disabled={isEditing}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Care Recipient Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editRecipient}
                    onChange={(e) => setEditRecipient(e.target.value)}
                    required
                    disabled={isEditing}
                  />
                </div>
              </div>
              {editError && (
                <div style={{ color: 'var(--error, #e53e3e)', fontSize: '0.875rem', padding: '0 1.5rem 0.5rem' }}>
                  {editError}
                </div>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowEditModal(false); setEditError(''); }} disabled={isEditing}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isEditing}>
                  {isEditing ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

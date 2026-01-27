import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function CircleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [circle, setCircle] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (id) loadCircle();
  }, [id]);

  const loadCircle = async () => {
    const result = await api.getCircleDetail(id!);
    if (result.success) {
      setCircle(result.data.circle);
      setMembers(result.data.members);
      setStats(result.data.stats);
    }
    setIsLoading(false);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  if (isLoading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  if (!circle) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>Circle not found</p>
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
          {circle.is_active ? (
            <span className="badge badge-success">Active</span>
          ) : (
            <span className="badge">Inactive</span>
          )}
        </div>
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
                      <button
                        onClick={() => navigate(`/users/${member.user_id}`)}
                        className="btn btn-sm btn-secondary"
                      >
                        View User
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

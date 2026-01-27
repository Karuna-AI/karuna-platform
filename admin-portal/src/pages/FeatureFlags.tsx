import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function FeatureFlags() {
  const [flags, setFlags] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFlag, setNewFlag] = useState({ name: '', description: '', is_enabled: false });
  const { admin } = useAuth();

  useEffect(() => {
    loadFlags();
  }, []);

  const loadFlags = async () => {
    const result = await api.getFeatureFlags();
    if (result.success) {
      setFlags(result.data.flags);
    }
    setIsLoading(false);
  };

  const handleToggle = async (flag: any) => {
    const result = await api.updateFeatureFlag(flag.id, {
      is_enabled: !flag.is_enabled,
    });
    if (result.success) {
      setFlags(flags.map(f => f.id === flag.id ? result.data.flag : f));
    }
  };

  const handleToggleForAll = async (flag: any) => {
    const result = await api.updateFeatureFlag(flag.id, {
      enabled_for_all: !flag.enabled_for_all,
    });
    if (result.success) {
      setFlags(flags.map(f => f.id === flag.id ? result.data.flag : f));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await api.createFeatureFlag(newFlag);
    if (result.success) {
      setFlags([...flags, result.data.flag]);
      setShowCreateModal(false);
      setNewFlag({ name: '', description: '', is_enabled: false });
    }
  };

  const canManageFlags = admin?.permissions?.canManageFeatureFlags;

  if (isLoading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Feature Flags</h1>
        {canManageFlags && (
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
            + New Flag
          </button>
        )}
      </div>

      <div className="card">
        {flags.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🚩</div>
            <p>No feature flags configured</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Flag Name</th>
                  <th>Description</th>
                  <th>Enabled</th>
                  <th>For All</th>
                  <th>Rollout %</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((flag) => (
                  <tr key={flag.id}>
                    <td style={{ fontWeight: 500 }}>{flag.name}</td>
                    <td style={{ color: 'var(--text-muted)', maxWidth: '300px' }}>
                      {flag.description || '-'}
                    </td>
                    <td>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={flag.is_enabled}
                          onChange={() => handleToggle(flag)}
                          disabled={!canManageFlags}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </td>
                    <td>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={flag.enabled_for_all}
                          onChange={() => handleToggleForAll(flag)}
                          disabled={!canManageFlags || !flag.is_enabled}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </td>
                    <td>
                      {flag.rollout_percentage}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Feature Flag</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newFlag.name}
                    onChange={(e) => setNewFlag({ ...newFlag, name: e.target.value })}
                    placeholder="e.g., new_feature_v2"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={newFlag.description}
                    onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })}
                    placeholder="What does this flag control?"
                  />
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={newFlag.is_enabled}
                      onChange={(e) => setNewFlag({ ...newFlag, is_enabled: e.target.checked })}
                    />
                    Enable immediately
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Flag
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

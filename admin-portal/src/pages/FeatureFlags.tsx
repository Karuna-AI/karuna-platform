import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function FeatureFlags() {
  const [flags, setFlags] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFlag, setNewFlag] = useState({ name: '', description: '', is_enabled: false });
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingFlag, setEditingFlag] = useState<any>(null);
  const [editForm, setEditForm] = useState({ description: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingRollout, setPendingRollout] = useState<Record<string, number>>({});
  const { admin } = useAuth();
  const { showToast } = useToast();

  const canManageFlags = admin?.permissions?.canManageFeatureFlags;

  useEffect(() => {
    loadFlags();
  }, []);

  const loadFlags = async () => {
    setLoadError('');
    const result = await api.getFeatureFlags();
    if (result.success) {
      setFlags(result.data.flags);
    } else {
      setLoadError(result.error || 'Failed to load feature flags');
    }
    setIsLoading(false);
  };

  const handleToggle = async (flag: any) => {
    setFlags((prev) =>
      prev.map((f) => (f.id === flag.id ? { ...f, is_enabled: !f.is_enabled } : f))
    );
    const result = await api.updateFeatureFlag(flag.id, { is_enabled: !flag.is_enabled });
    if (!result.success) {
      setFlags((prev) =>
        prev.map((f) => (f.id === flag.id ? { ...f, is_enabled: flag.is_enabled } : f))
      );
    }
  };

  const handleToggleForAll = async (flag: any) => {
    setFlags((prev) =>
      prev.map((f) => (f.id === flag.id ? { ...f, enabled_for_all: !f.enabled_for_all } : f))
    );
    const result = await api.updateFeatureFlag(flag.id, { enabled_for_all: !flag.enabled_for_all });
    if (!result.success) {
      setFlags((prev) =>
        prev.map((f) => (f.id === flag.id ? { ...f, enabled_for_all: flag.enabled_for_all } : f))
      );
    }
  };

  const handleRolloutChange = (flagId: string, value: number) => {
    setPendingRollout((prev) => ({ ...prev, [flagId]: value }));
  };

  const handleRolloutCommit = async (flagId: string, value: number) => {
    if (!canManageFlags) return;
    const result = await api.updateFeatureFlagRollout(flagId, value);
    if (result.success) {
      setFlags((prev) =>
        prev.map((f) => (f.id === flagId ? { ...f, rollout_percentage: value } : f))
      );
    }
    setPendingRollout((prev) => {
      const next = { ...prev };
      delete next[flagId];
      return next;
    });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFlag) return;
    setEditError(null);
    const result = await api.updateFeatureFlag(editingFlag.id, { description: editForm.description });
    if (result.success) {
      setFlags((prev) => prev.map((f) => f.id === editingFlag.id ? { ...f, description: editForm.description } : f));
      setEditingFlag(null);
      showToast('Flag updated', 'success');
    } else {
      setEditError(result.error || 'Failed to update flag');
    }
  };

  const handleDelete = async (flag: any) => {
    if (!confirm(`Delete flag "${flag.name}"? This cannot be undone.`)) return;
    setDeletingId(flag.id);
    const result = await api.deleteFeatureFlag(flag.id);
    setDeletingId(null);
    if (result.success) {
      setFlags((prev) => prev.filter((f) => f.id !== flag.id));
      showToast('Flag deleted', 'success');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    const result = await api.createFeatureFlag(newFlag);
    if (result.success) {
      setFlags([...flags, result.data.flag]);
      setShowCreateModal(false);
      setNewFlag({ name: '', description: '', is_enabled: false });
      showToast('Feature flag created', 'success');
    } else {
      setCreateError(result.error || 'Failed to create feature flag');
    }
  };

  if (isLoading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  if (loadError) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--error, #e53e3e)' }}>
        <p>{loadError}</p>
        <button className="btn btn-secondary" onClick={loadFlags} style={{ marginTop: '1rem' }}>Retry</button>
      </div>
    );
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
                  {canManageFlags && <th></th>}
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
                    <td style={{ minWidth: '160px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={pendingRollout[flag.id] ?? flag.rollout_percentage}
                          onChange={(e) => handleRolloutChange(flag.id, Number(e.target.value))}
                          onMouseUp={(e) => handleRolloutCommit(flag.id, Number((e.target as HTMLInputElement).value))}
                          onTouchEnd={(e) => handleRolloutCommit(flag.id, Number((e.target as HTMLInputElement).value))}
                          disabled={!canManageFlags || !flag.is_enabled}
                          style={{ flex: 1 }}
                        />
                        <span style={{ minWidth: '3rem', textAlign: 'right' }}>
                          {pendingRollout[flag.id] ?? flag.rollout_percentage}%
                        </span>
                      </div>
                    </td>
                    {canManageFlags && (
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => { setEditingFlag(flag); setEditForm({ description: flag.description || '' }); setEditError(null); }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDelete(flag)}
                            disabled={deletingId === flag.id}
                          >
                            {deletingId === flag.id ? '...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => { setShowCreateModal(false); setCreateError(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Feature Flag</h3>
              <button className="modal-close" onClick={() => { setShowCreateModal(false); setCreateError(null); }}>×</button>
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
              {createError && (
                <div style={{ color: 'var(--error, #e53e3e)', fontSize: '0.875rem', padding: '0 1.5rem 0.5rem' }}>
                  {createError}
                </div>
              )}
              <div className="modal-footer">
                <button type="button" onClick={() => { setShowCreateModal(false); setCreateError(null); }} className="btn btn-secondary">
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

      {/* Edit Modal */}
      {editingFlag && (
        <div className="modal-overlay" onClick={() => { setEditingFlag(null); setEditError(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Edit Flag: {editingFlag.name}</h3>
              <button className="modal-close" onClick={() => { setEditingFlag(null); setEditError(null); }}>×</button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={editForm.description}
                    onChange={(e) => setEditForm({ description: e.target.value })}
                    placeholder="What does this flag control?"
                  />
                </div>
              </div>
              {editError && (
                <div style={{ color: 'var(--error, #e53e3e)', fontSize: '0.875rem', padding: '0 1.5rem 0.5rem' }}>
                  {editError}
                </div>
              )}
              <div className="modal-footer">
                <button type="button" onClick={() => { setEditingFlag(null); setEditError(null); }} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

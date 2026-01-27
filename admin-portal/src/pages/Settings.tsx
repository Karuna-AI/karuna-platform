import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const [settings, setSettings] = useState<Record<string, any[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [editingSetting, setEditingSetting] = useState<any>(null);
  const [editValue, setEditValue] = useState('');
  const { admin } = useAuth();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const result = await api.getSettings();
    if (result.success) {
      setSettings(result.data.settings);
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    if (!editingSetting) return;

    let parsedValue;
    try {
      parsedValue = JSON.parse(editValue);
    } catch {
      parsedValue = editValue;
    }

    const result = await api.updateSetting(editingSetting.key, parsedValue);
    if (result.success) {
      loadSettings();
      setEditingSetting(null);
    }
  };

  const canManageSettings = admin?.permissions?.canManageSettings;

  const formatValue = (value: any) => {
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  if (isLoading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  const categories = Object.keys(settings);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">System Settings</h1>
      </div>

      {!canManageSettings && (
        <div className="alert alert-warning" style={{ marginBottom: '1.5rem', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--warning)', color: 'var(--warning)' }}>
          You have view-only access to settings. Contact a super admin to make changes.
        </div>
      )}

      {categories.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">⚙️</div>
            <p>No settings configured</p>
          </div>
        </div>
      ) : (
        categories.map((category) => (
          <div key={category} className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title" style={{ textTransform: 'capitalize' }}>
                {category.replace('_', ' ')}
              </h3>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Setting</th>
                    <th>Value</th>
                    <th>Description</th>
                    {canManageSettings && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {settings[category].map((setting) => (
                    <tr key={setting.key}>
                      <td style={{ fontWeight: 500 }}>{setting.key}</td>
                      <td>
                        <code style={{ background: 'var(--bg)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                          {formatValue(setting.value)}
                        </code>
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{setting.description || '-'}</td>
                      {canManageSettings && (
                        <td>
                          <button
                            onClick={() => {
                              setEditingSetting(setting);
                              setEditValue(formatValue(setting.value));
                            }}
                            className="btn btn-sm btn-secondary"
                          >
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {/* Edit Modal */}
      {editingSetting && (
        <div className="modal-overlay" onClick={() => setEditingSetting(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Edit Setting</h3>
              <button className="modal-close" onClick={() => setEditingSetting(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Key</label>
                <input
                  type="text"
                  className="form-input"
                  value={editingSetting.key}
                  disabled
                />
              </div>
              <div className="form-group">
                <label className="form-label">Value</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                />
                <small style={{ color: 'var(--text-muted)' }}>
                  Enter JSON for objects/arrays, or plain text for strings/numbers
                </small>
              </div>
              {editingSetting.description && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  {editingSetting.description}
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setEditingSetting(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleSave} className="btn btn-primary">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

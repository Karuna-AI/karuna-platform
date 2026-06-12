import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api, { OwnedCircleSummary } from '../services/api';

/**
 * Account & privacy page — GDPR self-service:
 *  - download a full JSON export of the user's data
 *  - permanently delete the account (password-confirmed; deleting owned
 *    circles requires an explicit second confirmation)
 */
export default function Account() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [ownedCircles, setOwnedCircles] = useState<OwnedCircleSummary[] | null>(null);
  const [confirmOwned, setConfirmOwned] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    const result = await api.exportMyData();
    setIsExporting(false);
    if (!result.success || !result.data) {
      showToast(result.error || 'Export failed', 'error');
      return;
    }
    const url = URL.createObjectURL(result.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `karuna-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Your data export has been downloaded.', 'success');
  };

  const handleDelete = async () => {
    setDeleteError(null);
    if (!password) {
      setDeleteError('Enter your password to confirm deletion.');
      return;
    }
    if (!window.confirm('Permanently delete your Karuna account? This cannot be undone.')) {
      return;
    }
    setIsDeleting(true);
    const result = await api.deleteAccount(password, confirmOwned);
    setIsDeleting(false);

    if (result.success) {
      showToast('Your account and data have been deleted.', 'success');
      await logout();
      navigate('/login', { replace: true });
      return;
    }
    if (result.ownedCircles && result.ownedCircles.length > 0) {
      // 409: owned circles need an explicit second confirmation.
      setOwnedCircles(result.ownedCircles);
      setDeleteError(result.error || 'You own care circles — confirm below to delete them too.');
      return;
    }
    setDeleteError(result.error || 'Failed to delete account.');
  };

  return (
    <div className="container" style={{ maxWidth: '640px', padding: '2rem 1rem' }}>
      <h1 style={{ marginBottom: '1.5rem' }}>Account &amp; Privacy</h1>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h2 className="card-title">Profile</h2>
        </div>
        <p><strong>Name:</strong> {user?.name}</p>
        <p><strong>Email:</strong> {user?.email}</p>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h2 className="card-title">Download your data</h2>
        </div>
        <p className="text-muted" style={{ marginBottom: '1rem' }}>
          Get a JSON file with everything Karuna stores about you: your profile, circle
          memberships, and the full contents of the care circles you own (vault entries,
          health history, activity, alerts and notes). Document files are listed but not
          embedded — download those from each circle's documents section.
        </p>
        <button className="btn btn-primary" onClick={handleExport} disabled={isExporting}>
          {isExporting ? 'Preparing export…' : 'Download my data'}
        </button>
      </div>

      <div className="card" style={{ borderColor: 'var(--danger, #dc2626)' }}>
        <div className="card-header">
          <h2 className="card-title" style={{ color: 'var(--danger, #dc2626)' }}>Delete account</h2>
        </div>
        <p className="text-muted" style={{ marginBottom: '1rem' }}>
          Permanently deletes your account. Care circles you own are deleted for all
          members; in circles you only belong to, your identity is removed but the
          circle's own data stays with its members. This cannot be undone.
        </p>

        {ownedCircles && ownedCircles.length > 0 && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            <p style={{ marginBottom: '0.5rem' }}>
              <strong>You own {ownedCircles.length} care circle{ownedCircles.length > 1 ? 's' : ''}:</strong>
            </p>
            <ul style={{ margin: '0 0 0.75rem 1.25rem' }}>
              {ownedCircles.map((c) => (
                <li key={c.id}>{c.name} ({c.memberCount} member{c.memberCount !== 1 ? 's' : ''})</li>
              ))}
            </ul>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={confirmOwned}
                onChange={(e) => setConfirmOwned(e.target.checked)}
              />
              Yes, delete these circles and all their data for every member
            </label>
          </div>
        )}

        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label htmlFor="delete-password">Confirm with your password</label>
          <input
            id="delete-password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Current password"
            autoComplete="current-password"
          />
        </div>

        {deleteError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{deleteError}</div>}

        <button className="btn btn-danger" onClick={handleDelete} disabled={isDeleting}>
          {isDeleting ? 'Deleting…' : 'Permanently delete my account'}
        </button>
      </div>
    </div>
  );
}

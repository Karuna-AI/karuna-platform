import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useDebounce } from '../hooks/useDebounce';

type SortDir = 'asc' | 'desc';

interface CreateUserForm {
  name: string;
  email: string;
  phone: string;
}

interface SortConfig {
  sortBy: string;
  sortDir: SortDir;
}

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, limit: 50, total: 0 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sort, setSort] = useState<SortConfig>({ sortBy: '', sortDir: 'asc' });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>({ name: '', email: '', phone: '' });
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  const debouncedSearch = useDebounce(search, 300);

  const loadUsers = useCallback(async (
    page = 1,
    searchTerm = debouncedSearch,
    statusFilter = status,
    sortConfig = sort,
  ) => {
    setIsLoading(true);
    setLoadError('');
    const result = await api.getUsers({
      page,
      limit: 50,
      search: searchTerm || undefined,
      status: statusFilter || undefined,
      sortBy: sortConfig.sortBy || undefined,
      sortDir: sortConfig.sortBy ? sortConfig.sortDir : undefined,
    });
    if (result.success) {
      setUsers(result.data.users);
      setPagination(result.data.pagination);
    } else {
      setLoadError(result.error || 'Failed to load users');
    }
    setIsLoading(false);
  }, [debouncedSearch, status, sort]);

  useEffect(() => {
    loadUsers(1, debouncedSearch, status, sort);
  }, [debouncedSearch, status, sort]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadUsers(1);
  };

  const handleSort = (column: string) => {
    setSort((prev) => ({
      sortBy: column,
      sortDir: prev.sortBy === column && prev.sortDir === 'asc' ? 'desc' : 'asc',
    }));
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sort.sortBy !== column) return <span style={{ opacity: 0.3 }}> ↕</span>;
    return <span>{sort.sortDir === 'asc' ? ' ↑' : ' ↓'}</span>;
  };

  const exportCsv = () => {
    const headers = ['Name', 'Email', 'Circles', 'Status', 'Last Login', 'Joined'];
    const rows = users.map((u) => [
      u.name,
      u.email,
      u.circle_count,
      u.suspended_at ? 'Suspended' : u.is_active ? 'Active' : 'Inactive',
      u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '-',
      u.created_at ? new Date(u.created_at).toLocaleDateString() : '-',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (!createForm.name.trim() || !createForm.email.trim()) {
      setCreateError('Name and email are required.');
      return;
    }
    setIsCreating(true);
    const result = await api.createUser({
      name: createForm.name.trim(),
      email: createForm.email.trim(),
      phone: createForm.phone.trim() || undefined,
    });
    setIsCreating(false);
    if (result.success) {
      setShowCreateModal(false);
      setCreateForm({ name: '', email: '', phone: '' });
      loadUsers(1);
    } else {
      setCreateError(result.error || 'Failed to create user.');
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const sortableHeader = (label: string, column: string) => (
    <th
      onClick={() => handleSort(column)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {label}<SortIcon column={column} />
    </th>
  );

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Users</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={exportCsv} disabled={users.length === 0}>
            Export CSV
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            + Create User
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '200px' }}>
            <label className="form-label">Search</label>
            <input
              type="text"
              className="form-input"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Status</label>
            <select
              className="form-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ minWidth: '150px' }}
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary">Search</button>
        </form>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : loadError ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--error, #e53e3e)' }}>
            <p>{loadError}</p>
            <button className="btn btn-secondary" onClick={() => loadUsers(1, debouncedSearch, status, sort)} style={{ marginTop: '1rem' }}>
              Retry
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <p>No users found</p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    {sortableHeader('Name', 'name')}
                    {sortableHeader('Email', 'email')}
                    <th>Circles</th>
                    {sortableHeader('Status', 'status')}
                    {sortableHeader('Last Login', 'last_login_at')}
                    {sortableHeader('Joined', 'created_at')}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td style={{ fontWeight: 500 }}>{user.name}</td>
                      <td>{user.email}</td>
                      <td>{user.circle_count}</td>
                      <td>
                        {user.suspended_at ? (
                          <span className="badge badge-error">Suspended</span>
                        ) : user.is_active ? (
                          <span className="badge badge-success">Active</span>
                        ) : (
                          <span className="badge">Inactive</span>
                        )}
                      </td>
                      <td>{formatDate(user.last_login_at)}</td>
                      <td>{formatDate(user.created_at)}</td>
                      <td>
                        <button
                          onClick={() => navigate(`/users/${user.id}`)}
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

            <div className="pagination">
              <div className="pagination-info">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </div>
              <div className="pagination-buttons">
                <button
                  className="btn btn-sm btn-secondary"
                  disabled={pagination.page <= 1}
                  onClick={() => loadUsers(pagination.page - 1, debouncedSearch, status, sort)}
                >
                  Previous
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => loadUsers(pagination.page + 1, debouncedSearch, status, sort)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
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
            <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Create User</h2>
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
                <label className="form-label">Phone</label>
                <input
                  type="tel"
                  className="form-input"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  placeholder="Optional"
                />
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
                  {isCreating ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

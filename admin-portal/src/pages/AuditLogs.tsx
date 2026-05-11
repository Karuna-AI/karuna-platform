import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

type TabType = 'user' | 'admin';

const PAGE_LIMIT = 50;

export default function AuditLogs() {
  const [activeTab, setActiveTab] = useState<TabType>('user');
  const [logs, setLogs] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadLogs = useCallback(async (currentPage: number, tab: TabType, action: string) => {
    setIsLoading(true);
    const params = { page: currentPage, limit: PAGE_LIMIT, action: action || undefined };
    const result = tab === 'user'
      ? await api.getAuditLogs(params)
      : await api.getAdminAuditLogs(params);

    if (result.success) {
      setLogs(result.data.logs);
      const p = result.data.pagination;
      if (p) {
        setTotalPages(p.pages ?? Math.ceil(p.total / PAGE_LIMIT));
        setTotal(p.total ?? 0);
      } else {
        // Fallback: use page-size heuristic when API doesn't return pagination meta
        setTotalPages(result.data.logs.length < PAGE_LIMIT ? currentPage : currentPage + 1);
        setTotal(0);
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadLogs(page, activeTab, actionFilter);
  }, [page, activeTab, actionFilter, loadLogs]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setPage(1);
    setActionFilter('');
  };

  const handleFilterChange = (action: string) => {
    setActionFilter(action);
    setPage(1);
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();

  const exportCsv = () => {
    const headers = activeTab === 'admin'
      ? ['Timestamp', 'Admin', 'Action', 'Resource Type', 'IP Address']
      : ['Timestamp', 'Action', 'Category', 'Description'];
    const rows = logs.map((log) => activeTab === 'admin'
      ? [formatDate(log.created_at), log.admin_email, log.action, log.resource_type || '', log.ip_address || '']
      : [formatDate(log.created_at), log.action, log.category || '', log.description || '']);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const paginationStart = (page - 1) * PAGE_LIMIT + 1;
  const paginationEnd = Math.min(page * PAGE_LIMIT, total || page * PAGE_LIMIT);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Audit Logs</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={exportCsv} className="btn btn-secondary" disabled={logs.length === 0}>
            Export CSV
          </button>
          <button onClick={() => loadLogs(page, activeTab, actionFilter)} className="btn btn-secondary">
            Refresh
          </button>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'user' ? 'active' : ''}`}
          onClick={() => handleTabChange('user')}
        >
          User Activity
        </button>
        <button
          className={`tab ${activeTab === 'admin' ? 'active' : ''}`}
          onClick={() => handleTabChange('admin')}
        >
          Admin Actions
        </button>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: '200px' }}>
            <label className="form-label">Filter by Action</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. login, update_setting..."
              value={actionFilter}
              onChange={(e) => handleFilterChange(e.target.value)}
            />
          </div>
          {actionFilter && (
            <button
              className="btn btn-secondary"
              onClick={() => handleFilterChange('')}
              style={{ marginBottom: '0' }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📜</div>
            <p>No audit logs found</p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    {activeTab === 'admin' ? (
                      <>
                        <th>Admin</th>
                        <th>Action</th>
                        <th>Resource</th>
                        <th>IP Address</th>
                      </>
                    ) : (
                      <>
                        <th>Action</th>
                        <th>Category</th>
                        <th>Description</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</td>
                      {activeTab === 'admin' ? (
                        <>
                          <td>{log.admin_email}</td>
                          <td><span className="badge">{log.action}</span></td>
                          <td>
                            {log.resource_type && (
                              <span style={{ color: 'var(--text-muted)' }}>{log.resource_type}</span>
                            )}
                          </td>
                          <td style={{ color: 'var(--text-muted)' }}>{log.ip_address || '-'}</td>
                        </>
                      ) : (
                        <>
                          <td><span className="badge">{log.action}</span></td>
                          <td>{log.category}</td>
                          <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {log.description || '-'}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <div className="pagination-info">
                {total > 0
                  ? `Showing ${paginationStart}–${paginationEnd} of ${total}`
                  : `Page ${page}`}
              </div>
              <div className="pagination-buttons">
                <button
                  className="btn btn-sm btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

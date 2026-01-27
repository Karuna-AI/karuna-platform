import { useState, useEffect } from 'react';
import api from '../services/api';

type TabType = 'user' | 'admin';

export default function AuditLogs() {
  const [activeTab, setActiveTab] = useState<TabType>('user');
  const [logs, setLogs] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 100 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, [activeTab, pagination.page]);

  const loadLogs = async () => {
    setIsLoading(true);
    const result = activeTab === 'user'
      ? await api.getAuditLogs({ page: pagination.page, limit: pagination.limit })
      : await api.getAdminAuditLogs({ page: pagination.page, limit: pagination.limit });

    if (result.success) {
      setLogs(result.data.logs);
    }
    setIsLoading(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Audit Logs</h1>
        <button onClick={loadLogs} className="btn btn-secondary">Refresh</button>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'user' ? 'active' : ''}`}
          onClick={() => { setActiveTab('user'); setPagination({ ...pagination, page: 1 }); }}
        >
          User Activity
        </button>
        <button
          className={`tab ${activeTab === 'admin' ? 'active' : ''}`}
          onClick={() => { setActiveTab('admin'); setPagination({ ...pagination, page: 1 }); }}
        >
          Admin Actions
        </button>
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
                          <td>
                            <span className="badge">{log.action}</span>
                          </td>
                          <td>
                            {log.resource_type && (
                              <span style={{ color: 'var(--text-muted)' }}>
                                {log.resource_type}
                              </span>
                            )}
                          </td>
                          <td style={{ color: 'var(--text-muted)' }}>{log.ip_address || '-'}</td>
                        </>
                      ) : (
                        <>
                          <td>
                            <span className="badge">{log.action}</span>
                          </td>
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
                Page {pagination.page}
              </div>
              <div className="pagination-buttons">
                <button
                  className="btn btn-sm btn-secondary"
                  disabled={pagination.page <= 1}
                  onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                >
                  Previous
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  disabled={logs.length < pagination.limit}
                  onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
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

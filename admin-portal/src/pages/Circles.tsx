import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function Circles() {
  const [circles, setCircles] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, limit: 50, total: 0 });
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadCircles();
  }, [pagination.page]);

  const loadCircles = async () => {
    setIsLoading(true);
    const result = await api.getCircles({
      page: pagination.page,
      limit: pagination.limit,
      search: search || undefined,
    });
    if (result.success) {
      setCircles(result.data.circles);
      setPagination(result.data.pagination);
    }
    setIsLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination({ ...pagination, page: 1 });
    loadCircles();
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Care Circles</h1>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
            <label className="form-label">Search</label>
            <input
              type="text"
              className="form-input"
              placeholder="Search by circle or recipient name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary">Search</button>
        </form>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : circles.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔵</div>
            <p>No care circles found</p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Circle Name</th>
                    <th>Care Recipient</th>
                    <th>Owner</th>
                    <th>Members</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {circles.map((circle) => (
                    <tr key={circle.id}>
                      <td style={{ fontWeight: 500 }}>{circle.name}</td>
                      <td>{circle.care_recipient_name}</td>
                      <td>{circle.owner_name || '-'}</td>
                      <td>{circle.member_count}</td>
                      <td>
                        {circle.is_active ? (
                          <span className="badge badge-success">Active</span>
                        ) : (
                          <span className="badge">Inactive</span>
                        )}
                      </td>
                      <td>{formatDate(circle.created_at)}</td>
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

            <div className="pagination">
              <div className="pagination-info">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
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
                  disabled={pagination.page >= pagination.pages}
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

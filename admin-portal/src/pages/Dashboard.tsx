import { useState, useEffect } from 'react';
import api from '../services/api';

export default function Dashboard() {
  const [metrics, setMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    const result = await api.getDashboardMetrics();
    if (result.success) {
      setMetrics(result.data);
    }
    setIsLoading(false);
  };

  if (isLoading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <button onClick={loadMetrics} className="btn btn-secondary">
          Refresh
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Users</div>
          <div className="stat-value">{metrics?.users?.total || 0}</div>
          <div className="stat-change positive">
            +{metrics?.users?.new_last_month || 0} this month
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Active Users</div>
          <div className="stat-value">{metrics?.users?.active || 0}</div>
          <div className="stat-change">
            {metrics?.users?.active_last_week || 0} active this week
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Care Circles</div>
          <div className="stat-value">{metrics?.circles?.total || 0}</div>
          <div className="stat-change">
            ~{Math.round(metrics?.circles?.avg_members || 0)} avg members
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Active Alerts</div>
          <div className="stat-value" style={{ color: metrics?.alerts?.active > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {metrics?.alerts?.active || 0}
          </div>
          <div className="stat-change" style={{ color: 'var(--error)' }}>
            {metrics?.alerts?.critical || 0} critical
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Activity Overview</h3>
          </div>
          <div className="detail-grid">
            <div className="detail-item">
              <div className="detail-label">Activities (24h)</div>
              <div className="detail-value">{metrics?.activity?.total_activities || 0}</div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Active Circles (24h)</div>
              <div className="detail-value">{metrics?.activity?.active_circles || 0}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Alert Summary</h3>
          </div>
          <div className="detail-grid">
            <div className="detail-item">
              <div className="detail-label">Critical</div>
              <div className="detail-value" style={{ color: 'var(--error)' }}>{metrics?.alerts?.critical || 0}</div>
            </div>
            <div className="detail-item">
              <div className="detail-label">High Priority</div>
              <div className="detail-value" style={{ color: 'var(--warning)' }}>{metrics?.alerts?.high || 0}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <h3 className="card-title">Quick Actions</h3>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <a href="/users" className="btn btn-secondary">Manage Users</a>
          <a href="/circles" className="btn btn-secondary">View Circles</a>
          <a href="/feature-flags" className="btn btn-secondary">Feature Flags</a>
          <a href="/audit-logs" className="btn btn-secondary">Audit Logs</a>
        </div>
      </div>

      {metrics?.timestamp && (
        <div style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Last updated: {new Date(metrics.timestamp).toLocaleString()}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import api from '../services/api';

const REFRESH_INTERVAL_MS = 30_000;

export default function Dashboard() {
  const [metrics, setMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(30);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadMetrics = async () => {
    setError(null);
    const result = await api.getDashboardMetrics();
    if (result.success) {
      setMetrics(result.data);
    } else {
      setError(result.error || 'Failed to load metrics');
    }
    setIsLoading(false);
  };

  const startRefreshCycle = () => {
    setSecondsUntilRefresh(30);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setSecondsUntilRefresh((s) => (s <= 1 ? 30 : s - 1));
    }, 1000);
  };

  const handleRefresh = () => {
    loadMetrics();
    startRefreshCycle();
  };

  useEffect(() => {
    loadMetrics();
    startRefreshCycle();
    intervalRef.current = setInterval(handleRefresh, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  if (isLoading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Refreshes in {secondsUntilRefresh}s
          </span>
          <button onClick={handleRefresh} className="btn btn-secondary">
            Refresh Now
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>
          {error} — <button className="btn-link" onClick={handleRefresh}>Retry</button>
        </div>
      )}

      {metrics && (
        <>
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
        </>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';

interface AlertSummary {
  total_alerts: string;
  active_alerts: string;
  acknowledged_alerts: string;
  resolved_alerts: string;
  critical_active: string;
  high_active: string;
  alerts_today: string;
  alerts_this_week: string;
}

interface AlertBySeverity {
  severity: string;
  total: string;
  active: string;
}

interface AlertByType {
  alert_type: string;
  total: string;
  active: string;
}

interface RecentAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  status: string;
  created_at: string;
  circle_name: string;
  care_recipient_name: string;
}

interface TopCircle {
  id: string;
  name: string;
  care_recipient_name: string;
  total_alerts: string;
  active_alerts: string;
}

interface Alert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  status: string;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  circle_name: string;
  care_recipient_name: string;
  acknowledged_by_name: string | null;
}

export default function HealthAlerts() {
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [bySeverity, setBySeverity] = useState<AlertBySeverity[]>([]);
  const [byType, setByType] = useState<AlertByType[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<RecentAlert[]>([]);
  const [topCircles, setTopCircles] = useState<TopCircle[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'alerts'>('overview');
  const [filters, setFilters] = useState({
    status: '',
    severity: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'alerts') {
      loadAlerts();
    }
  }, [activeTab, filters]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.get('/health-alerts/overview');
      setSummary(res.data.summary);
      setBySeverity(res.data.bySeverity);
      setByType(res.data.byType);
      setRecentAlerts(res.data.recentAlerts);
      setTopCircles(res.data.topCircles);
    } catch (error) {
      console.error('Failed to load health alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAlerts = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.severity) params.append('severity', filters.severity);

      const res = await adminAPI.get(`/health-alerts?${params.toString()}`);
      setAlerts(res.data.alerts);
    } catch (error) {
      console.error('Failed to load alerts:', error);
    }
  };

  const getSeverityClass = (severity: string) => {
    switch (severity) {
      case 'critical': return 'severity-critical';
      case 'high': return 'severity-high';
      case 'medium': return 'severity-medium';
      case 'low': return 'severity-low';
      default: return '';
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'active': return 'status-active';
      case 'acknowledged': return 'status-acknowledged';
      case 'resolved': return 'status-resolved';
      default: return '';
    }
  };

  if (loading) {
    return <div className="loading">Loading health alerts...</div>;
  }

  return (
    <>
      <div className="page-header">
        <h1>Health Alerts Dashboard</h1>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveTab('alerts')}
        >
          All Alerts
        </button>
      </div>

      {activeTab === 'overview' && summary && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Active Alerts</h3>
              <div className="stat-value">{summary.active_alerts}</div>
              <div className="stat-detail">{summary.critical_active} critical, {summary.high_active} high</div>
            </div>
            <div className="stat-card">
              <h3>Alerts Today</h3>
              <div className="stat-value">{summary.alerts_today}</div>
              <div className="stat-detail">{summary.alerts_this_week} this week</div>
            </div>
            <div className="stat-card">
              <h3>Acknowledged</h3>
              <div className="stat-value">{summary.acknowledged_alerts}</div>
              <div className="stat-detail">Waiting for resolution</div>
            </div>
            <div className="stat-card">
              <h3>Total Alerts</h3>
              <div className="stat-value">{summary.total_alerts}</div>
              <div className="stat-detail">{summary.resolved_alerts} resolved</div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <h2>Alerts by Severity</h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Active</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {bySeverity.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="empty">No alerts</td>
                    </tr>
                  ) : (
                    bySeverity.map((item) => (
                      <tr key={item.severity}>
                        <td>
                          <span className={`badge ${getSeverityClass(item.severity)}`}>
                            {item.severity.toUpperCase()}
                          </span>
                        </td>
                        <td>{item.active}</td>
                        <td>{item.total}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h2>Alerts by Type</h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Active</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byType.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="empty">No alerts</td>
                    </tr>
                  ) : (
                    byType.map((item) => (
                      <tr key={item.alert_type}>
                        <td>{item.alert_type.replace(/_/g, ' ')}</td>
                        <td>{item.active}</td>
                        <td>{item.total}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <h2>Critical & High Priority Alerts</h2>
              {recentAlerts.length === 0 ? (
                <p className="empty">No critical or high priority alerts</p>
              ) : (
                <div className="alert-list">
                  {recentAlerts.map((alert) => (
                    <div key={alert.id} className="alert-item">
                      <div className="alert-header">
                        <span className={`badge ${getSeverityClass(alert.severity)}`}>
                          {alert.severity.toUpperCase()}
                        </span>
                        <span className="alert-time">
                          {new Date(alert.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="alert-title">{alert.title}</div>
                      <div className="alert-meta">
                        {alert.care_recipient_name} ({alert.circle_name})
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <h2>Circles with Most Alerts</h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Care Recipient</th>
                    <th>Circle</th>
                    <th>Active</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {topCircles.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty">No data</td>
                    </tr>
                  ) : (
                    topCircles.map((circle) => (
                      <tr key={circle.id}>
                        <td>{circle.care_recipient_name}</td>
                        <td>{circle.name}</td>
                        <td>
                          <strong>{circle.active_alerts}</strong>
                        </td>
                        <td>{circle.total_alerts}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'alerts' && (
        <div className="card">
          <div className="filters">
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
            <select
              value={filters.severity}
              onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Title</th>
                <th>Care Recipient</th>
                <th>Circle</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">No alerts found</td>
                </tr>
              ) : (
                alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>{new Date(alert.created_at).toLocaleString()}</td>
                    <td>
                      <span className={`badge ${getSeverityClass(alert.severity)}`}>
                        {alert.severity.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${getStatusClass(alert.status)}`}>
                        {alert.status}
                      </span>
                    </td>
                    <td>{alert.title}</td>
                    <td>{alert.care_recipient_name}</td>
                    <td>{alert.circle_name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
        }

        .tab {
          padding: 0.75rem 1.5rem;
          border: none;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          cursor: pointer;
          border-radius: 8px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .tab:hover {
          background: var(--bg-hover);
        }

        .tab.active {
          background: var(--primary);
          color: white;
        }

        .grid-2 {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
          margin-bottom: 1.5rem;
        }

        @media (max-width: 1024px) {
          .grid-2 {
            grid-template-columns: 1fr;
          }
        }

        .filters {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .filters select {
          padding: 0.5rem 1rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg-secondary);
        }

        .severity-critical {
          background: #dc2626;
          color: white;
        }

        .severity-high {
          background: #ea580c;
          color: white;
        }

        .severity-medium {
          background: #ca8a04;
          color: white;
        }

        .severity-low {
          background: #16a34a;
          color: white;
        }

        .status-active {
          background: #dc2626;
          color: white;
        }

        .status-acknowledged {
          background: #2563eb;
          color: white;
        }

        .status-resolved {
          background: #16a34a;
          color: white;
        }

        .alert-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .alert-item {
          padding: 1rem;
          background: var(--bg-secondary);
          border-radius: 8px;
          border-left: 4px solid var(--border);
        }

        .alert-item:has(.severity-critical) {
          border-left-color: #dc2626;
        }

        .alert-item:has(.severity-high) {
          border-left-color: #ea580c;
        }

        .alert-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .alert-time {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .alert-title {
          font-weight: 500;
          margin-bottom: 0.25rem;
        }

        .alert-meta {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .empty {
          text-align: center;
          color: var(--text-secondary);
          padding: 2rem;
        }

        td.empty {
          padding: 2rem;
        }
      `}</style>
    </>
  );
}

import { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';

interface UsageSummary {
  total_requests: string;
  total_prompt_tokens: string;
  total_completion_tokens: string;
  total_tokens: string;
  total_cost: string;
  avg_latency: string;
  successful_requests: string;
  failed_requests: string;
  success_rate: string;
}

interface UsageByModel {
  model: string;
  requests: string;
  tokens: string;
  cost: string;
  avg_latency: string;
}

interface UsageByType {
  request_type: string;
  requests: string;
  tokens: string;
  cost: string;
  avg_latency: string;
}

interface DailyUsage {
  date: string;
  requests: string;
  tokens: string;
  cost: string;
}

interface UsageLog {
  id: string;
  request_type: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: string;
  latency_ms: number;
  success: boolean;
  error_message: string | null;
  created_at: string;
  user_name: string | null;
  circle_name: string | null;
}

export default function AIUsageAnalytics() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [byModel, setByModel] = useState<UsageByModel[]>([]);
  const [byType, setByType] = useState<UsageByType[]>([]);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'logs'>('overview');

  useEffect(() => {
    loadData();
  }, [days]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryRes, logsRes] = await Promise.all([
        adminAPI.get(`/ai-usage/summary?days=${days}`),
        adminAPI.get('/ai-usage/logs?limit=100'),
      ]);
      setSummary(summaryRes.data.summary);
      setByModel(summaryRes.data.byModel);
      setByType(summaryRes.data.byType);
      setDailyUsage(summaryRes.data.dailyUsage);
      setLogs(logsRes.data.logs);
    } catch (error) {
      console.error('Failed to load AI usage data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCost = (cost: string | number) => {
    const num = typeof cost === 'string' ? parseFloat(cost) : cost;
    return `$${num.toFixed(4)}`;
  };

  const formatNumber = (num: string | number) => {
    const n = typeof num === 'string' ? parseInt(num) : num;
    return n.toLocaleString();
  };

  const formatLatency = (ms: string | number) => {
    const n = typeof ms === 'string' ? parseFloat(ms) : ms;
    return `${Math.round(n)}ms`;
  };

  if (loading) {
    return <div className="loading">Loading AI usage analytics...</div>;
  }

  return (
    <>
      <div className="page-header">
        <h1>AI Usage Analytics</h1>
        <div className="page-actions">
          <select value={days} onChange={(e) => setDays(parseInt(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          Request Logs
        </button>
      </div>

      {activeTab === 'overview' && summary && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Total Requests</h3>
              <div className="stat-value">{formatNumber(summary.total_requests)}</div>
              <div className="stat-detail">{summary.success_rate}% success rate</div>
            </div>
            <div className="stat-card">
              <h3>Total Tokens</h3>
              <div className="stat-value">{formatNumber(summary.total_tokens)}</div>
              <div className="stat-detail">
                {formatNumber(summary.total_prompt_tokens)} prompt / {formatNumber(summary.total_completion_tokens)} completion
              </div>
            </div>
            <div className="stat-card">
              <h3>Total Cost</h3>
              <div className="stat-value">{formatCost(summary.total_cost || 0)}</div>
              <div className="stat-detail">Estimated OpenAI cost</div>
            </div>
            <div className="stat-card">
              <h3>Avg Latency</h3>
              <div className="stat-value">{formatLatency(summary.avg_latency || 0)}</div>
              <div className="stat-detail">Response time</div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <h2>Usage by Model</h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Requests</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                    <th>Avg Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty">No data available</td>
                    </tr>
                  ) : (
                    byModel.map((model) => (
                      <tr key={model.model}>
                        <td><code>{model.model}</code></td>
                        <td>{formatNumber(model.requests)}</td>
                        <td>{formatNumber(model.tokens || 0)}</td>
                        <td>{formatCost(model.cost || 0)}</td>
                        <td>{formatLatency(model.avg_latency || 0)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h2>Usage by Type</h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Requests</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                    <th>Avg Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {byType.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty">No data available</td>
                    </tr>
                  ) : (
                    byType.map((type) => (
                      <tr key={type.request_type}>
                        <td>
                          <span className={`badge badge-${type.request_type}`}>
                            {type.request_type.toUpperCase()}
                          </span>
                        </td>
                        <td>{formatNumber(type.requests)}</td>
                        <td>{formatNumber(type.tokens || 0)}</td>
                        <td>{formatCost(type.cost || 0)}</td>
                        <td>{formatLatency(type.avg_latency || 0)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Daily Usage Trend</h2>
            {dailyUsage.length === 0 ? (
              <p className="empty">No usage data available for this period</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Requests</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyUsage.map((day) => (
                    <tr key={day.date}>
                      <td>{new Date(day.date).toLocaleDateString()}</td>
                      <td>{formatNumber(day.requests)}</td>
                      <td>{formatNumber(day.tokens || 0)}</td>
                      <td>{formatCost(day.cost || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeTab === 'logs' && (
        <div className="card">
          <h2>Recent API Requests</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Model</th>
                <th>Tokens</th>
                <th>Cost</th>
                <th>Latency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">No request logs available</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString()}</td>
                    <td>
                      <span className={`badge badge-${log.request_type}`}>
                        {log.request_type.toUpperCase()}
                      </span>
                    </td>
                    <td><code>{log.model}</code></td>
                    <td>{formatNumber(log.total_tokens)}</td>
                    <td>{formatCost(log.estimated_cost_usd)}</td>
                    <td>{formatLatency(log.latency_ms)}</td>
                    <td>
                      <span className={`badge ${log.success ? 'badge-success' : 'badge-danger'}`}>
                        {log.success ? 'Success' : 'Failed'}
                      </span>
                    </td>
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

        .badge-chat {
          background: #3b82f6;
          color: white;
        }

        .badge-stt {
          background: #8b5cf6;
          color: white;
        }

        .badge-tts {
          background: #ec4899;
          color: white;
        }

        .badge-success {
          background: #22c55e;
          color: white;
        }

        .badge-danger {
          background: #ef4444;
          color: white;
        }

        code {
          background: var(--bg-secondary);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.85rem;
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

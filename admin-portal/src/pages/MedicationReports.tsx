import { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';

interface MedicationSummary {
  total_doses: string;
  taken: string;
  missed: string;
  skipped: string;
  pending: string;
  unique_medications: string;
  circles_with_medications: string;
  adherence_rate: string;
}

interface AdherenceByCircle {
  id: string;
  name: string;
  care_recipient_name: string;
  total_doses: string;
  taken: string;
  missed: string;
  adherence_rate: string;
}

interface TopMedication {
  name: string;
  dosage: string;
  circles_using: string;
  total_doses: string;
  adherence_rate: string;
}

interface MissedDose {
  id: string;
  medication_name: string;
  dosage: string;
  scheduled_time: string;
  circle_name: string;
  care_recipient_name: string;
}

interface DailyAdherence {
  date: string;
  total: string;
  taken: string;
  missed: string;
  adherence_rate: string;
}

interface HourlyPattern {
  hour: string;
  total: string;
  taken: string;
  missed: string;
}

export default function MedicationReports() {
  const [summary, setSummary] = useState<MedicationSummary | null>(null);
  const [adherenceByCircle, setAdherenceByCircle] = useState<AdherenceByCircle[]>([]);
  const [topMedications, setTopMedications] = useState<TopMedication[]>([]);
  const [missedDoses, setMissedDoses] = useState<MissedDose[]>([]);
  const [dailyAdherence, setDailyAdherence] = useState<DailyAdherence[]>([]);
  const [hourlyPattern, setHourlyPattern] = useState<HourlyPattern[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'missed'>('overview');

  useEffect(() => {
    loadData();
  }, [days]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewRes, trendsRes] = await Promise.all([
        adminAPI.get(`/medications/overview?days=${days}`),
        adminAPI.get(`/medications/trends?days=${days}`),
      ]);

      setSummary(overviewRes.data.summary);
      setAdherenceByCircle(overviewRes.data.adherenceByCircle);
      setTopMedications(overviewRes.data.topMedications);
      setMissedDoses(overviewRes.data.missedDoses);
      setDailyAdherence(trendsRes.data.dailyAdherence);
      setHourlyPattern(trendsRes.data.hourlyPattern);
    } catch (error) {
      console.error('Failed to load medication data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAdherenceClass = (rate: string | null) => {
    if (!rate) return 'adherence-na';
    const num = parseFloat(rate);
    if (num >= 90) return 'adherence-good';
    if (num >= 70) return 'adherence-warning';
    return 'adherence-poor';
  };

  const formatHour = (hour: string) => {
    const h = parseInt(hour);
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  };

  if (loading) {
    return <div className="loading">Loading medication reports...</div>;
  }

  return (
    <>
      <div className="page-header">
        <h1>Medication Reports</h1>
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
          className={`tab ${activeTab === 'trends' ? 'active' : ''}`}
          onClick={() => setActiveTab('trends')}
        >
          Trends
        </button>
        <button
          className={`tab ${activeTab === 'missed' ? 'active' : ''}`}
          onClick={() => setActiveTab('missed')}
        >
          Missed Doses
        </button>
      </div>

      {activeTab === 'overview' && summary && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Adherence Rate</h3>
              <div className={`stat-value ${getAdherenceClass(summary.adherence_rate)}`}>
                {summary.adherence_rate}%
              </div>
              <div className="stat-detail">
                {summary.taken} taken of {parseInt(summary.taken) + parseInt(summary.missed)} completed
              </div>
            </div>
            <div className="stat-card">
              <h3>Total Doses</h3>
              <div className="stat-value">{parseInt(summary.total_doses).toLocaleString()}</div>
              <div className="stat-detail">{summary.pending} pending</div>
            </div>
            <div className="stat-card">
              <h3>Missed Doses</h3>
              <div className="stat-value missed">{summary.missed}</div>
              <div className="stat-detail">{summary.skipped} skipped</div>
            </div>
            <div className="stat-card">
              <h3>Active Medications</h3>
              <div className="stat-value">{summary.unique_medications}</div>
              <div className="stat-detail">Across {summary.circles_with_medications} care circles</div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <h2>Adherence by Care Recipient</h2>
              <p className="card-subtitle">Sorted by lowest adherence first</p>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Care Recipient</th>
                    <th>Taken</th>
                    <th>Missed</th>
                    <th>Adherence</th>
                  </tr>
                </thead>
                <tbody>
                  {adherenceByCircle.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty">No medication data</td>
                    </tr>
                  ) : (
                    adherenceByCircle.map((circle) => (
                      <tr key={circle.id}>
                        <td>
                          <div>{circle.care_recipient_name}</div>
                          <div className="text-small">{circle.name}</div>
                        </td>
                        <td>{circle.taken}</td>
                        <td>{circle.missed}</td>
                        <td>
                          <span className={`badge ${getAdherenceClass(circle.adherence_rate)}`}>
                            {circle.adherence_rate ? `${circle.adherence_rate}%` : 'N/A'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h2>Most Common Medications</h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Medication</th>
                    <th>Dosage</th>
                    <th>Users</th>
                    <th>Adherence</th>
                  </tr>
                </thead>
                <tbody>
                  {topMedications.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty">No medications</td>
                    </tr>
                  ) : (
                    topMedications.map((med, index) => (
                      <tr key={index}>
                        <td><strong>{med.name}</strong></td>
                        <td>{med.dosage}</td>
                        <td>{med.circles_using}</td>
                        <td>
                          <span className={`badge ${getAdherenceClass(med.adherence_rate)}`}>
                            {med.adherence_rate ? `${med.adherence_rate}%` : 'N/A'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'trends' && (
        <>
          <div className="card">
            <h2>Daily Adherence Trend</h2>
            {dailyAdherence.length === 0 ? (
              <p className="empty">No data available for this period</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Taken</th>
                    <th>Missed</th>
                    <th>Adherence</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyAdherence.map((day) => (
                    <tr key={day.date}>
                      <td>{new Date(day.date).toLocaleDateString()}</td>
                      <td>{day.total}</td>
                      <td className="text-success">{day.taken}</td>
                      <td className="text-danger">{day.missed}</td>
                      <td>
                        <span className={`badge ${getAdherenceClass(day.adherence_rate)}`}>
                          {day.adherence_rate ? `${day.adherence_rate}%` : 'N/A'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h2>Hourly Medication Pattern</h2>
            <p className="card-subtitle">When are doses most commonly missed?</p>
            {hourlyPattern.length === 0 ? (
              <p className="empty">No data available</p>
            ) : (
              <div className="hourly-grid">
                {hourlyPattern.map((hour) => {
                  const total = parseInt(hour.total);
                  const missed = parseInt(hour.missed);
                  const missRate = total > 0 ? (missed / total * 100).toFixed(0) : '0';
                  return (
                    <div
                      key={hour.hour}
                      className={`hour-block ${parseInt(missRate) > 30 ? 'high-miss' : parseInt(missRate) > 15 ? 'med-miss' : ''}`}
                    >
                      <div className="hour-label">{formatHour(hour.hour)}</div>
                      <div className="hour-stats">
                        <span className="text-success">{hour.taken}</span>
                        <span className="divider">/</span>
                        <span className="text-danger">{hour.missed}</span>
                      </div>
                      <div className="hour-rate">{missRate}% missed</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'missed' && (
        <div className="card">
          <h2>Recent Missed Doses</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Scheduled Time</th>
                <th>Medication</th>
                <th>Dosage</th>
                <th>Care Recipient</th>
                <th>Circle</th>
              </tr>
            </thead>
            <tbody>
              {missedDoses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">No missed doses in this period</td>
                </tr>
              ) : (
                missedDoses.map((dose) => (
                  <tr key={dose.id}>
                    <td>{new Date(dose.scheduled_time).toLocaleString()}</td>
                    <td><strong>{dose.medication_name}</strong></td>
                    <td>{dose.dosage}</td>
                    <td>{dose.care_recipient_name}</td>
                    <td>{dose.circle_name}</td>
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

        .card-subtitle {
          color: var(--text-secondary);
          font-size: 0.9rem;
          margin: -0.5rem 0 1rem 0;
        }

        .text-small {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .text-success {
          color: #16a34a;
        }

        .text-danger {
          color: #dc2626;
        }

        .stat-value.missed {
          color: #dc2626;
        }

        .adherence-good {
          background: #16a34a;
          color: white;
        }

        .adherence-warning {
          background: #ca8a04;
          color: white;
        }

        .adherence-poor {
          background: #dc2626;
          color: white;
        }

        .adherence-na {
          background: var(--bg-secondary);
          color: var(--text-secondary);
        }

        .hourly-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
          gap: 0.75rem;
        }

        .hour-block {
          padding: 0.75rem;
          background: var(--bg-secondary);
          border-radius: 8px;
          text-align: center;
          border: 2px solid transparent;
        }

        .hour-block.high-miss {
          border-color: #dc2626;
          background: rgba(220, 38, 38, 0.1);
        }

        .hour-block.med-miss {
          border-color: #ca8a04;
          background: rgba(202, 138, 4, 0.1);
        }

        .hour-label {
          font-weight: 600;
          margin-bottom: 0.25rem;
        }

        .hour-stats {
          font-size: 0.9rem;
        }

        .hour-stats .divider {
          margin: 0 0.25rem;
          color: var(--text-secondary);
        }

        .hour-rate {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
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

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import type { CareCircle, CareCircleMember, SyncData, CareCircleRole, VaultNote, DashboardData } from '../types';
import { AlertsPanel, HealthCard, AdherenceCard, ActivityMonitor } from '../components/dashboard';
import ErrorBoundary from '../components/ErrorBoundary';
import { useWebSocket } from '../hooks/useWebSocket';

type TabType = 'dashboard' | 'overview' | 'members' | 'vault' | 'notes';

export default function CareCircleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [circle, setCircle] = useState<CareCircle | null>(null);
  const [members, setMembers] = useState<CareCircleMember[]>([]);
  const [vaultData, setVaultData] = useState<SyncData | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [error, setError] = useState('');

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<CareCircleRole>('viewer');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  // Note modal state
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState<VaultNote['category']>('general');
  const [isAddingNote, setIsAddingNote] = useState(false);

  const currentMember = members.find((m) => m.userId === user?.id);
  const canInvite = currentMember?.permissions.canInviteMembers;
  const canAddNotes = currentMember?.permissions.canAddNotes;
  const canViewVault = currentMember?.permissions.canViewVault;
  const canViewSensitive = currentMember?.permissions.canViewSensitive;

  const { isConnected, subscribe } = useWebSocket(id);

  const loadDashboardData = useCallback(async () => {
    if (!id) return;
    setIsDashboardLoading(true);
    const result = await api.getDashboard(id);
    if (result.success && result.data) {
      setDashboardData(result.data);
    }
    setIsDashboardLoading(false);
  }, [id]);

  useEffect(() => {
    if (id) {
      loadCircleData();
    }
  }, [id]);

  // Auto-refresh dashboard: use WebSocket when connected, fall back to polling
  useEffect(() => {
    if (activeTab === 'dashboard' && id) {
      loadDashboardData();

      if (!isConnected) {
        // Fallback: poll every 30 seconds when WebSocket is not connected
        const interval = setInterval(loadDashboardData, 30000);
        return () => clearInterval(interval);
      }
    }
  }, [activeTab, id, loadDashboardData, isConnected]);

  // Subscribe to WebSocket events for real-time updates
  useEffect(() => {
    if (!isConnected) return;

    const unsubs = [
      subscribe('health_update', () => loadDashboardData()),
      subscribe('alert', () => loadDashboardData()),
      subscribe('activity_update', () => loadDashboardData()),
      subscribe('alert_acknowledged', () => loadDashboardData()),
    ];

    return () => unsubs.forEach(unsub => unsub());
  }, [isConnected, subscribe, loadDashboardData]);

  const loadCircleData = async () => {
    setIsLoading(true);
    const result = await api.getCareCircle(id!);
    if (result.success && result.data) {
      setCircle(result.data);
      setMembers(result.data.members || []);

      // Load vault data if user has permission
      const syncResult = await api.getSyncData(id!);
      if (syncResult.success && syncResult.data) {
        setVaultData(syncResult.data);
      }

      // Load dashboard data
      const dashResult = await api.getDashboard(id!);
      if (dashResult.success && dashResult.data) {
        setDashboardData(dashResult.data);
      }
    } else {
      setError(result.error || 'Failed to load care circle');
    }
    setIsLoading(false);
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    const result = await api.acknowledgeAlert(id!, alertId);
    if (result.success) {
      loadDashboardData();
    }
  };

  const handleDismissAlert = async (alertId: string) => {
    const result = await api.dismissAlert(id!, alertId);
    if (result.success) {
      loadDashboardData();
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    setIsInviting(true);

    const result = await api.inviteMember(id!, {
      email: inviteEmail,
      role: inviteRole,
    });

    if (result.success) {
      setInviteSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      setInviteRole('viewer');
    } else {
      setInviteError(result.error || 'Failed to send invitation');
    }

    setIsInviting(false);
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;

    const result = await api.removeMember(id!, memberId);
    if (result.success) {
      setMembers(members.filter((m) => m.id !== memberId));
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingNote(true);

    const result = await api.addNote(id!, {
      title: noteTitle,
      content: noteContent,
      category: noteCategory,
    });

    if (result.success && result.data) {
      if (vaultData) {
        setVaultData({
          ...vaultData,
          notes: [...vaultData.notes, result.data],
        });
      }
      setShowNoteModal(false);
      setNoteTitle('');
      setNoteContent('');
      setNoteCategory('general');
    }

    setIsAddingNote(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const maskSensitive = (value: string | undefined) => {
    if (!value) return '-';
    if (canViewSensitive) return value;
    return '••••' + value.slice(-4);
  };

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  if (error || !circle) {
    return (
      <div className="container" style={{ padding: '2rem' }}>
        <div className="alert alert-error">{error || 'Care circle not found'}</div>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '2rem 1rem' }}>
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => navigate('/')}
        style={{ marginBottom: '1rem' }}
      >
        ← Back to Dashboard
      </button>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ marginBottom: '0.25rem' }}>{circle.name}</h1>
            <p className="text-muted">Caring for {circle.elderlyName}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isConnected ? '#38a169' : '#a0aec0',
                display: 'inline-block',
              }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {isConnected ? 'Live updates' : 'Polling updates'}
              </span>
            </div>
          </div>
          {currentMember && (
            <span className={`badge badge-${currentMember.role}`}>
              {currentMember.role}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', flexWrap: 'wrap' }}>
        {(['dashboard', 'overview', 'members', 'vault', 'notes'] as TabType[]).map((tab) => (
          <button
            key={tab}
            className={`btn btn-sm ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab(tab)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            {tab === 'dashboard' && <span>📊</span>}
            {tab === 'overview' && <span>📋</span>}
            {tab === 'members' && <span>👥</span>}
            {tab === 'vault' && <span>🔒</span>}
            {tab === 'notes' && <span>📝</span>}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'dashboard' && dashboardData?.alerts.count ? (
              <span style={{
                background: 'var(--error)',
                color: 'white',
                borderRadius: '10px',
                padding: '0 6px',
                fontSize: '0.75rem',
                marginLeft: '4px',
              }}>
                {dashboardData.alerts.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {isDashboardLoading && !dashboardData && (
            <div className="loading">
              <div className="spinner" />
            </div>
          )}

          {dashboardData && (
            <>
              {/* Alerts Section - Show first if there are alerts */}
              {dashboardData.alerts.count > 0 && (
                <ErrorBoundary>
                  <AlertsPanel
                    alerts={dashboardData.alerts.active}
                    onAcknowledge={handleAcknowledgeAlert}
                    onDismiss={handleDismissAlert}
                  />
                </ErrorBoundary>
              )}

              {/* Quick Stats Row */}
              <div className="grid grid-4" style={{ gap: '1rem' }}>
                {/* Activity Status Card */}
                <div className="card" style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>
                      {dashboardData.activity.inactivityStatus === 'active' ? '🟢' :
                       dashboardData.activity.inactivityStatus === 'normal' ? '🔵' :
                       dashboardData.activity.inactivityStatus === 'concerning' ? '🟡' :
                       dashboardData.activity.inactivityStatus === 'alert' ? '🔴' : '⚪'}
                    </span>
                    <div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Activity</div>
                      <div style={{ fontWeight: '600' }}>
                        {dashboardData.activity.inactivityStatus === 'active' ? 'Active Now' :
                         dashboardData.activity.inactivityStatus === 'normal' ? 'Normal' :
                         dashboardData.activity.inactivityStatus === 'concerning' ? 'Concerning' :
                         dashboardData.activity.inactivityStatus === 'alert' ? 'Needs Attention' : 'Unknown'}
                      </div>
                    </div>
                  </div>
                  {dashboardData.activity.inactivityMinutes !== null && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Last active: {dashboardData.activity.inactivityMinutes < 60
                        ? `${dashboardData.activity.inactivityMinutes}m ago`
                        : `${Math.floor(dashboardData.activity.inactivityMinutes / 60)}h ago`}
                    </div>
                  )}
                </div>

                {/* Adherence Card */}
                <div className="card" style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>💊</span>
                    <div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Adherence</div>
                      <div style={{
                        fontWeight: '600',
                        color: dashboardData.adherence.today.rate >= 90 ? 'var(--success)' :
                               dashboardData.adherence.today.rate >= 70 ? 'var(--warning)' : 'var(--error)'
                      }}>
                        {dashboardData.adherence.today.rate}%
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {dashboardData.adherence.today.taken} taken, {dashboardData.adherence.today.missed} missed
                  </div>
                </div>

                {/* Check-in Response Rate */}
                <div className="card" style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>📱</span>
                    <div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Check-ins</div>
                      <div style={{
                        fontWeight: '600',
                        color: dashboardData.checkins.responseRate >= 80 ? 'var(--success)' :
                               dashboardData.checkins.responseRate >= 50 ? 'var(--warning)' : 'var(--error)'
                      }}>
                        {dashboardData.checkins.responseRate}%
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {dashboardData.checkins.responded}/{dashboardData.checkins.total} responded
                  </div>
                </div>

                {/* Alerts Count */}
                <div className="card" style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>🔔</span>
                    <div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Alerts</div>
                      <div style={{
                        fontWeight: '600',
                        color: dashboardData.alerts.count > 0 ? 'var(--error)' : 'var(--success)'
                      }}>
                        {dashboardData.alerts.count || 'None'}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {dashboardData.alerts.count > 0 ? 'Active alerts' : 'All clear'}
                  </div>
                </div>
              </div>

              {/* Detailed Cards Row */}
              <div className="grid grid-2" style={{ gap: '1.5rem' }}>
                {/* Health Vitals */}
                <ErrorBoundary>
                  <HealthCard readings={dashboardData.health.latest} />
                </ErrorBoundary>

                {/* Medication Adherence Detail */}
                <ErrorBoundary>
                  <AdherenceCard
                    data={dashboardData.adherence.today}
                    onViewDetails={() => setActiveTab('vault')}
                  />
                </ErrorBoundary>
              </div>

              {/* Activity Monitor */}
              <ErrorBoundary>
                <ActivityMonitor
                  lastActivity={dashboardData.activity.lastActivity}
                  inactivityMinutes={dashboardData.activity.inactivityMinutes}
                  inactivityStatus={dashboardData.activity.inactivityStatus}
                  checkinResponseRate={dashboardData.checkins.responseRate}
                />
              </ErrorBoundary>

              {/* No alerts message */}
              {dashboardData.alerts.count === 0 && (
                <ErrorBoundary>
                  <AlertsPanel
                    alerts={[]}
                    onAcknowledge={handleAcknowledgeAlert}
                    onDismiss={handleDismissAlert}
                  />
                </ErrorBoundary>
              )}

              {/* Last updated */}
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Last updated: {new Date(dashboardData.timestamp).toLocaleTimeString()}
                {isDashboardLoading && <span style={{ marginLeft: '0.5rem' }}>🔄</span>}
              </div>
            </>
          )}

          {!dashboardData && !isDashboardLoading && (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <h3 className="empty-state-title">No Dashboard Data</h3>
                <p className="text-muted">Data will appear when synced from the mobile app</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-3">
          <div className="card">
            <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>Members</h3>
            <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>{members.length}</p>
            <p className="text-muted">Active caregivers</p>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>Medications</h3>
            <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>{vaultData?.medications.length || 0}</p>
            <p className="text-muted">Being tracked</p>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>Appointments</h3>
            <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>
              {vaultData?.appointments.filter((a) => a.status === 'scheduled').length || 0}
            </p>
            <p className="text-muted">Upcoming</p>
          </div>
        </div>
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Members</h2>
            {canInvite && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowInviteModal(true)}>
                + Invite Member
              </button>
            )}
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>{member.name}</td>
                  <td>{member.email}</td>
                  <td>
                    <span className={`badge badge-${member.role}`}>{member.role}</span>
                  </td>
                  <td>{formatDate(member.joinedAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {currentMember?.permissions.canRemoveMembers &&
                      member.userId !== user?.id &&
                      member.role !== 'owner' && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          Remove
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Vault Tab */}
      {activeTab === 'vault' && canViewVault && vaultData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Medications */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>Medications</h3>
            {vaultData.medications.length === 0 ? (
              <p className="text-muted">No medications recorded</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Dosage</th>
                    <th>Frequency</th>
                    <th>Timing</th>
                  </tr>
                </thead>
                <tbody>
                  {vaultData.medications.map((med) => (
                    <tr key={med.id}>
                      <td><strong>{med.name}</strong></td>
                      <td>{med.dosage}</td>
                      <td>{med.frequency}</td>
                      <td>{med.timing.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Doctors */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>Doctors</h3>
            {vaultData.doctors.length === 0 ? (
              <p className="text-muted">No doctors recorded</p>
            ) : (
              <div className="grid grid-2">
                {vaultData.doctors.map((doc) => (
                  <div key={doc.id} style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                    <h4>{doc.name}</h4>
                    <p className="text-muted">{doc.specialty}</p>
                    {doc.hospital && <p>{doc.hospital}</p>}
                    {doc.phone && <p>Phone: {doc.phone}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Appointments */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>Upcoming Appointments</h3>
            {vaultData.appointments.filter((a) => a.status === 'scheduled').length === 0 ? (
              <p className="text-muted">No upcoming appointments</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Doctor</th>
                    <th>Purpose</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {vaultData.appointments
                    .filter((a) => a.status === 'scheduled')
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map((apt) => (
                      <tr key={apt.id}>
                        <td>{formatDate(apt.date)}</td>
                        <td>{apt.time}</td>
                        <td>{apt.doctorName}</td>
                        <td>{apt.purpose}</td>
                        <td>{apt.location || '-'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Contacts */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>Emergency Contacts</h3>
            {vaultData.contacts.filter((c) => c.isEmergency).length === 0 ? (
              <p className="text-muted">No emergency contacts recorded</p>
            ) : (
              <div className="grid grid-3">
                {vaultData.contacts
                  .filter((c) => c.isEmergency)
                  .map((contact) => (
                    <div key={contact.id} style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                      <h4>{contact.name}</h4>
                      <p className="text-muted">{contact.relationship}</p>
                      {contact.phone && <p>Phone: {contact.phone}</p>}
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Accounts (only if can view sensitive) */}
          {canViewSensitive && (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '1rem' }}>Accounts</h3>
              {vaultData.accounts.length === 0 ? (
                <p className="text-muted">No accounts recorded</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Account Number</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vaultData.accounts.map((account) => (
                      <tr key={account.id}>
                        <td><strong>{account.name}</strong></td>
                        <td>{account.type}</td>
                        <td>{maskSensitive(account.accountNumber)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'vault' && !canViewVault && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🔒</div>
            <h3 className="empty-state-title">Access Restricted</h3>
            <p className="text-muted">You don't have permission to view vault data</p>
          </div>
        </div>
      )}

      {/* Notes Tab */}
      {activeTab === 'notes' && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Care Notes</h2>
            {canAddNotes && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowNoteModal(true)}>
                + Add Note
              </button>
            )}
          </div>

          {!vaultData?.notes.length ? (
            <div className="empty-state">
              <p className="text-muted">No notes yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {vaultData.notes
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((note) => (
                  <div
                    key={note.id}
                    style={{
                      padding: '1rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      borderLeft: `4px solid ${
                        note.category === 'medical'
                          ? 'var(--error)'
                          : note.category === 'financial'
                          ? 'var(--warning)'
                          : 'var(--primary)'
                      }`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <h4>{note.title}</h4>
                      <span className="badge" style={{ background: 'var(--bg-tertiary)' }}>
                        {note.category}
                      </span>
                    </div>
                    <p style={{ marginBottom: '0.5rem' }}>{note.content}</p>
                    <p className="text-muted" style={{ fontSize: '0.875rem' }}>
                      By {note.authorName} on {formatDate(note.createdAt)}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Invite Member</h2>
              <button className="modal-close" onClick={() => setShowInviteModal(false)}>
                ×
              </button>
            </div>

            {inviteError && <div className="alert alert-error">{inviteError}</div>}
            {inviteSuccess && <div className="alert alert-success">{inviteSuccess}</div>}

            <form onSubmit={handleInvite}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Enter email address"
                  required
                  disabled={isInviting}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Role</label>
                <select
                  className="form-select"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as CareCircleRole)}
                  disabled={isInviting}
                >
                  <option value="viewer">Viewer - Can view basic info</option>
                  <option value="caregiver">Caregiver - Can view and edit data</option>
                </select>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowInviteModal(false)}
                  disabled={isInviting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isInviting}>
                  {isInviting ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {showNoteModal && (
        <div className="modal-overlay" onClick={() => setShowNoteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Note</h2>
              <button className="modal-close" onClick={() => setShowNoteModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleAddNote}>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Note title"
                  required
                  disabled={isAddingNote}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  className="form-select"
                  value={noteCategory}
                  onChange={(e) => setNoteCategory(e.target.value as VaultNote['category'])}
                  disabled={isAddingNote}
                >
                  <option value="general">General</option>
                  <option value="medical">Medical</option>
                  <option value="financial">Financial</option>
                  <option value="personal">Personal</option>
                  <option value="reminder">Reminder</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Content</label>
                <textarea
                  className="form-input"
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Write your note..."
                  rows={4}
                  required
                  disabled={isAddingNote}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowNoteModal(false)}
                  disabled={isAddingNote}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isAddingNote}>
                  {isAddingNote ? 'Adding...' : 'Add Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

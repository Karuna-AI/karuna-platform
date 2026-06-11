import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import type { CareCircle, CareCircleMember, SyncData, DashboardData } from '../types';
import { AlertsPanel, HealthCard, AdherenceCard, ActivityMonitor, RecoveryRequests } from '../components/dashboard';
import { OverviewTab, MembersTab, VaultTab, NotesTab } from '../components/circle';
import ErrorBoundary from '../components/ErrorBoundary';
import { useWebSocket } from '../hooks/useWebSocket';

type TabType = 'dashboard' | 'overview' | 'members' | 'vault' | 'notes';

function useDebounced<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((...args: Parameters<T>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]) as T;
}

export default function CareCircleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [circle, setCircle] = useState<CareCircle | null>(null);
  const [members, setMembers] = useState<CareCircleMember[]>([]);
  const [vaultData, setVaultData] = useState<SyncData | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [recoverySignal, setRecoverySignal] = useState(0); // bumped on recovery_request WS event (H3)
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [isVaultLoading, setIsVaultLoading] = useState(true);
  const [error, setError] = useState('');

  // Alert action state
  const [alertActionError, setAlertActionError] = useState('');

  // Circle settings state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsName, setSettingsName] = useState('');
  const [settingsElderlyName, setSettingsElderlyName] = useState('');
  const [isRenamingCircle, setIsRenamingCircle] = useState(false);
  const [renameError, setRenameError] = useState('');
  const [isDeletingCircle, setIsDeletingCircle] = useState(false);
  const [deleteCircleError, setDeleteCircleError] = useState('');

  const { showToast } = useToast();
  const currentMember = members.find((m) => m.userId === user?.id);
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

  const loadVaultData = useCallback(async () => {
    if (!id) return;
    setIsVaultLoading(true);
    const syncResult = await api.getSyncData(id);
    if (syncResult.success && syncResult.data) {
      setVaultData(syncResult.data);
    }
    setIsVaultLoading(false);
  }, [id]);

  // Debounced version for WebSocket events — coalesces bursts into one fetch
  const debouncedLoadDashboard = useDebounced(loadDashboardData, 300);

  useEffect(() => {
    if (id) {
      loadCircleData();
    }
  }, [id]);

  // Auto-refresh dashboard: poll every 30s ONLY when WebSocket is disconnected
  useEffect(() => {
    if (activeTab !== 'dashboard' || !id) return;

    // Always do an immediate load when tab becomes active
    loadDashboardData();

    if (isConnected) return; // WebSocket handles updates — no polling needed

    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, [activeTab, id, isConnected, loadDashboardData]);

  // Refresh vault data each time the vault tab is opened
  useEffect(() => {
    if (activeTab === 'vault' && id) {
      loadVaultData();
    }
  }, [activeTab, id, loadVaultData]);

  // Subscribe to WebSocket events for real-time updates
  useEffect(() => {
    if (!isConnected) return;

    const unsubs = [
      subscribe('health_update', () => debouncedLoadDashboard()),
      subscribe('alert', () => debouncedLoadDashboard()),
      subscribe('activity_update', () => debouncedLoadDashboard()),
      subscribe('alert_acknowledged', () => debouncedLoadDashboard()),
      // Surface a new vault recovery request immediately (H3).
      subscribe('recovery_request', () => setRecoverySignal((n) => n + 1)),
      // System notifications pushed by the gateway's notification worker.
      // recipientUserId is set on user-targeted notifications — only show those
      // to the addressed user.
      subscribe('notification', (data: any) => {
        if (!data?.title) return;
        if (data.recipientUserId && data.recipientUserId !== user?.id) return;
        showToast(`${data.title} — ${data.message}`, data.priority === 'urgent' ? 'error' : 'info');
      }),
    ];

    return () => unsubs.forEach(unsub => unsub());
  }, [isConnected, subscribe, debouncedLoadDashboard, showToast, user?.id]);

  const loadCircleData = async () => {
    setIsLoading(true);
    const result = await api.getCareCircle(id!);
    if (result.success && result.data) {
      setCircle(result.data);
      setMembers(result.data.members || []);

      // Load dashboard and vault data in parallel
      const [dashResult, syncResult] = await Promise.all([
        api.getDashboard(id!),
        api.getSyncData(id!),
      ]);
      if (dashResult.success && dashResult.data) {
        setDashboardData(dashResult.data);
      }
      if (syncResult.success && syncResult.data) {
        setVaultData(syncResult.data);
      }
    } else {
      setError(result.error || 'Failed to load care circle');
    }
    setIsLoading(false);
    setIsVaultLoading(false);
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    setAlertActionError('');
    const result = await api.acknowledgeAlert(id!, alertId);
    if (result.success) {
      loadDashboardData();
    } else {
      setAlertActionError(result.error || 'Failed to acknowledge alert');
    }
  };

  const handleDismissAlert = async (alertId: string) => {
    setAlertActionError('');
    const result = await api.dismissAlert(id!, alertId);
    if (result.success) {
      loadDashboardData();
    } else {
      setAlertActionError(result.error || 'Failed to dismiss alert');
    }
  };

  const handleRenameCircle = async (e: React.FormEvent) => {
    e.preventDefault();
    setRenameError('');
    setIsRenamingCircle(true);
    const result = await api.updateCareCircle(id!, { name: settingsName, elderlyName: settingsElderlyName });
    setIsRenamingCircle(false);
    if (result.success && result.data) {
      setCircle(result.data);
      setShowSettingsModal(false);
      showToast('Circle settings saved', 'success');
    } else {
      setRenameError(result.error || 'Failed to update circle');
    }
  };

  const handleDeleteCircle = async () => {
    if (!confirm(`Delete "${circle?.name}"? This will permanently remove all circle data and cannot be undone.`)) return;
    setDeleteCircleError('');
    setIsDeletingCircle(true);
    const result = await api.deleteCareCircle(id!);
    setIsDeletingCircle(false);
    if (result.success) {
      navigate('/');
    } else {
      setDeleteCircleError(result.error || 'Failed to delete circle');
    }
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {currentMember?.role === 'owner' && (
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  setSettingsName(circle.name);
                  setSettingsElderlyName(circle.elderlyName);
                  setRenameError('');
                  setDeleteCircleError('');
                  setShowSettingsModal(true);
                }}
              >
                Settings
              </button>
            )}
            {currentMember && (
              <span className={`badge badge-${currentMember.role}`}>
                {currentMember.role}
              </span>
            )}
          </div>
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
          {/* Vault PIN recovery approvals (H3) — renders only when requests are pending. */}
          {id && (
            <ErrorBoundary>
              <RecoveryRequests circleId={id} refreshSignal={recoverySignal} />
            </ErrorBoundary>
          )}
          {alertActionError && (
            <div className="alert alert-error">{alertActionError}</div>
          )}
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
                  thresholds={dashboardData.inactivityThresholds}
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
        <OverviewTab members={members} vaultData={vaultData} />
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <MembersTab
          circleId={id!}
          members={members}
          setMembers={setMembers}
          currentMember={currentMember}
        />
      )}

      {/* Vault Tab */}
      {activeTab === 'vault' && (
        <VaultTab
          vaultData={vaultData}
          isVaultLoading={isVaultLoading}
          canViewVault={canViewVault}
          canViewSensitive={canViewSensitive}
        />
      )}

      {/* Notes Tab */}
      {activeTab === 'notes' && (
        <NotesTab
          circleId={id!}
          vaultData={vaultData}
          setVaultData={setVaultData}
          canAddNotes={canAddNotes}
        />
      )}

      {/* Circle Settings Modal */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Circle Settings</h2>
              <button className="modal-close" onClick={() => setShowSettingsModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleRenameCircle}>
                <div className="form-group">
                  <label className="form-label">Circle Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settingsName}
                    onChange={(e) => setSettingsName(e.target.value)}
                    required
                    disabled={isRenamingCircle}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Care Recipient Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settingsElderlyName}
                    onChange={(e) => setSettingsElderlyName(e.target.value)}
                    required
                    disabled={isRenamingCircle}
                  />
                </div>
                {renameError && (
                  <div className="alert alert-error" style={{ margin: '0 0 1rem' }}>{renameError}</div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginBottom: '2rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowSettingsModal(false)} disabled={isRenamingCircle}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isRenamingCircle}>
                    {isRenamingCircle ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                <h3 style={{ color: 'var(--error)', marginBottom: '0.5rem' }}>Danger Zone</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  Permanently deletes this care circle, all health data, medications, notes, and member associations.
                </p>
                {deleteCircleError && (
                  <div className="alert alert-error" style={{ margin: '0 0 1rem' }}>{deleteCircleError}</div>
                )}
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDeleteCircle}
                  disabled={isDeletingCircle}
                >
                  {isDeletingCircle ? 'Deleting...' : 'Delete Circle'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

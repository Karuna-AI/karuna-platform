# Admin Portal — Missing Features & UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 8 missing features to the Karuna admin portal: dashboard auto-refresh with error state, alert acknowledge/resolve actions, feature flag rollout % slider, optimistic flag toggles, create user modal, sortable columns on Users, CSV export, and dashboard error display.

**Architecture:** All changes are confined to existing page components and the `admin-portal/src/services/api.ts` service class. No new routes or pages required. API methods are added to `AdminApiService`; pages consume them.

**Tech Stack:** React 18, TypeScript, Vite, Axios, React Router v6

---

## Task 1: Dashboard — auto-refresh every 30 seconds + error state

**Files:**
- Modify: `admin-portal/src/pages/Dashboard.tsx`

**Problem:** `loadMetrics()` is called once on mount. There is no auto-refresh and no error state — if the call fails, `isLoading` becomes false but `metrics` stays null and the page renders empty.

- [ ] **Step 1: Add interval auto-refresh and error state**

Replace the entire `admin-portal/src/pages/Dashboard.tsx` file with:

```typescript
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
      setSecondsUntilRefresh((s) => {
        if (s <= 1) return 30;
        return s - 1;
      });
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
```

- [ ] **Step 2: Build check**

```bash
cd G:/twine/karuna2026/admin-portal
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add admin-portal/src/pages/Dashboard.tsx
git commit -m "feat(admin/dashboard): auto-refresh every 30s with countdown and error state"
```

---

## Task 2: HealthAlerts — add Acknowledge and Resolve action buttons

**Files:**
- Modify: `admin-portal/src/pages/HealthAlerts.tsx`
- Modify: `admin-portal/src/services/api.ts`

**Problem:** The alerts table shows status badges but has no actions. Admins cannot acknowledge or resolve alerts from the portal.

- [ ] **Step 1: Add API methods to AdminApiService**

In `admin-portal/src/services/api.ts`, after `getDetailedMetrics`, add:

```typescript
async acknowledgeAlert(alertId: string): Promise<ApiResponse<any>> {
  try {
    const response = await this.client.post(`/health-alerts/${alertId}/acknowledge`);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: 'Failed to acknowledge alert' };
  }
}

async resolveAlert(alertId: string): Promise<ApiResponse<any>> {
  try {
    const response = await this.client.post(`/health-alerts/${alertId}/resolve`);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: 'Failed to resolve alert' };
  }
}
```

Also check that `adminAPI` is exported. At the bottom of the file, if not present, add:

```typescript
export const adminAPI = new AdminApiService();
```

- [ ] **Step 2: Add action handlers to HealthAlerts.tsx**

In `admin-portal/src/pages/HealthAlerts.tsx`, add import at the top:

```typescript
import { adminAPI } from '../services/api';
```

Add handler functions after `loadAlerts`:

```typescript
const handleAcknowledge = async (alertId: string) => {
  const result = await adminAPI.acknowledgeAlert(alertId);
  if (result.success) {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, status: 'acknowledged' } : a))
    );
  }
};

const handleResolve = async (alertId: string) => {
  const result = await adminAPI.resolveAlert(alertId);
  if (result.success) {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, status: 'resolved' } : a))
    );
  }
};
```

- [ ] **Step 3: Add an Actions column to the alerts table**

In the `<thead>`, after the last `<th>Circle</th>`, add:

```tsx
<th>Actions</th>
```

In the `<tbody>` row map, after `<td>{alert.circle_name}</td>`, add:

```tsx
<td>
  <div style={{ display: 'flex', gap: '0.5rem' }}>
    {alert.status === 'active' && (
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => handleAcknowledge(alert.id)}
      >
        Acknowledge
      </button>
    )}
    {alert.status !== 'resolved' && (
      <button
        className="btn btn-primary btn-sm"
        onClick={() => handleResolve(alert.id)}
      >
        Resolve
      </button>
    )}
  </div>
</td>
```

- [ ] **Step 4: Build check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add admin-portal/src/pages/HealthAlerts.tsx admin-portal/src/services/api.ts
git commit -m "feat(admin/alerts): add Acknowledge and Resolve action buttons"
```

---

## Task 3: FeatureFlags — rollout percentage slider + optimistic toggles

**Files:**
- Modify: `admin-portal/src/pages/FeatureFlags.tsx`
- Modify: `admin-portal/src/services/api.ts`

**Problem (1):** The rollout percentage is displayed as static text. Admins cannot change it without a backend call. **Problem (2):** `handleToggle` awaits the API before updating the UI — the toggle appears unresponsive for 500ms+.

- [ ] **Step 1: Add updateFeatureFlagRollout API method**

In `admin-portal/src/services/api.ts`, add after `updateFeatureFlag`:

```typescript
async updateFeatureFlagRollout(flagId: string, rolloutPercentage: number): Promise<ApiResponse<any>> {
  try {
    const response = await this.client.patch(`/feature-flags/${flagId}`, { rollout_percentage: rolloutPercentage });
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: 'Failed to update rollout percentage' };
  }
}
```

- [ ] **Step 2: Make handleToggle optimistic**

In `admin-portal/src/pages/FeatureFlags.tsx`, replace `handleToggle`:

```typescript
const handleToggle = async (flag: any) => {
  // Optimistic update
  setFlags((prev) =>
    prev.map((f) => (f.id === flag.id ? { ...f, is_enabled: !f.is_enabled } : f))
  );
  const result = await api.updateFeatureFlag(flag.id, { is_enabled: !flag.is_enabled });
  if (!result.success) {
    // Revert on failure
    setFlags((prev) =>
      prev.map((f) => (f.id === flag.id ? { ...f, is_enabled: flag.is_enabled } : f))
    );
  }
};
```

Do the same for `handleToggleForAll`:

```typescript
const handleToggleForAll = async (flag: any) => {
  setFlags((prev) =>
    prev.map((f) => (f.id === flag.id ? { ...f, enabled_for_all: !f.enabled_for_all } : f))
  );
  const result = await api.updateFeatureFlag(flag.id, { enabled_for_all: !flag.enabled_for_all });
  if (!result.success) {
    setFlags((prev) =>
      prev.map((f) => (f.id === flag.id ? { ...f, enabled_for_all: flag.enabled_for_all } : f))
    );
  }
};
```

- [ ] **Step 3: Add rollout % slider**

Add debounce hook import at the top (assumes `admin-portal/src/hooks/useDebounce.ts` exists — it's used in Users.tsx):

```typescript
import { useDebounce } from '../hooks/useDebounce';
```

Add rollout pending state:

```typescript
const [pendingRollout, setPendingRollout] = useState<Record<string, number>>({});
```

Add rollout change handler:

```typescript
const handleRolloutChange = (flagId: string, value: number) => {
  setPendingRollout((prev) => ({ ...prev, [flagId]: value }));
};

const handleRolloutCommit = async (flagId: string, value: number) => {
  if (!canManageFlags) return;
  const result = await api.updateFeatureFlagRollout(flagId, value);
  if (result.success) {
    setFlags((prev) =>
      prev.map((f) => (f.id === flagId ? { ...f, rollout_percentage: value } : f))
    );
  }
  setPendingRollout((prev) => {
    const next = { ...prev };
    delete next[flagId];
    return next;
  });
};
```

Replace the `<td>{flag.rollout_percentage}%</td>` cell with:

```tsx
<td style={{ minWidth: '160px' }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
    <input
      type="range"
      min={0}
      max={100}
      step={5}
      value={pendingRollout[flag.id] ?? flag.rollout_percentage}
      onChange={(e) => handleRolloutChange(flag.id, Number(e.target.value))}
      onMouseUp={(e) => handleRolloutCommit(flag.id, Number((e.target as HTMLInputElement).value))}
      onTouchEnd={(e) => handleRolloutCommit(flag.id, Number((e.target as HTMLInputElement).value))}
      disabled={!canManageFlags || !flag.is_enabled}
      style={{ flex: 1 }}
    />
    <span style={{ minWidth: '3rem', textAlign: 'right' }}>
      {pendingRollout[flag.id] ?? flag.rollout_percentage}%
    </span>
  </div>
</td>
```

- [ ] **Step 4: Build check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add admin-portal/src/pages/FeatureFlags.tsx admin-portal/src/services/api.ts
git commit -m "feat(admin/flags): optimistic toggles + rollout % slider"
```

---

## Task 4: Users — Create User modal

**Files:**
- Modify: `admin-portal/src/pages/Users.tsx`
- Modify: `admin-portal/src/services/api.ts`

**Problem:** There is no way to create a user from the admin portal — the page only lists existing users.

- [ ] **Step 1: Add createUser API method**

In `admin-portal/src/services/api.ts`, after `unsuspendUser`:

```typescript
async createUser(data: { name: string; email: string; phone?: string }): Promise<ApiResponse<any>> {
  try {
    const response = await this.client.post('/users', data);
    return { success: true, data: response.data };
  } catch (error) {
    const axiosError = error as AxiosError<{ error: string }>;
    return { success: false, error: axiosError.response?.data?.error || 'Failed to create user' };
  }
}
```

- [ ] **Step 2: Add create user state and handler to Users.tsx**

In `admin-portal/src/pages/Users.tsx`, after the existing state declarations:

```typescript
const [showCreateModal, setShowCreateModal] = useState(false);
const [newUser, setNewUser] = useState({ name: '', email: '', phone: '' });
const [createError, setCreateError] = useState('');
const [isCreating, setIsCreating] = useState(false);
```

Add handler after `handleSearch`:

```typescript
const handleCreateUser = async (e: React.FormEvent) => {
  e.preventDefault();
  setCreateError('');
  setIsCreating(true);
  const result = await api.createUser({
    name: newUser.name,
    email: newUser.email,
    phone: newUser.phone || undefined,
  });
  setIsCreating(false);
  if (result.success) {
    setShowCreateModal(false);
    setNewUser({ name: '', email: '', phone: '' });
    loadUsers(1);
  } else {
    setCreateError(result.error || 'Failed to create user');
  }
};
```

- [ ] **Step 3: Add button to page header and modal JSX**

In the `return` JSX, update the page header:

```tsx
<div className="page-header">
  <h1 className="page-title">Users</h1>
  <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
    + Create User
  </button>
</div>
```

Add modal after the existing card/table content:

```tsx
{showCreateModal && (
  <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
    <div className="modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <h3 className="modal-title">Create User</h3>
        <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
      </div>
      <form onSubmit={handleCreateUser}>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input
              type="text"
              className="form-input"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email *</label>
            <input
              type="email"
              className="form-input"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input
              type="tel"
              className="form-input"
              value={newUser.phone}
              onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
              placeholder="+91 98765 43210"
            />
          </div>
          {createError && <p style={{ color: 'var(--error)', fontSize: '0.875rem' }}>{createError}</p>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </form>
    </div>
  </div>
)}
```

- [ ] **Step 4: Build check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add admin-portal/src/pages/Users.tsx admin-portal/src/services/api.ts
git commit -m "feat(admin/users): add Create User button and modal"
```

---

## Task 5: Users — sortable columns

**Files:**
- Modify: `admin-portal/src/pages/Users.tsx`
- Modify: `admin-portal/src/services/api.ts`

**Problem:** The users table has no sortable columns. Admins cannot order by name, email, or registration date.

- [ ] **Step 1: Update getUsers API to accept sort params**

In `admin-portal/src/services/api.ts`, update `getUsers` signature:

```typescript
async getUsers(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
} = {}): Promise<ApiResponse<any>> {
  try {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.status) queryParams.append('status', params.status);
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortDir) queryParams.append('sortDir', params.sortDir);
    const response = await this.client.get(`/users?${queryParams}`);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: 'Failed to get users' };
  }
}
```

- [ ] **Step 2: Add sort state to Users.tsx**

After existing state declarations:

```typescript
const [sortBy, setSortBy] = useState('created_at');
const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
```

- [ ] **Step 3: Wire sort into loadUsers**

Update `loadUsers`:

```typescript
const loadUsers = useCallback(async (
  page = 1,
  searchTerm = debouncedSearch,
  statusFilter = status,
  sortColumn = sortBy,
  sortDirection = sortDir
) => {
  setIsLoading(true);
  const result = await api.getUsers({
    page,
    limit: 50,
    search: searchTerm || undefined,
    status: statusFilter || undefined,
    sortBy: sortColumn,
    sortDir: sortDirection,
  });
  if (result.success) {
    setUsers(result.data.users);
    setPagination(result.data.pagination);
  }
  setIsLoading(false);
}, [debouncedSearch, status, sortBy, sortDir]);
```

Add sort handler:

```typescript
const handleSort = (column: string) => {
  const newDir = sortBy === column && sortDir === 'asc' ? 'desc' : 'asc';
  setSortBy(column);
  setSortDir(newDir);
  loadUsers(1, debouncedSearch, status, column, newDir);
};

const SortIcon = ({ column }: { column: string }) => {
  if (sortBy !== column) return <span style={{ color: '#ccc', marginLeft: '4px' }}>↕</span>;
  return <span style={{ marginLeft: '4px' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
};
```

- [ ] **Step 4: Add sortable column headers**

Find the table headers and update the Name, Email, Status, and Created columns:

```tsx
<thead>
  <tr>
    <th
      style={{ cursor: 'pointer', userSelect: 'none' }}
      onClick={() => handleSort('name')}
    >
      Name <SortIcon column="name" />
    </th>
    <th
      style={{ cursor: 'pointer', userSelect: 'none' }}
      onClick={() => handleSort('email')}
    >
      Email <SortIcon column="email" />
    </th>
    <th>Phone</th>
    <th>Status</th>
    <th
      style={{ cursor: 'pointer', userSelect: 'none' }}
      onClick={() => handleSort('created_at')}
    >
      Joined <SortIcon column="created_at" />
    </th>
    <th
      style={{ cursor: 'pointer', userSelect: 'none' }}
      onClick={() => handleSort('last_active_at')}
    >
      Last Active <SortIcon column="last_active_at" />
    </th>
    <th>Actions</th>
  </tr>
</thead>
```

- [ ] **Step 5: Build check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add admin-portal/src/pages/Users.tsx admin-portal/src/services/api.ts
git commit -m "feat(admin/users): sortable columns — name, email, created_at, last_active_at"
```

---

## Task 6: Users — CSV export

**Files:**
- Modify: `admin-portal/src/pages/Users.tsx`

**Problem:** There is no way to export the user list to CSV for reporting.

- [ ] **Step 1: Add CSV export utility function**

At the top of `admin-portal/src/pages/Users.tsx`, after imports, add:

```typescript
function exportToCsv(filename: string, rows: any[]) {
  if (!rows.length) return;
  const headers = ['Name', 'Email', 'Phone', 'Status', 'Joined', 'Last Active'];
  const csvRows = [
    headers.join(','),
    ...rows.map((u) =>
      [
        `"${(u.name || '').replace(/"/g, '""')}"`,
        `"${(u.email || '').replace(/"/g, '""')}"`,
        `"${(u.phone || '').replace(/"/g, '""')}"`,
        u.status || '',
        u.created_at ? new Date(u.created_at).toLocaleDateString() : '',
        u.last_active_at ? new Date(u.last_active_at).toLocaleDateString() : '',
      ].join(',')
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Add Export button to page header**

In the `return` JSX, update the page header to include the export button (alongside the Create User button added in Task 4):

```tsx
<div className="page-header">
  <h1 className="page-title">Users</h1>
  <div style={{ display: 'flex', gap: '0.75rem' }}>
    <button
      className="btn btn-secondary"
      onClick={() => exportToCsv(`users-${new Date().toISOString().slice(0, 10)}.csv`, users)}
      disabled={users.length === 0}
    >
      Export CSV
    </button>
    <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
      + Create User
    </button>
  </div>
</div>
```

- [ ] **Step 3: Build check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add admin-portal/src/pages/Users.tsx
git commit -m "feat(admin/users): add Export CSV button for current user list"
```

---

## Task 7: Verify admin portal builds and deploys

**Files:**
- No changes — verification only.

- [ ] **Step 1: Run the full Vite build**

```bash
cd G:/twine/karuna2026/admin-portal
npm run build 2>&1 | tail -20
```

Expected: `✓ built in` with no errors.

- [ ] **Step 2: Deploy to Vercel**

```bash
cd G:/twine/karuna2026/admin-portal
npx vercel --prod 2>&1 | tail -10
```

Expected: deployment URL ending in `.vercel.app`.

- [ ] **Step 3: Smoke test the deployed portal**

Open the admin portal URL and verify:
- Dashboard loads and shows "Refreshes in Xs" countdown
- Feature flags page shows sliders instead of static text
- Users page has "Create User" and "Export CSV" buttons
- Health Alerts "All Alerts" tab shows Acknowledge / Resolve buttons

- [ ] **Step 4: Final commit if any tweaks needed**

```bash
git add -A
git commit -m "chore(admin): post-deploy smoke test fixes"
```

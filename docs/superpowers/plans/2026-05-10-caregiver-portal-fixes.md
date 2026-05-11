# Caregiver Portal — Bug Fixes & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10 bugs and security issues in the Karuna caregiver portal: WebSocket memory leaks, redundant polling, event deduplication, token-in-URL security, Axios timeouts, vault staleness, loading states, dead code, hard-coded thresholds, and CSRF protection.

**Architecture:** All fixes are isolated to existing files — no new pages or components needed. WebSocket fixes are coordinated between `services/websocket.ts`, `hooks/useWebSocket.ts`, and `pages/CareCircleDetail.tsx`. Security fixes touch `services/api.ts` and `services/websocket.ts`.

**Tech Stack:** React 18, TypeScript, Axios, native WebSocket API, Vite

---

## Task 1: Remove dead code — `circleIdRef` in useWebSocket

**Files:**
- Modify: `caregiver-portal/src/hooks/useWebSocket.ts`

- [ ] **Step 1: Remove the unused ref**

Replace the entire file content with:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { wsService } from '../services/websocket';
import { useAuth } from '../context/AuthContext';

export function useWebSocket(circleId: string | undefined) {
  const [isConnected, setIsConnected] = useState(false);
  const { token } = useAuth();

  useEffect(() => {
    if (!circleId || !token) return;

    wsService.connect(circleId, token);

    const handleConnection = (connected: boolean) => {
      setIsConnected(connected);
    };

    wsService.onConnectionChange(handleConnection);
    setIsConnected(wsService.isConnected);

    return () => {
      wsService.offConnectionChange(handleConnection);
      wsService.disconnect();
    };
  }, [circleId, token]);

  const subscribe = useCallback((type: string, handler: (data: any) => void) => {
    wsService.onMessage(type, handler);
    return () => wsService.offMessage(type, handler);
  }, []);

  return { isConnected, subscribe };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd caregiver-portal && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add caregiver-portal/src/hooks/useWebSocket.ts
git commit -m "chore(caregiver): remove unused circleIdRef dead code"
```

---

## Task 2: Add Axios request timeouts

**Files:**
- Modify: `caregiver-portal/src/services/api.ts:27-33`

- [ ] **Step 1: Add timeout to the Axios constructor**

Find the `axios.create({` block and add `timeout: 15000`:

```typescript
this.client = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ''}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 15000, // 15 s — prevents indefinite hangs on slow connections
});
```

- [ ] **Step 2: Handle timeout errors in the response interceptor**

Find the response interceptor error handler and add a timeout branch:

```typescript
this.client.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new Error('Request timed out. Please check your connection.'));
    }
    if (error.response?.status === 401) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add caregiver-portal/src/services/api.ts
git commit -m "fix(caregiver): add 15s Axios timeout and handle ECONNABORTED"
```

---

## Task 3: Fix WebSocket handler memory leak on circle switch

**Problem:** When a user navigates from circle A to circle B, `useWebSocket` calls `wsService.disconnect()` which clears ALL handlers. But the new circle's `subscribe()` calls in `CareCircleDetail` run AFTER the disconnect, so they accumulate on top of any previously registered event handlers without cleanup.

The fix: `disconnect()` must clear the `handlers` Map so stale handlers can't accumulate.

**Files:**
- Modify: `caregiver-portal/src/services/websocket.ts:74-93`

- [ ] **Step 1: Clear handlers map inside `disconnect()`**

Replace the `disconnect()` method:

```typescript
disconnect(): void {
  this.intentionalClose = true;
  this.stopPing();

  if (this.reconnectTimeout) {
    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = null;
  }

  if (this.ws) {
    this.ws.close();
    this.ws = null;
  }

  // Clear all message handlers so they don't accumulate across circle switches
  this.handlers.clear();

  this._isConnected = false;
  this.circleId = null;
  this.token = null;
  this.reconnectAttempts = 0;
  this.notifyConnectionHandlers(false);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add caregiver-portal/src/services/websocket.ts
git commit -m "fix(caregiver): clear WS message handlers on disconnect to prevent memory leak"
```

---

## Task 4: Stop polling when WebSocket reconnects

**Problem:** In `CareCircleDetail`, the `useEffect` that sets up 30s polling only starts a new interval when `isConnected` is false. But if WebSocket reconnects, the old interval is still running — it was created with a `return () => clearInterval(interval)` cleanup, but React only calls that cleanup when the effect re-runs or the component unmounts. The effect re-runs when `isConnected` changes, so the cleanup DOES fire on reconnect — but only if `activeTab === 'dashboard'` at that moment.

The real problem: polling runs even when the WebSocket is connected because the cleanup only fires on the next render. Ensure the polling interval is unconditionally cleared when `isConnected` becomes true.

**Files:**
- Modify: `caregiver-portal/src/pages/CareCircleDetail.tsx:66-76`

- [ ] **Step 1: Replace the polling useEffect**

Find and replace the auto-refresh `useEffect` block:

```typescript
// Auto-refresh dashboard: poll every 30s ONLY when WebSocket is disconnected
useEffect(() => {
  if (activeTab !== 'dashboard' || !id) return;

  // Always do an immediate load when tab becomes active
  loadDashboardData();

  if (isConnected) return; // WebSocket handles updates — no polling needed

  const interval = setInterval(loadDashboardData, 30000);
  return () => clearInterval(interval);
}, [activeTab, id, isConnected, loadDashboardData]);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add caregiver-portal/src/pages/CareCircleDetail.tsx
git commit -m "fix(caregiver): stop polling when WebSocket is connected"
```

---

## Task 5: Deduplicate rapid WebSocket dashboard refreshes

**Problem:** When the backend sends multiple events in quick succession (e.g., 5 `health_update` events arrive within 500ms), `loadDashboardData` is called 5 times in parallel — 5 simultaneous GET requests for the same data.

Fix: debounce `loadDashboardData` calls from WebSocket handlers so rapid events coalesce into one fetch.

**Files:**
- Modify: `caregiver-portal/src/pages/CareCircleDetail.tsx`

- [ ] **Step 1: Add a debounce utility at the top of the file**

After the imports, add:

```typescript
function useDebounced<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  return React.useCallback((...args: Parameters<T>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]) as T;
}
```

- [ ] **Step 2: Debounce the WebSocket-triggered reload**

After the `loadDashboardData` useCallback, add:

```typescript
// Debounced version for WebSocket events — coalesces bursts into one fetch
const debouncedLoadDashboard = useDebounced(loadDashboardData, 300);
```

- [ ] **Step 3: Use the debounced version in the WebSocket subscription effect**

Replace the WebSocket subscription `useEffect`:

```typescript
useEffect(() => {
  if (!isConnected) return;

  const unsubs = [
    subscribe('health_update', () => debouncedLoadDashboard()),
    subscribe('alert', () => debouncedLoadDashboard()),
    subscribe('activity_update', () => debouncedLoadDashboard()),
    subscribe('alert_acknowledged', () => debouncedLoadDashboard()),
  ];

  return () => unsubs.forEach(unsub => unsub());
}, [isConnected, subscribe, debouncedLoadDashboard]);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add caregiver-portal/src/pages/CareCircleDetail.tsx
git commit -m "fix(caregiver): debounce WebSocket dashboard refreshes to prevent parallel fetches"
```

---

## Task 6: Move WebSocket token from URL to cookie auth

**Problem:** `wsService.connect()` puts the JWT token in the WebSocket URL: `/ws?token=...&circleId=...`. URLs appear in browser history, server access logs, and proxy logs. Since the portal already uses httpOnly cookies for all REST calls, the WebSocket handshake should rely on the same cookie — the browser sends cookies automatically on WebSocket upgrade requests to the same origin.

**Files:**
- Modify: `caregiver-portal/src/services/websocket.ts:17-21` and `24-32`
- Modify: `caregiver-portal/src/hooks/useWebSocket.ts`

- [ ] **Step 1: Remove token from `connect()` signature and WebSocket URL**

Replace the `connect()` and `doConnect()` methods in `websocket.ts`:

```typescript
connect(circleId: string): void {
  this.circleId = circleId;
  this.intentionalClose = false;
  this.doConnect();
}

private doConnect(): void {
  if (!this.circleId) return;

  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    // Cookie is sent automatically by the browser on same-origin WS upgrade
    const wsUrl = `${protocol}//${host}/ws?circleId=${encodeURIComponent(this.circleId)}`;

    this.ws = new WebSocket(wsUrl);
    // ... rest of onopen/onmessage/onclose/onerror unchanged
```

Also remove the `private token: string | null = null;` field and all references to it in `disconnect()`.

- [ ] **Step 2: Update `useWebSocket` to not pass token**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { wsService } from '../services/websocket';

export function useWebSocket(circleId: string | undefined) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!circleId) return;

    wsService.connect(circleId);

    const handleConnection = (connected: boolean) => setIsConnected(connected);
    wsService.onConnectionChange(handleConnection);
    setIsConnected(wsService.isConnected);

    return () => {
      wsService.offConnectionChange(handleConnection);
      wsService.disconnect();
    };
  }, [circleId]);

  const subscribe = useCallback((type: string, handler: (data: any) => void) => {
    wsService.onMessage(type, handler);
    return () => wsService.offMessage(type, handler);
  }, []);

  return { isConnected, subscribe };
}
```

- [ ] **Step 3: Verify server accepts cookie auth on WS upgrade**

Check `server/index.js` for the WebSocket upgrade handler — confirm it reads `req.cookies` or the session cookie, not just the `?token=` query param. If it only checks the query param, update it to also accept the httpOnly cookie. (The server already sets the cookie on login; the upgrade handler needs `cookie-parser` to read it.)

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add caregiver-portal/src/services/websocket.ts caregiver-portal/src/hooks/useWebSocket.ts
git commit -m "security(caregiver): remove JWT token from WebSocket URL, rely on httpOnly cookie"
```

---

## Task 7: Add loading skeleton to vault tab

**Problem:** Vault data loads on component mount. When the user clicks the Vault tab, it may appear empty for 1–2 seconds before data arrives, with no visual indication that loading is in progress.

**Files:**
- Modify: `caregiver-portal/src/pages/CareCircleDetail.tsx`

- [ ] **Step 1: Add `isVaultLoading` state**

Add state near the other loading states:

```typescript
const [isVaultLoading, setIsVaultLoading] = useState(true);
```

- [ ] **Step 2: Set loading states around vault fetch in `loadCircleData`**

Inside `loadCircleData`, wrap the vault fetch:

```typescript
setIsVaultLoading(true);
const syncResult = await api.getSyncData(id!);
if (syncResult.success && syncResult.data) {
  setVaultData(syncResult.data);
}
setIsVaultLoading(false);
```

- [ ] **Step 3: Show spinner in vault tab content**

In the JSX for the vault tab, add a loading guard at the top of the vault tab content block:

```tsx
{activeTab === 'vault' && (
  <div>
    {isVaultLoading ? (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <div className="spinner" />
        <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>Loading vault data…</p>
      </div>
    ) : !canViewVault ? (
      <p>You don't have permission to view the vault.</p>
    ) : (
      /* existing vault JSX */
    )}
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add caregiver-portal/src/pages/CareCircleDetail.tsx
git commit -m "fix(caregiver): show loading state while vault tab data loads"
```

---

## Task 8: Refresh vault data when vault tab is focused

**Problem:** Vault data (medications, appointments, doctors) is fetched once on mount. If another caregiver updates the vault, the current user sees stale data until they reload the page.

**Files:**
- Modify: `caregiver-portal/src/pages/CareCircleDetail.tsx`

- [ ] **Step 1: Extract vault reload into its own function**

Add a `loadVaultData` function alongside `loadDashboardData`:

```typescript
const loadVaultData = useCallback(async () => {
  if (!id) return;
  setIsVaultLoading(true);
  const syncResult = await api.getSyncData(id);
  if (syncResult.success && syncResult.data) {
    setVaultData(syncResult.data);
  }
  setIsVaultLoading(false);
}, [id]);
```

- [ ] **Step 2: Call `loadVaultData` when the vault tab becomes active**

Add a `useEffect` that watches `activeTab`:

```typescript
useEffect(() => {
  if (activeTab === 'vault' && id) {
    loadVaultData();
  }
}, [activeTab, id, loadVaultData]);
```

- [ ] **Step 3: Remove vault fetch from `loadCircleData` (now handled by tab effect)**

In `loadCircleData`, delete the `getSyncData` call block — the vault tab effect will handle it on first render.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add caregiver-portal/src/pages/CareCircleDetail.tsx
git commit -m "fix(caregiver): refresh vault data each time vault tab is opened"
```

---

## Task 9: Remove hard-coded inactivity thresholds

**Problem:** `ActivityMonitor.tsx` hard-codes status thresholds (e.g., >480 minutes = alert). If the backend changes these thresholds, the UI won't reflect it.

**Files:**
- Modify: `caregiver-portal/src/components/dashboard/ActivityMonitor.tsx`
- Modify: `caregiver-portal/src/types/index.ts`

- [ ] **Step 1: Add `inactivityThresholds` to the `DashboardData` type**

In `types/index.ts`, find `DashboardData` and add:

```typescript
export interface InactivityThresholds {
  concerningMinutes: number;  // default 240
  alertMinutes: number;       // default 480
}

export interface DashboardData {
  // ... existing fields ...
  inactivityThresholds?: InactivityThresholds;
}
```

- [ ] **Step 2: Update `ActivityMonitor` to accept and use thresholds**

In `ActivityMonitor.tsx`, add `thresholds` prop and use it:

```typescript
interface ActivityMonitorProps {
  lastActivity: ActivityLog | null;
  inactivityMinutes: number;
  inactivityStatus: string;
  checkinResponseRate?: number;
  thresholds?: { concerningMinutes: number; alertMinutes: number };
}

export function ActivityMonitor({
  lastActivity,
  inactivityMinutes,
  inactivityStatus,
  checkinResponseRate,
  thresholds = { concerningMinutes: 240, alertMinutes: 480 },
}: ActivityMonitorProps) {
  // Replace any hard-coded 240/480 references with thresholds.concerningMinutes / thresholds.alertMinutes
```

- [ ] **Step 3: Pass thresholds from `CareCircleDetail` to `ActivityMonitor`**

In `CareCircleDetail.tsx`, find the `<ActivityMonitor>` usage and add:

```tsx
<ActivityMonitor
  lastActivity={dashboardData.activity?.lastLog ?? null}
  inactivityMinutes={dashboardData.activity?.inactivityMinutes ?? 0}
  inactivityStatus={dashboardData.activity?.status ?? 'unknown'}
  checkinResponseRate={dashboardData.checkins?.responseRate}
  thresholds={dashboardData.inactivityThresholds}
/>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add caregiver-portal/src/types/index.ts caregiver-portal/src/components/dashboard/ActivityMonitor.tsx caregiver-portal/src/pages/CareCircleDetail.tsx
git commit -m "fix(caregiver): make inactivity thresholds data-driven from backend"
```

---

## Task 10: Add CSRF token protection to API calls

**Problem:** Mutations (POST/PUT/DELETE) use httpOnly cookies for auth but send no CSRF token. A malicious third-party site could trigger authenticated requests via form submissions.

**Files:**
- Modify: `caregiver-portal/src/services/api.ts`

- [ ] **Step 1: Add a CSRF token request interceptor**

The standard double-submit cookie pattern: read a `csrf-token` cookie (non-httpOnly, set by the server) and send it as an `X-CSRF-Token` header on mutating requests.

In `api.ts`, update the request interceptor:

```typescript
this.client.interceptors.request.use((config) => {
  if (this.token) {
    config.headers.Authorization = `Bearer ${this.token}`;
  }

  // CSRF: send the csrf-token cookie value as a header on all mutating requests
  const method = (config.method || '').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const csrfToken = document.cookie
      .split('; ')
      .find(row => row.startsWith('csrf-token='))
      ?.split('=')[1];
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = decodeURIComponent(csrfToken);
    }
  }

  return config;
});
```

- [ ] **Step 2: Verify server sets the `csrf-token` cookie**

In `server/index.js`, confirm the CSRF middleware sets a readable (non-httpOnly) `csrf-token` cookie on login and on the `/health` endpoint response. If it doesn't exist, add:

```javascript
// After session cookie is set, also set a CSRF readable cookie
res.cookie('csrf-token', crypto.randomUUID(), {
  httpOnly: false,   // Must be readable by JS
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 24 * 60 * 60 * 1000,
});
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add caregiver-portal/src/services/api.ts
git commit -m "security(caregiver): add CSRF token header on all mutating API requests"
```

---

## Final: Build verification

- [ ] **Step 1: Full build check**

```bash
cd caregiver-portal && npm run build
```
Expected: `✓ built in X.Xs` with no errors

- [ ] **Step 2: TypeScript strict check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Deploy**

```bash
cd caregiver-portal && vercel --prod --scope karunaais-projects --yes
```

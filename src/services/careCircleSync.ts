import AsyncStorage from '@react-native-async-storage/async-storage';
import { vaultService } from './vault';
import { secureStorageService } from './secureStorage';
import { toSyncPayload, isSyncSupported } from './vaultSyncMap';

const STORAGE_KEYS = {
  CARE_CIRCLE_ID: '@karuna_care_circle_id',
  DEVICE_ID: '@karuna_device_id',
  LAST_SYNC: '@karuna_last_sync',
  PENDING_CHANGES: '@karuna_pending_changes',
  AUTH_TOKEN: '@karuna_care_auth_token',
  // This device user's role in the current circle (owner/caregiver/viewer),
  // cached from /auth/me so role-gated UI (e.g. consent) works offline. M1/M2.
  CIRCLE_ROLE: '@karuna_circle_role',
};

export type CircleRole = 'owner' | 'caregiver' | 'viewer';

const MAX_CHANGE_RETRIES = 5;

interface SyncChange {
  id: string;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  data: Record<string, unknown>;
  timestamp: string;
  deviceId: string;
  retryCount?: number;
}

interface SyncResult {
  success: boolean;
  synced: number;
  conflicts: SyncChange[];
  error?: string;
}

class CareCircleSyncService {
  private baseUrl: string = '';
  private deviceId: string = '';
  private careCircleId: string | null = null;
  private authToken: string | null = null;
  private ws: WebSocket | null = null;
  private pendingChanges: SyncChange[] = [];
  private syncListeners: ((event: string, data?: unknown) => void)[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  // Whether the last REST sync reached the server. The WebSocket is only for
  // realtime nudges, so connectivity status should reflect this, not WS state
  // alone (N2 — screen showed "Offline" right after a successful sync).
  private lastSyncOk = false;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private isShuttingDown = false;

  async initialize(serverUrl: string) {
    this.baseUrl = serverUrl;

    // Generate or retrieve device ID
    let deviceId = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
    }
    this.deviceId = deviceId;

    // Load saved state
    const savedCircleId = await AsyncStorage.getItem(STORAGE_KEYS.CARE_CIRCLE_ID);
    const savedTokenResult = await secureStorageService.getCaregiverToken();
    let savedToken = savedTokenResult.success ? (savedTokenResult.token ?? null) : null;

    // One-time migration: older builds persisted the auth token in AsyncStorage,
    // but we now read it from SecureStore. If SecureStore has none yet the legacy
    // key does, adopt it and move it across so existing installs recover their
    // session (and resume syncing) without having to re-join the circle.
    if (!savedToken) {
      const legacyToken = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      if (legacyToken) {
        await this.setAuthToken(legacyToken);
        await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        savedToken = legacyToken;
      }
    }

    const savedChanges = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_CHANGES);

    if (savedCircleId) this.careCircleId = savedCircleId;
    if (savedToken) this.authToken = savedToken;
    if (savedChanges) {
      try {
        this.pendingChanges = JSON.parse(savedChanges);
      } catch {
        console.warn('[CareCircleSync] Corrupted pending changes, resetting');
        this.pendingChanges = [];
      }
    }

    // Wire vault mutations into the sync queue (H1): patient-entered vault data
    // now propagates to the care circle. trackChange() no-ops until a circle is
    // joined, so this is safe to register unconditionally. account/document are
    // intentionally not synced (server-side encryption + caregivers can't edit).
    vaultService.setChangeListener((kind, id, action, entity) => {
      if (!isSyncSupported(kind)) return;
      if (action === 'delete') {
        void this.trackChange(kind, id, 'delete', {});
        return;
      }
      const payload = toSyncPayload(kind, entity || {});
      if (payload) void this.trackChange(payload.entityType, id, action, payload.data);
    });

    console.debug('[CareCircleSync] Initialized with device:', this.deviceId);
  }

  // Join a care circle using invitation token
  async joinCircle(invitationToken: string): Promise<{ success: boolean; circleName?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/care/invitations/${invitationToken}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken && { Authorization: `Bearer ${this.authToken}` }),
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to join circle' };
      }

      // The accept endpoint returns { success, token, user, circle } — NOT a
      // bare circle. Earlier code read circle.id from the top level which is
      // undefined, then AsyncStorage.setItem(KEY, undefined) threw → catch
      // returned 'Network error' even though the server had accepted the
      // invitation. Extract the right fields and persist the auth token too.
      const data = await response.json();
      const circle = data.circle;
      const authToken = data.token;
      if (!circle || !circle.id) {
        console.error('[CareCircleSync] Join: unexpected accept response shape', data);
        return { success: false, error: 'Unexpected server response' };
      }
      this.careCircleId = circle.id;
      if (authToken) {
        // Persist via SecureStore (the store initialize() reads back) so the
        // write and read stores stay aligned across app restarts.
        await this.setAuthToken(authToken);
      }
      await AsyncStorage.setItem(STORAGE_KEYS.CARE_CIRCLE_ID, circle.id);

      // Connect WebSocket
      this.connectWebSocket();

      // Perform initial sync
      await this.pullFromCloud();

      return { success: true, circleName: circle.name };
    } catch (error) {
      console.error('[CareCircleSync] Join error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Leave the current care circle
  async leaveCircle(): Promise<void> {
    this.disconnectWebSocket();
    this.careCircleId = null;
    this.pendingChanges = [];
    this.lastSyncOk = false;
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.CARE_CIRCLE_ID,
      STORAGE_KEYS.PENDING_CHANGES,
      STORAGE_KEYS.LAST_SYNC,
      STORAGE_KEYS.CIRCLE_ROLE,
    ]);
    this.notifyListeners('left_circle');
  }

  // Check if connected to a care circle
  isConnected(): boolean {
    return this.careCircleId !== null;
  }

  // Get current care circle ID
  getCareCircleId(): string | null {
    return this.careCircleId;
  }

  /**
   * This device user's role in the current circle, from /auth/me (authoritative —
   * the server gates owner-only actions by circle membership, not the local
   * onboarding flag). Caches the result so role-gated UI works offline. Returns
   * null when not in a circle, or when the role can't be determined (no token,
   * network failure with no cache) — callers should treat unknown-in-a-circle as
   * non-owner (see consentAudience). M1/M2.
   */
  async getMyCircleRole(): Promise<CircleRole | null> {
    if (!this.careCircleId || !this.authToken) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/care/auth/me`, {
        headers: { Authorization: `Bearer ${this.authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        const circle = Array.isArray(data?.circles)
          ? data.circles.find((c: { id?: string }) => c.id === this.careCircleId)
          : null;
        const role = circle?.role as CircleRole | undefined;
        if (role) {
          await AsyncStorage.setItem(STORAGE_KEYS.CIRCLE_ROLE, role);
          return role;
        }
      }
    } catch (error) {
      console.debug('[CareCircleSync] getMyCircleRole fetch failed, using cache:', error);
    }
    // Offline / fetch miss: fall back to the last known cached role.
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.CIRCLE_ROLE);
    return (cached as CircleRole | null) ?? null;
  }

  // Current in-memory care auth token, for clients that want to attribute
  // otherwise-unauthenticated requests (e.g. AI usage logging on /api/chat,
  // /api/stt). Null when not authenticated to a circle.
  getAuthToken(): string | null {
    return this.authToken;
  }

  // Set authentication token (from caregiver login)
  async setAuthToken(token: string): Promise<void> {
    this.authToken = token;
    await secureStorageService.storeCaregiverToken(token);
  }

  // Connect to WebSocket for real-time updates
  private async fetchWsTicket(): Promise<string | null> {
    if (!this.authToken) return null;
    try {
      const r = await fetch(`${this.baseUrl}/api/care/ws-ticket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.authToken}` },
      });
      if (!r.ok) return null;
      const data = await r.json();
      return data.ticket || null;
    } catch {
      return null;
    }
  }

  private async connectWebSocket() {
    if (!this.careCircleId || !this.authToken) return;

    this.isShuttingDown = false;
    const ticket = await this.fetchWsTicket();
    if (!ticket || this.isShuttingDown) {
      // Couldn't obtain a ticket — schedule a retry via the standard reconnect path.
      this.attemptReconnect();
      return;
    }
    const wsUrl =
      this.baseUrl.replace(/^http/, 'ws') +
      `/ws?circleId=${encodeURIComponent(this.careCircleId)}&ticket=${encodeURIComponent(ticket)}`;

    try {
      // Null out handlers on any existing ws before replacing, so onclose won't re-trigger reconnect
      if (this.ws) {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      }
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.debug('[CareCircleSync] WebSocket connected');
        this.reconnectAttempts = 0;

        // Auth happens via the upgrade-time ticket — no in-band auth message
        // needed. Subscribe to care circle updates.
        this.ws?.send(JSON.stringify({
          type: 'subscribe',
          circleId: this.careCircleId,
        }));

        this.notifyListeners('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleWebSocketMessage(message);
        } catch (error) {
          console.error('[CareCircleSync] Message parse error:', error);
        }
      };

      this.ws.onclose = () => {
        console.debug('[CareCircleSync] WebSocket disconnected');
        this.notifyListeners('disconnected');
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[CareCircleSync] WebSocket error:', error);
      };
    } catch (error) {
      console.error('[CareCircleSync] WebSocket connection error:', error);
    }
  }

  private disconnectWebSocket() {
    this.isShuttingDown = true;
    // Cancel any pending reconnect to prevent listener accumulation
    if (this.reconnectTimeoutId !== null) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.ws) {
      // Null out handlers before close so onclose does not trigger another reconnect
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private attemptReconnect() {
    if (this.isShuttingDown || this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.debug('[CareCircleSync] Not reconnecting (shutting down or max attempts reached)');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.debug(`[CareCircleSync] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      if (this.careCircleId && !this.isShuttingDown) {
        this.connectWebSocket();
      }
    }, delay);
  }

  private handleWebSocketMessage(message: { type: string; [key: string]: unknown }) {
    switch (message.type) {
      case 'sync_update':
        // The server broadcasts {applied, conflicts, entityTypes} — NOT an inline
        // changes array (reading message.changes was always undefined). Re-pull
        // the latest circle state to apply whatever changed.
        void this.pullFromCloud();
        this.notifyListeners('sync_update', message);
        break;

      case 'health_update':
        this.notifyListeners('health_update', message);
        break;

      case 'alert':
        // Abnormal-vital / missed-medication / missed-checkin alerts. Previously
        // ignored, so the patient device got no realtime caregiver signal.
        this.notifyListeners('alert', message);
        break;

      case 'member_joined':
        this.notifyListeners('member_joined', message.member);
        break;

      case 'member_left':
        this.notifyListeners('member_left', message.memberId);
        break;

      case 'connected':
      case 'pong':
        break;

      default:
        console.debug('[CareCircleSync] Unknown message type:', message.type);
    }
  }

  // Track a local change for sync
  async trackChange(
    entityType: string,
    entityId: string,
    action: 'create' | 'update' | 'delete',
    data: Record<string, unknown>
  ): Promise<void> {
    if (!this.careCircleId) return;

    const change: SyncChange = {
      id: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      entityType,
      entityId,
      action,
      data,
      timestamp: new Date().toISOString(),
      deviceId: this.deviceId,
    };

    this.pendingChanges.push(change);
    await this.savePendingChanges();

    // Try to push immediately
    this.pushToCloud();
  }

  // Push local changes to cloud
  async pushToCloud(): Promise<SyncResult> {
    if (!this.careCircleId || !this.authToken || this.pendingChanges.length === 0) {
      return { success: true, synced: 0, conflicts: [] };
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/care/circles/${this.careCircleId}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({
          changes: this.pendingChanges,
          deviceId: this.deviceId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, synced: 0, conflicts: [], error: error.error };
      }

      const result = await response.json();
      const syncedCount = result.synced ?? this.pendingChanges.length;

      // Clear synced changes
      this.pendingChanges = [];
      await this.savePendingChanges();
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());

      this.notifyListeners('push_complete', { synced: syncedCount });

      return {
        success: true,
        synced: syncedCount,
        conflicts: result.conflicts || [],
      };
    } catch (error) {
      console.error('[CareCircleSync] Push error:', error);
      // Increment retry counts; drop changes that have exceeded the cap
      this.pendingChanges = this.pendingChanges
        .map((c) => ({ ...c, retryCount: (c.retryCount ?? 0) + 1 }))
        .filter((c) => {
          if ((c.retryCount ?? 0) > MAX_CHANGE_RETRIES) {
            console.warn('[CareCircleSync] Dropping change after max retries:', c.id, c.entityType, c.action);
            return false;
          }
          return true;
        });
      await this.savePendingChanges();
      return { success: false, synced: 0, conflicts: [], error: 'Network error' };
    }
  }

  // Pull latest data from cloud
  async pullFromCloud(): Promise<SyncResult> {
    if (!this.careCircleId || !this.authToken) {
      return { success: false, synced: 0, conflicts: [], error: 'Not connected to care circle' };
    }

    try {
      const lastSync = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
      const url = new URL(`${this.baseUrl}/api/care/circles/${this.careCircleId}/sync`);
      if (lastSync) {
        url.searchParams.append('since', lastSync);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        this.lastSyncOk = false;
        return { success: false, synced: 0, conflicts: [], error: error.error };
      }

      const data = await response.json();

      // Apply remote data to local vault
      await this.applyRemoteData(data);
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
      this.lastSyncOk = true;

      this.notifyListeners('pull_complete', data);

      return { success: true, synced: 1, conflicts: [] };
    } catch (error) {
      console.error('[CareCircleSync] Pull error:', error);
      this.lastSyncOk = false;
      return { success: false, synced: 0, conflicts: [], error: 'Network error' };
    }
  }

  // Full sync: push then pull
  async sync(): Promise<SyncResult> {
    // First push local changes
    const pushResult = await this.pushToCloud();
    if (!pushResult.success) {
      return pushResult;
    }

    // Then pull remote changes
    const pullResult = await this.pullFromCloud();

    return {
      success: pullResult.success,
      synced: pushResult.synced + pullResult.synced,
      conflicts: [...pushResult.conflicts, ...pullResult.conflicts],
      // Propagate the real reason (e.g. 'Not connected to care circle',
      // 'Invalid or expired token') instead of dropping it and letting the UI
      // fall back to a generic "Unable to sync".
      error: pullResult.error,
    };
  }

  /**
   * Push health readings to the cloud. Health data is NOT part of the vault
   * change-log/sync; it has a dedicated append-only endpoint that also runs the
   * abnormal-vital threshold → caregiver_alert → WebSocket-broadcast pipeline
   * server-side. Returns success/error so callers can surface or retry.
   */
  async pushHealthReadings(
    readings: { dataType: string; value: unknown; unit?: string; measuredAt: string; source?: string; notes?: string }[]
  ): Promise<{ success: boolean; inserted?: number; error?: string }> {
    if (!this.careCircleId || !this.authToken) {
      return { success: false, error: 'Not connected to care circle' };
    }
    if (!readings || readings.length === 0) return { success: true, inserted: 0 };

    try {
      const response = await fetch(`${this.baseUrl}/api/care/circles/${this.careCircleId}/health`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({ readings }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return { success: false, error: err.error || `HTTP ${response.status}` };
      }
      const data = await response.json();
      return { success: true, inserted: data.inserted };
    } catch (error) {
      console.error('[CareCircleSync] Health push error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Push the patient's consent preferences to the care circle. The server route
   * is owner-only, which the patient (circle owner) satisfies. This keeps
   * care_circles.patient_consent in sync with the device so the server's consent
   * enforcement actually reflects the patient's choices (previously it never did
   * — the device never uploaded consent, so enforcement ran against an empty {}).
   */
  async pushConsent(consent: {
    globalDataSharing: boolean;
    consents: unknown[];
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.careCircleId || !this.authToken) {
      return { success: false, error: 'Not connected to care circle' };
    }
    try {
      const response = await fetch(`${this.baseUrl}/api/care/circles/${this.careCircleId}/consent`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({ consent }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return { success: false, error: err.error || `HTTP ${response.status}` };
      }
      return { success: true };
    } catch (error) {
      console.error('[CareCircleSync] Consent push error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Apply remote data to local vault
  private async applyRemoteData(data: {
    medications?: unknown[];
    doctors?: unknown[];
    appointments?: unknown[];
    contacts?: unknown[];
    notes?: unknown[];
  }): Promise<void> {
    if (!vaultService.isUnlocked()) {
      console.debug('[CareCircleSync] Vault locked, skipping data apply');
      return;
    }

    console.debug('[CareCircleSync] Merging remote data:', {
      medications: data.medications?.length || 0,
      doctors: data.doctors?.length || 0,
      appointments: data.appointments?.length || 0,
      contacts: data.contacts?.length || 0,
      notes: data.notes?.length || 0,
    });

    // Merge strategy: last-write-wins based on updatedAt timestamp
    // Remote items with newer updatedAt overwrite local; new items are added
    if (data.medications) {
      await this.mergeEntities(
        data.medications as any[],
        () => vaultService.getMedications(),
        (item: any) => vaultService.addMedication(item),
        (id: string, item: any) => vaultService.updateMedication(id, item),
      );
    }

    if (data.doctors) {
      await this.mergeEntities(
        data.doctors as any[],
        () => vaultService.getDoctors(),
        (item: any) => vaultService.addDoctor(item),
        (id: string, item: any) => vaultService.updateDoctor(id, item),
      );
    }

    if (data.appointments) {
      await this.mergeEntities(
        data.appointments as any[],
        () => vaultService.getAppointments(),
        (item: any) => vaultService.addAppointment(item),
        (id: string, item: any) => vaultService.updateAppointment(id, item),
      );
    }

    if (data.contacts) {
      await this.mergeEntities(
        data.contacts as any[],
        () => vaultService.getContacts(),
        (item: any) => vaultService.addContact(item),
        (id: string, item: any) => vaultService.updateContact(id, item),
      );
    }

    if (data.notes) {
      await this.mergeEntities(
        data.notes as any[],
        () => vaultService.getNotes(),
        (item: any) => vaultService.addNote(item),
        (_id: string, _item: any) => Promise.resolve(null), // Notes are append-only
      );
    }
  }

  /**
   * Last-write-wins decision for a remote item vs the local copy. Reads the
   * timestamp from EITHER snake_case (`updated_at`, as the server returns) or
   * camelCase (`updatedAt`, the local model) — the previous code only read
   * camelCase, so server `updated_at` was always undefined and remote edits
   * (e.g. a caregiver changing a medication) never overwrote the device.
   */
  static mergeDecision(remoteItem: any, localItem: any | undefined): 'add' | 'update' | 'skip' {
    if (!localItem) return 'add';
    const remoteTs = remoteItem?.updated_at ?? remoteItem?.updatedAt;
    const localTs = localItem?.updated_at ?? localItem?.updatedAt;
    if (!remoteTs) return 'skip'; // no remote timestamp — don't clobber local
    if (!localTs) return 'update'; // local has no timestamp — remote wins
    return new Date(remoteTs) > new Date(localTs) ? 'update' : 'skip';
  }

  // Server rows are snake_case; surface camelCase timestamps so locally-stored
  // items carry a usable updatedAt/createdAt for subsequent merges.
  private static normalizeTimestamps(item: any): any {
    const out = { ...item };
    if (out.updated_at && !out.updatedAt) out.updatedAt = out.updated_at;
    if (out.created_at && !out.createdAt) out.createdAt = out.created_at;
    return out;
  }

  private async mergeEntities<T extends { id: string; updatedAt?: string }>(
    remoteItems: T[],
    getLocal: () => Promise<T[]>,
    addItem: (item: any) => Promise<any>,
    updateItem: (id: string, item: any) => Promise<any>,
  ): Promise<void> {
    try {
      const localItems = await getLocal();
      const localMap = new Map(localItems.map(item => [item.id, item]));

      for (const remoteItem of remoteItems) {
        const localItem = localMap.get(remoteItem.id);
        const decision = CareCircleSyncService.mergeDecision(remoteItem, localItem);

        if (decision === 'add') {
          const { id: _id, ...rest } = remoteItem as any;
          await addItem(CareCircleSyncService.normalizeTimestamps(rest));
        } else if (decision === 'update') {
          const { id: _id2, createdAt: _c1, created_at: _c2, createdBy: _cb1, created_by: _cb2, ...updates } =
            remoteItem as any;
          await updateItem(remoteItem.id, CareCircleSyncService.normalizeTimestamps(updates));
        }
        // 'skip' → local is newer/equal or remote lacks a timestamp → keep local
      }
    } catch (error) {
      console.error('[CareCircleSync] Entity merge error:', error);
    }
  }

  // Handle real-time changes from other devices
  private async handleRemoteChanges(changes: SyncChange[]): Promise<void> {
    console.debug('[CareCircleSync] Received', changes.length, 'remote changes');

    // Filter out our own changes
    const remoteChanges = changes.filter((c) => c.deviceId !== this.deviceId);

    if (remoteChanges.length > 0) {
      this.notifyListeners('remote_changes', remoteChanges);

      // Trigger a pull to get the latest data
      await this.pullFromCloud();
    }
  }

  private async savePendingChanges(): Promise<void> {
    await AsyncStorage.setItem(
      STORAGE_KEYS.PENDING_CHANGES,
      JSON.stringify(this.pendingChanges)
    );
  }

  // Event listeners for sync events
  addSyncListener(listener: (event: string, data?: unknown) => void): () => void {
    this.syncListeners.push(listener);
    return () => {
      this.syncListeners = this.syncListeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(event: string, data?: unknown) {
    this.syncListeners.forEach((listener) => {
      try {
        listener(event, data);
      } catch (error) {
        console.error('[CareCircleSync] Listener error:', error);
      }
    });
  }

  // Get sync status
  async getSyncStatus(): Promise<{
    connected: boolean;
    careCircleId: string | null;
    pendingChanges: number;
    lastSync: string | null;
  }> {
    const lastSync = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);

    return {
      // "Connected" = we can reach the care circle. True when the realtime
      // WebSocket is open OR the last REST sync succeeded (the WS is only a
      // realtime nudge channel, so a successful sync without an open socket is
      // still "connected" — N2).
      connected:
        this.careCircleId !== null &&
        (this.ws?.readyState === WebSocket.OPEN || this.lastSyncOk),
      careCircleId: this.careCircleId,
      pendingChanges: this.pendingChanges.length,
      lastSync,
    };
  }
}

export { CareCircleSyncService };
export const careCircleSyncService = new CareCircleSyncService();
export default careCircleSyncService;

import AsyncStorage from '@react-native-async-storage/async-storage';
import { vaultService } from './vault';
import { secureStorageService } from './secureStorage';

const STORAGE_KEYS = {
  CARE_CIRCLE_ID: '@karuna_care_circle_id',
  DEVICE_ID: '@karuna_device_id',
  LAST_SYNC: '@karuna_last_sync',
  PENDING_CHANGES: '@karuna_pending_changes',
  AUTH_TOKEN: '@karuna_care_auth_token',
};

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
    const savedToken = savedTokenResult.success ? (savedTokenResult.token ?? null) : null;
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
        this.authToken = authToken;
        await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, authToken);
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
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.CARE_CIRCLE_ID,
      STORAGE_KEYS.PENDING_CHANGES,
      STORAGE_KEYS.LAST_SYNC,
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
        // Another device pushed changes
        this.handleRemoteChanges(message.changes as SyncChange[]);
        break;

      case 'member_joined':
        this.notifyListeners('member_joined', message.member);
        break;

      case 'member_left':
        this.notifyListeners('member_left', message.memberId);
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
        return { success: false, synced: 0, conflicts: [], error: error.error };
      }

      const data = await response.json();

      // Apply remote data to local vault
      await this.applyRemoteData(data);
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());

      this.notifyListeners('pull_complete', data);

      return { success: true, synced: 1, conflicts: [] };
    } catch (error) {
      console.error('[CareCircleSync] Pull error:', error);
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
    };
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

        if (!localItem) {
          // New item from remote - add it
          const { id: _id, ...rest } = remoteItem as any;
          await addItem(rest);
        } else if (remoteItem.updatedAt && localItem.updatedAt &&
                   new Date(remoteItem.updatedAt) > new Date(localItem.updatedAt)) {
          // Remote is newer - update local
          const { id: _id2, createdAt: _createdAt, createdBy: _createdBy, ...updates } = remoteItem as any;
          await updateItem(remoteItem.id, updates);
        }
        // Otherwise local is newer or same - keep local
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
      connected: this.careCircleId !== null && this.ws?.readyState === WebSocket.OPEN,
      careCircleId: this.careCircleId,
      pendingChanges: this.pendingChanges.length,
      lastSync,
    };
  }
}

export const careCircleSyncService = new CareCircleSyncService();
export default careCircleSyncService;

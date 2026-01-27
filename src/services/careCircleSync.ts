import AsyncStorage from '@react-native-async-storage/async-storage';
import { vaultService } from './vault';

const STORAGE_KEYS = {
  CARE_CIRCLE_ID: '@karuna_care_circle_id',
  DEVICE_ID: '@karuna_device_id',
  LAST_SYNC: '@karuna_last_sync',
  PENDING_CHANGES: '@karuna_pending_changes',
  AUTH_TOKEN: '@karuna_care_auth_token',
};

interface SyncChange {
  id: string;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  data: Record<string, unknown>;
  timestamp: string;
  deviceId: string;
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
    const savedToken = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    const savedChanges = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_CHANGES);

    if (savedCircleId) this.careCircleId = savedCircleId;
    if (savedToken) this.authToken = savedToken;
    if (savedChanges) this.pendingChanges = JSON.parse(savedChanges);

    console.log('[CareCircleSync] Initialized with device:', this.deviceId);
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

      const circle = await response.json();
      this.careCircleId = circle.id;
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
    await AsyncStorage.removeItem(STORAGE_KEYS.CARE_CIRCLE_ID);
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
    await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
  }

  // Connect to WebSocket for real-time updates
  private connectWebSocket() {
    if (!this.careCircleId || !this.authToken) return;

    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/ws';

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[CareCircleSync] WebSocket connected');
        this.reconnectAttempts = 0;

        // Authenticate
        this.ws?.send(JSON.stringify({
          type: 'auth',
          token: this.authToken,
        }));

        // Subscribe to care circle updates
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
        console.log('[CareCircleSync] WebSocket disconnected');
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[CareCircleSync] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`[CareCircleSync] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      if (this.careCircleId) {
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
        console.log('[CareCircleSync] Unknown message type:', message.type);
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

      // Clear synced changes
      this.pendingChanges = [];
      await this.savePendingChanges();
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());

      this.notifyListeners('push_complete', { synced: result.synced });

      return {
        success: true,
        synced: result.synced || this.pendingChanges.length,
        conflicts: result.conflicts || [],
      };
    } catch (error) {
      console.error('[CareCircleSync] Push error:', error);
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
      console.log('[CareCircleSync] Vault locked, skipping data apply');
      return;
    }

    // This would merge remote data with local data
    // For now, just log that we received data
    console.log('[CareCircleSync] Received remote data:', {
      medications: data.medications?.length || 0,
      doctors: data.doctors?.length || 0,
      appointments: data.appointments?.length || 0,
      contacts: data.contacts?.length || 0,
      notes: data.notes?.length || 0,
    });

    // The actual merge logic would depend on your conflict resolution strategy
    // For caregivers syncing with elderly device, typically:
    // - Elderly device is source of truth for their data
    // - Caregivers can add notes and view data
    // - Updates from caregivers need to be approved or auto-merged
  }

  // Handle real-time changes from other devices
  private async handleRemoteChanges(changes: SyncChange[]): Promise<void> {
    console.log('[CareCircleSync] Received', changes.length, 'remote changes');

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

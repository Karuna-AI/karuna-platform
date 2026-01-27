import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@karuna_audit_log';
const MAX_LOG_ENTRIES = 1000;
const LOG_RETENTION_DAYS = 90;

export type AuditCategory =
  | 'security'
  | 'vault'
  | 'consent'
  | 'caregiver'
  | 'data_access'
  | 'data_modification'
  | 'system';

export type AuditAction =
  // Security actions
  | 'auth_pin_success'
  | 'auth_pin_failed'
  | 'auth_biometric_success'
  | 'auth_biometric_failed'
  | 'security_pin_set'
  | 'security_pin_removed'
  | 'security_pin_changed'
  | 'biometric_enabled'
  | 'biometric_disabled'
  | 'app_lock_enabled'
  | 'app_lock_disabled'
  | 'vault_lock_enabled'
  | 'vault_lock_disabled'
  | 'app_locked'
  | 'secure_store_write'
  | 'secure_store_read'
  | 'secure_store_delete'
  | 'secure_store_cleared'
  // Vault actions
  | 'vault_unlocked'
  | 'vault_locked'
  | 'vault_data_created'
  | 'vault_data_updated'
  | 'vault_data_deleted'
  | 'vault_data_viewed'
  // Consent actions
  | 'consent_granted'
  | 'consent_revoked'
  | 'consent_updated'
  | 'consent_viewed'
  // Caregiver actions
  | 'caregiver_joined'
  | 'caregiver_left'
  | 'caregiver_data_sync'
  | 'caregiver_data_viewed'
  | 'caregiver_note_added'
  // Data actions
  | 'data_exported'
  | 'data_imported'
  | 'data_deleted'
  // System actions
  | 'app_opened'
  | 'app_closed'
  | 'error_occurred';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: AuditAction | string;
  category: AuditCategory;
  description: string;
  userId?: string;
  userName?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  deviceInfo?: {
    platform: string;
    deviceId?: string;
  };
}

export interface AuditLogFilter {
  category?: AuditCategory;
  action?: AuditAction | string;
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  entityType?: string;
  limit?: number;
}

class AuditLogService {
  private logs: AuditLogEntry[] = [];
  private isInitialized: boolean = false;
  private deviceId: string = '';

  async initialize(deviceId?: string): Promise<void> {
    if (this.isInitialized) return;

    this.deviceId = deviceId || 'unknown';

    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
        // Clean up old entries
        await this.pruneOldEntries();
      }
      this.isInitialized = true;
      console.log('[AuditLog] Initialized with', this.logs.length, 'entries');
    } catch (error) {
      console.error('[AuditLog] Initialization error:', error);
      this.logs = [];
      this.isInitialized = true;
    }
  }

  /**
   * Log an audit event
   */
  async log(params: {
    action: AuditAction | string;
    category: AuditCategory;
    description: string;
    userId?: string;
    userName?: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const entry: AuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      action: params.action,
      category: params.category,
      description: params.description,
      userId: params.userId,
      userName: params.userName,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: params.metadata,
      deviceInfo: {
        platform: 'react-native',
        deviceId: this.deviceId,
      },
    };

    this.logs.unshift(entry);

    // Trim to max entries
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs = this.logs.slice(0, MAX_LOG_ENTRIES);
    }

    await this.save();
  }

  /**
   * Log vault access
   */
  async logVaultAccess(params: {
    action: 'viewed' | 'created' | 'updated' | 'deleted';
    entityType: string;
    entityId: string;
    entityName?: string;
    userId?: string;
    userName?: string;
  }): Promise<void> {
    const actionMap = {
      viewed: 'vault_data_viewed',
      created: 'vault_data_created',
      updated: 'vault_data_updated',
      deleted: 'vault_data_deleted',
    };

    await this.log({
      action: actionMap[params.action],
      category: 'vault',
      description: `${params.entityType} ${params.action}: ${params.entityName || params.entityId}`,
      entityType: params.entityType,
      entityId: params.entityId,
      userId: params.userId,
      userName: params.userName,
    });
  }

  /**
   * Log caregiver activity
   */
  async logCaregiverActivity(params: {
    action: 'joined' | 'left' | 'sync' | 'viewed' | 'note_added';
    caregiverId: string;
    caregiverName: string;
    details?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const actionMap = {
      joined: 'caregiver_joined',
      left: 'caregiver_left',
      sync: 'caregiver_data_sync',
      viewed: 'caregiver_data_viewed',
      note_added: 'caregiver_note_added',
    };

    await this.log({
      action: actionMap[params.action],
      category: 'caregiver',
      description: params.details || `Caregiver ${params.caregiverName} ${params.action}`,
      userId: params.caregiverId,
      userName: params.caregiverName,
      metadata: params.metadata,
    });
  }

  /**
   * Log consent changes
   */
  async logConsentChange(params: {
    action: 'granted' | 'revoked' | 'updated' | 'viewed';
    consentCategory: string;
    grantedTo?: string;
    details?: string;
  }): Promise<void> {
    const actionMap = {
      granted: 'consent_granted',
      revoked: 'consent_revoked',
      updated: 'consent_updated',
      viewed: 'consent_viewed',
    };

    await this.log({
      action: actionMap[params.action],
      category: 'consent',
      description: params.details || `Consent ${params.action} for ${params.consentCategory}`,
      metadata: {
        consentCategory: params.consentCategory,
        grantedTo: params.grantedTo,
      },
    });
  }

  /**
   * Get all logs with optional filtering
   */
  getLogs(filter?: AuditLogFilter): AuditLogEntry[] {
    let results = [...this.logs];

    if (filter) {
      if (filter.category) {
        results = results.filter((log) => log.category === filter.category);
      }
      if (filter.action) {
        results = results.filter((log) => log.action === filter.action);
      }
      if (filter.startDate) {
        results = results.filter(
          (log) => new Date(log.timestamp) >= filter.startDate!
        );
      }
      if (filter.endDate) {
        results = results.filter(
          (log) => new Date(log.timestamp) <= filter.endDate!
        );
      }
      if (filter.userId) {
        results = results.filter((log) => log.userId === filter.userId);
      }
      if (filter.entityType) {
        results = results.filter((log) => log.entityType === filter.entityType);
      }
      if (filter.limit) {
        results = results.slice(0, filter.limit);
      }
    }

    return results;
  }

  /**
   * Get recent security events
   */
  getSecurityEvents(limit: number = 50): AuditLogEntry[] {
    return this.getLogs({ category: 'security', limit });
  }

  /**
   * Get vault access history
   */
  getVaultAccessHistory(limit: number = 50): AuditLogEntry[] {
    return this.getLogs({ category: 'vault', limit });
  }

  /**
   * Get caregiver activity
   */
  getCaregiverActivity(limit: number = 50): AuditLogEntry[] {
    return this.getLogs({ category: 'caregiver', limit });
  }

  /**
   * Get consent changes
   */
  getConsentHistory(limit: number = 50): AuditLogEntry[] {
    return this.getLogs({ category: 'consent', limit });
  }

  /**
   * Get activity summary for display
   */
  getActivitySummary(): {
    totalEntries: number;
    securityEvents: number;
    vaultAccess: number;
    caregiverActivity: number;
    consentChanges: number;
    lastSecurityEvent?: AuditLogEntry;
    lastVaultAccess?: AuditLogEntry;
  } {
    const securityLogs = this.getLogs({ category: 'security' });
    const vaultLogs = this.getLogs({ category: 'vault' });
    const caregiverLogs = this.getLogs({ category: 'caregiver' });
    const consentLogs = this.getLogs({ category: 'consent' });

    return {
      totalEntries: this.logs.length,
      securityEvents: securityLogs.length,
      vaultAccess: vaultLogs.length,
      caregiverActivity: caregiverLogs.length,
      consentChanges: consentLogs.length,
      lastSecurityEvent: securityLogs[0],
      lastVaultAccess: vaultLogs[0],
    };
  }

  /**
   * Export logs for review
   */
  exportLogs(filter?: AuditLogFilter): string {
    const logs = this.getLogs(filter);
    return JSON.stringify(logs, null, 2);
  }

  /**
   * Clear all logs (with audit entry)
   */
  async clearLogs(): Promise<void> {
    // Log the clear action before clearing
    await this.log({
      action: 'data_deleted',
      category: 'system',
      description: 'Audit logs were cleared',
    });

    // Keep only the clear action
    this.logs = this.logs.slice(0, 1);
    await this.save();
  }

  /**
   * Remove entries older than retention period
   */
  private async pruneOldEntries(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - LOG_RETENTION_DAYS);

    const originalCount = this.logs.length;
    this.logs = this.logs.filter(
      (log) => new Date(log.timestamp) > cutoffDate
    );

    if (this.logs.length < originalCount) {
      console.log(
        '[AuditLog] Pruned',
        originalCount - this.logs.length,
        'old entries'
      );
      await this.save();
    }
  }

  /**
   * Save logs to storage
   */
  private async save(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
    } catch (error) {
      console.error('[AuditLog] Save error:', error);
    }
  }
}

export const auditLogService = new AuditLogService();
export default auditLogService;

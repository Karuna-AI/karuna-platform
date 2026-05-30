/**
 * Audit Log Service Tests
 * Tests for event logging, trimming, retention, filtering, and clearing behaviour.
 *
 * Note: jest.config.js moduleNameMapper already routes
 *   @react-native-async-storage/async-storage → src/web/async-storage-mock.ts
 * so no jest.mock() factory is needed here.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { auditLogService, AuditCategory } from '../../src/services/auditLog';

const STORAGE_KEY = '@karuna_audit_log';

/** Reset the service to a clean, uninitialized state between tests. */
async function resetService(): Promise<void> {
  // Clear backing store
  localStorage.clear();
  // Reinitialize so the singleton picks up the empty store
  // Access private field by casting – needed because the class has no public reset().
  (auditLogService as any).logs = [];
  (auditLogService as any).isInitialized = false;
  (auditLogService as any).deviceId = '';
}

describe('AuditLogService', () => {
  beforeEach(async () => {
    await resetService();
  });

  // ---------------------------------------------------------------------------
  // initialize
  // ---------------------------------------------------------------------------
  describe('initialize', () => {
    it('initializes with empty logs when no stored data exists', async () => {
      await auditLogService.initialize('device-001');

      expect(auditLogService.getLogs()).toHaveLength(0);
    });

    it('loads persisted logs from AsyncStorage on startup', async () => {
      const entries = [
        {
          id: 'audit_1_abc',
          timestamp: new Date().toISOString(),
          action: 'app_opened',
          category: 'system' as AuditCategory,
          description: 'App opened',
          deviceInfo: { platform: 'react-native', deviceId: 'device-001' },
        },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));

      await auditLogService.initialize('device-001');

      expect(auditLogService.getLogs()).toHaveLength(1);
      expect(auditLogService.getLogs()[0].id).toBe('audit_1_abc');
    });

    it('is idempotent – calling initialize twice does not double-load', async () => {
      const entries = [
        {
          id: 'audit_2_xyz',
          timestamp: new Date().toISOString(),
          action: 'app_opened',
          category: 'system' as AuditCategory,
          description: 'App opened',
          deviceInfo: { platform: 'react-native' },
        },
      ];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));

      await auditLogService.initialize('device-001');
      await auditLogService.initialize('device-001'); // second call should be a no-op

      expect(auditLogService.getLogs()).toHaveLength(1);
    });

    it('prunes entries older than 90 days during initialization', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100); // 100 days ago

      const oldEntry = {
        id: 'old_entry',
        timestamp: oldDate.toISOString(),
        action: 'app_opened',
        category: 'system' as AuditCategory,
        description: 'Very old entry',
        deviceInfo: { platform: 'react-native' },
      };
      const freshEntry = {
        id: 'fresh_entry',
        timestamp: new Date().toISOString(),
        action: 'app_opened',
        category: 'system' as AuditCategory,
        description: 'Recent entry',
        deviceInfo: { platform: 'react-native' },
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([oldEntry, freshEntry]));

      await auditLogService.initialize('device-001');
      const logs = auditLogService.getLogs();

      expect(logs.some((l) => l.id === 'old_entry')).toBe(false);
      expect(logs.some((l) => l.id === 'fresh_entry')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // log
  // ---------------------------------------------------------------------------
  describe('log', () => {
    beforeEach(async () => {
      await auditLogService.initialize('device-001');
    });

    it('adds a single entry to the log', async () => {
      await auditLogService.log({
        action: 'auth_pin_success',
        category: 'security',
        description: 'User authenticated with PIN',
      });

      expect(auditLogService.getLogs()).toHaveLength(1);
    });

    it('creates entries with id, timestamp, and deviceInfo fields', async () => {
      await auditLogService.log({
        action: 'vault_unlocked',
        category: 'vault',
        description: 'Vault opened',
      });

      const entry = auditLogService.getLogs()[0];
      expect(entry.id).toMatch(/^audit_/);
      expect(entry.timestamp).toBeTruthy();
      expect(entry.deviceInfo?.platform).toBe('react-native');
    });

    it('stores optional fields when provided', async () => {
      await auditLogService.log({
        action: 'data_exported',
        category: 'data_access',
        description: 'User exported data',
        userId: 'user-42',
        userName: 'Ramesh',
        entityType: 'medication',
        entityId: 'med-99',
        metadata: { format: 'csv' },
      });

      const entry = auditLogService.getLogs()[0];
      expect(entry.userId).toBe('user-42');
      expect(entry.userName).toBe('Ramesh');
      expect(entry.entityType).toBe('medication');
      expect(entry.entityId).toBe('med-99');
      expect(entry.metadata?.format).toBe('csv');
    });

    it('inserts entries in reverse-chronological order (newest first)', async () => {
      await auditLogService.log({ action: 'app_opened', category: 'system', description: 'First' });
      await auditLogService.log({ action: 'app_closed', category: 'system', description: 'Second' });

      const logs = auditLogService.getLogs();
      expect(logs[0].description).toBe('Second');
      expect(logs[1].description).toBe('First');
    });

    it('persists the new entry to AsyncStorage', async () => {
      await auditLogService.log({
        action: 'auth_pin_success',
        category: 'security',
        description: 'Persisted entry',
      });

      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const stored = JSON.parse(raw as string);
      expect(stored).toHaveLength(1);
      expect(stored[0].description).toBe('Persisted entry');
    });

    it('trims log to MAX_LOG_ENTRIES (1000) when it would exceed the limit', async () => {
      // Seed 999 synthetic entries directly to avoid slow loops
      const entries = Array.from({ length: 999 }, (_, i) => ({
        id: `seed_${i}`,
        timestamp: new Date().toISOString(),
        action: 'app_opened',
        category: 'system' as AuditCategory,
        description: `Seed entry ${i}`,
        deviceInfo: { platform: 'react-native' },
      }));
      (auditLogService as any).logs = entries;

      // Adding one more entry (total 1000) should still be exactly 1000
      await auditLogService.log({ action: 'app_closed', category: 'system', description: '1000th entry' });
      expect(auditLogService.getLogs()).toHaveLength(1000);

      // Adding entry 1001 should trim to 1000
      await auditLogService.log({ action: 'error_occurred', category: 'system', description: '1001st entry' });
      expect(auditLogService.getLogs()).toHaveLength(1000);
      // Newest entry should be at index 0
      expect(auditLogService.getLogs()[0].description).toBe('1001st entry');
    });
  });

  // ---------------------------------------------------------------------------
  // getLogs – filtering
  // ---------------------------------------------------------------------------
  describe('getLogs with filters', () => {
    beforeEach(async () => {
      await auditLogService.initialize('device-001');

      await auditLogService.log({ action: 'auth_pin_success', category: 'security', description: 'Login 1', userId: 'u1' });
      await auditLogService.log({ action: 'vault_unlocked', category: 'vault', description: 'Vault open', userId: 'u2' });
      await auditLogService.log({ action: 'consent_granted', category: 'consent', description: 'Consent', userId: 'u1' });
      await auditLogService.log({ action: 'auth_pin_failed', category: 'security', description: 'Login 2', userId: 'u1' });
    });

    it('returns all entries when no filter is applied', () => {
      expect(auditLogService.getLogs()).toHaveLength(4);
    });

    it('filters by category', () => {
      const results = auditLogService.getLogs({ category: 'security' });
      expect(results).toHaveLength(2);
      results.forEach((e) => expect(e.category).toBe('security'));
    });

    it('filters by action', () => {
      const results = auditLogService.getLogs({ action: 'auth_pin_success' });
      expect(results).toHaveLength(1);
      expect(results[0].action).toBe('auth_pin_success');
    });

    it('filters by userId', () => {
      const results = auditLogService.getLogs({ userId: 'u1' });
      expect(results).toHaveLength(3);
      results.forEach((e) => expect(e.userId).toBe('u1'));
    });

    it('applies limit correctly', () => {
      const results = auditLogService.getLogs({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('filters by startDate – excludes entries before the date', () => {
      const future = new Date(Date.now() + 60 * 1000); // 1 minute from now
      const results = auditLogService.getLogs({ startDate: future });
      expect(results).toHaveLength(0);
    });

    it('filters by endDate – excludes entries after the date', () => {
      const past = new Date(Date.now() - 60 * 1000); // 1 minute ago
      const results = auditLogService.getLogs({ endDate: past });
      expect(results).toHaveLength(0);
    });

    it('filters by entityType', async () => {
      await auditLogService.log({
        action: 'vault_data_viewed',
        category: 'vault',
        description: 'viewed medication',
        entityType: 'medication',
      });

      const results = auditLogService.getLogs({ entityType: 'medication' });
      expect(results).toHaveLength(1);
      expect(results[0].entityType).toBe('medication');
    });
  });

  // ---------------------------------------------------------------------------
  // Convenience getters
  // ---------------------------------------------------------------------------
  describe('convenience getters', () => {
    beforeEach(async () => {
      await auditLogService.initialize('device-001');
      await auditLogService.log({ action: 'auth_pin_success', category: 'security', description: 'Login' });
      await auditLogService.log({ action: 'vault_unlocked', category: 'vault', description: 'Vault' });
      await auditLogService.log({ action: 'caregiver_joined', category: 'caregiver', description: 'Caregiver' });
      await auditLogService.log({ action: 'consent_granted', category: 'consent', description: 'Consent' });
    });

    it('getSecurityEvents returns only security-category entries', () => {
      const events = auditLogService.getSecurityEvents();
      expect(events.length).toBeGreaterThanOrEqual(1);
      events.forEach((e) => expect(e.category).toBe('security'));
    });

    it('getVaultAccessHistory returns only vault-category entries', () => {
      const events = auditLogService.getVaultAccessHistory();
      expect(events.length).toBeGreaterThanOrEqual(1);
      events.forEach((e) => expect(e.category).toBe('vault'));
    });

    it('getCaregiverActivity returns only caregiver-category entries', () => {
      const events = auditLogService.getCaregiverActivity();
      expect(events.length).toBeGreaterThanOrEqual(1);
      events.forEach((e) => expect(e.category).toBe('caregiver'));
    });

    it('getConsentHistory returns only consent-category entries', () => {
      const events = auditLogService.getConsentHistory();
      expect(events.length).toBeGreaterThanOrEqual(1);
      events.forEach((e) => expect(e.category).toBe('consent'));
    });

    it('getActivitySummary reports correct category counts', () => {
      const summary = auditLogService.getActivitySummary();
      expect(summary.totalEntries).toBe(4);
      expect(summary.securityEvents).toBe(1);
      expect(summary.vaultAccess).toBe(1);
      expect(summary.caregiverActivity).toBe(1);
      expect(summary.consentChanges).toBe(1);
    });

    it('getActivitySummary exposes the most-recent security event', () => {
      const summary = auditLogService.getActivitySummary();
      expect(summary.lastSecurityEvent).toBeDefined();
      expect(summary.lastSecurityEvent?.category).toBe('security');
    });
  });

  // ---------------------------------------------------------------------------
  // clearLogs
  // ---------------------------------------------------------------------------
  describe('clearLogs', () => {
    beforeEach(async () => {
      await auditLogService.initialize('device-001');
      await auditLogService.log({ action: 'app_opened', category: 'system', description: 'Entry 1' });
      await auditLogService.log({ action: 'app_opened', category: 'system', description: 'Entry 2' });
    });

    it('leaves exactly one entry after clearing (the clear-action entry itself)', async () => {
      await auditLogService.clearLogs();
      expect(auditLogService.getLogs()).toHaveLength(1);
    });

    it('the retained entry has action data_deleted', async () => {
      await auditLogService.clearLogs();
      expect(auditLogService.getLogs()[0].action).toBe('data_deleted');
    });

    it('persists the cleared state to AsyncStorage', async () => {
      await auditLogService.clearLogs();
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const stored = JSON.parse(raw as string);
      expect(stored).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // logVaultAccess helper
  // ---------------------------------------------------------------------------
  describe('logVaultAccess', () => {
    beforeEach(async () => {
      await auditLogService.initialize('device-001');
    });

    it('maps action "viewed" to vault_data_viewed', async () => {
      await auditLogService.logVaultAccess({
        action: 'viewed',
        entityType: 'medication',
        entityId: 'med-1',
      });
      expect(auditLogService.getLogs()[0].action).toBe('vault_data_viewed');
    });

    it('maps action "deleted" to vault_data_deleted', async () => {
      await auditLogService.logVaultAccess({
        action: 'deleted',
        entityType: 'document',
        entityId: 'doc-5',
      });
      expect(auditLogService.getLogs()[0].action).toBe('vault_data_deleted');
    });
  });

  // ---------------------------------------------------------------------------
  // logCaregiverActivity helper
  // ---------------------------------------------------------------------------
  describe('logCaregiverActivity', () => {
    beforeEach(async () => {
      await auditLogService.initialize('device-001');
    });

    it('maps action "joined" to caregiver_joined and captures caregiverId', async () => {
      await auditLogService.logCaregiverActivity({
        action: 'joined',
        caregiverId: 'cg-7',
        caregiverName: 'Priya',
      });
      const entry = auditLogService.getLogs()[0];
      expect(entry.action).toBe('caregiver_joined');
      expect(entry.userId).toBe('cg-7');
      expect(entry.userName).toBe('Priya');
    });
  });

  // ---------------------------------------------------------------------------
  // logConsentChange helper
  // ---------------------------------------------------------------------------
  describe('logConsentChange', () => {
    beforeEach(async () => {
      await auditLogService.initialize('device-001');
    });

    it('maps action "granted" to consent_granted', async () => {
      await auditLogService.logConsentChange({
        action: 'granted',
        consentCategory: 'health_data',
        grantedTo: 'AI Assistant',
      });
      expect(auditLogService.getLogs()[0].action).toBe('consent_granted');
    });

    it('stores consentCategory and grantedTo in metadata', async () => {
      await auditLogService.logConsentChange({
        action: 'revoked',
        consentCategory: 'location_data',
        grantedTo: 'Karuna App',
      });
      const entry = auditLogService.getLogs()[0];
      expect(entry.metadata?.consentCategory).toBe('location_data');
      expect(entry.metadata?.grantedTo).toBe('Karuna App');
    });
  });

  // ---------------------------------------------------------------------------
  // exportLogs
  // ---------------------------------------------------------------------------
  describe('exportLogs', () => {
    beforeEach(async () => {
      await auditLogService.initialize('device-001');
      await auditLogService.log({ action: 'app_opened', category: 'system', description: 'Export test' });
    });

    it('returns a valid JSON string', () => {
      const exported = auditLogService.exportLogs();
      expect(() => JSON.parse(exported)).not.toThrow();
    });

    it('exported JSON contains the logged entries', () => {
      const exported = JSON.parse(auditLogService.exportLogs());
      expect(exported).toHaveLength(1);
      expect(exported[0].description).toBe('Export test');
    });

    it('supports category filter on export', async () => {
      await auditLogService.log({ action: 'auth_pin_success', category: 'security', description: 'Security event' });
      const exported = JSON.parse(auditLogService.exportLogs({ category: 'security' }));
      expect(exported).toHaveLength(1);
      expect(exported[0].category).toBe('security');
    });
  });
});

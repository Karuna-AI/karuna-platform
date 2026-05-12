/**
 * Consent Service Tests
 * Tests for consent granting, revoking, querying, required-consent enforcement,
 * global sharing flag, listener notification, and AsyncStorage persistence.
 *
 * Note: jest.config.js moduleNameMapper already routes
 *   @react-native-async-storage/async-storage → src/web/async-storage-mock.ts
 * so no jest.mock() factory is needed for AsyncStorage.
 */

// Stub auditLogService so its async calls don't interfere with consent tests.
jest.mock('../../src/services/auditLog', () => ({
  auditLogService: {
    logConsentChange: jest.fn().mockResolvedValue(undefined),
    initialize: jest.fn().mockResolvedValue(undefined),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { consentService } from '../../src/services/consent';
import { auditLogService } from '../../src/services/auditLog';
import { ConsentCategory, ConsentGrantee, AccessLevel } from '../../src/types/consent';

const STORAGE_KEY = '@karuna_consent_preferences';

/** Full reset between tests. */
async function resetConsentService(): Promise<void> {
  localStorage.clear();
  (consentService as any).preferences = null;
  (consentService as any).isInitialized = false;
  (consentService as any).consentChangeListeners = [];
}

describe('ConsentService', () => {
  beforeEach(async () => {
    await resetConsentService();
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // initialize
  // ---------------------------------------------------------------------------
  describe('initialize', () => {
    it('creates default preferences when no stored data exists', async () => {
      await consentService.initialize('user-1');

      // Check via exported API rather than internal state
      expect(consentService.isGlobalSharingEnabled()).toBe(false);
    });

    it('stores default preferences to AsyncStorage on first init', async () => {
      await consentService.initialize('user-1');

      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      const prefs = JSON.parse(raw as string);
      expect(prefs.userId).toBe('user-1');
      expect(prefs.consents).toEqual([]);
    });

    it('loads existing preferences from AsyncStorage', async () => {
      const storedPrefs = {
        userId: 'user-2',
        consents: [
          {
            id: 'consent_stored_1',
            category: 'health_data',
            grantee: 'app',
            accessLevel: 'read',
            grantedAt: new Date().toISOString(),
            version: 1,
          },
        ],
        defaultAccessLevels: {
          health_data: 'none', financial_data: 'none', personal_documents: 'none',
          contact_info: 'none', location_data: 'none', voice_data: 'read',
          usage_analytics: 'read', caregiver_sharing: 'none',
        },
        lastReviewedAt: new Date().toISOString(),
        globalDataSharing: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedPrefs));

      await consentService.initialize('user-2');

      expect(consentService.getConsent('health_data', 'app')).not.toBeNull();
    });

    it('is idempotent – calling initialize twice does not duplicate data', async () => {
      await consentService.initialize('user-1');
      await consentService.initialize('user-1');

      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const prefs = JSON.parse(raw as string);
      expect(prefs.consents).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // grantConsent
  // ---------------------------------------------------------------------------
  describe('grantConsent', () => {
    beforeEach(async () => {
      await consentService.initialize('user-1');
    });

    it('returns success true when granting a non-caregiver consent', async () => {
      const result = await consentService.grantConsent('health_data', 'app', 'read');
      expect(result.success).toBe(true);
    });

    it('adds a consent record that is then retrievable', async () => {
      await consentService.grantConsent('health_data', 'app', 'read');

      const record = consentService.getConsent('health_data', 'app');
      expect(record).not.toBeNull();
      expect(record?.accessLevel).toBe('read');
    });

    it('persists the granted consent to AsyncStorage', async () => {
      await consentService.grantConsent('contact_info', 'app', 'write');

      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const prefs = JSON.parse(raw as string);
      const record = prefs.consents.find(
        (c: any) => c.category === 'contact_info' && c.grantee === 'app'
      );
      expect(record).toBeDefined();
      expect(record.accessLevel).toBe('write');
    });

    it('updates an existing active consent when called again (version increments)', async () => {
      await consentService.grantConsent('health_data', 'app', 'read');
      await consentService.grantConsent('health_data', 'app', 'write');

      const record = consentService.getConsent('health_data', 'app');
      expect(record?.accessLevel).toBe('write');
      expect(record?.version).toBe(2);
    });

    it('rejects caregiver grantee when global sharing is disabled', async () => {
      const result = await consentService.grantConsent('health_data', 'caregiver_member', 'read');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/global data sharing/i);
    });

    it('allows caregiver grantee when global sharing is enabled', async () => {
      await consentService.setGlobalDataSharing(true);

      const result = await consentService.grantConsent('health_data', 'caregiver_member', 'read');
      expect(result.success).toBe(true);
    });

    it('calls auditLogService.logConsentChange on success', async () => {
      await consentService.grantConsent('voice_data', 'ai_assistant', 'read');

      expect(auditLogService.logConsentChange).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'granted', consentCategory: 'voice_data' })
      );
    });

    it('fires change listeners on grant', async () => {
      const listener = jest.fn();
      consentService.addChangeListener(listener);

      await consentService.grantConsent('contact_info', 'app', 'read');

      expect(listener).toHaveBeenCalledWith({ category: 'contact_info', grantee: 'app' });
    });

    it('supports optional expiry, scope, and reason fields', async () => {
      const futureDate = new Date(Date.now() + 86400_000).toISOString();
      await consentService.grantConsent('personal_documents', 'backup_service', 'read', {
        expiresAt: futureDate,
        reason: 'Backup setup',
        scope: { includesIdDocuments: true },
      });

      const record = consentService.getConsent('personal_documents', 'backup_service');
      expect(record?.expiresAt).toBe(futureDate);
      expect(record?.reason).toBe('Backup setup');
      expect(record?.scope?.includesIdDocuments).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // revokeConsent
  // ---------------------------------------------------------------------------
  describe('revokeConsent', () => {
    beforeEach(async () => {
      await consentService.initialize('user-1');
      await consentService.grantConsent('health_data', 'app', 'read');
    });

    it('returns success true for a valid active consent', async () => {
      const result = await consentService.revokeConsent('health_data', 'app');
      expect(result.success).toBe(true);
    });

    it('consent is no longer active after revocation', async () => {
      await consentService.revokeConsent('health_data', 'app');

      const record = consentService.getConsent('health_data', 'app');
      expect(record).toBeNull();
    });

    it('marks the record with revokedAt instead of deleting it', async () => {
      await consentService.revokeConsent('health_data', 'app');

      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const prefs = JSON.parse(raw as string);
      const record = prefs.consents.find(
        (c: any) => c.category === 'health_data' && c.grantee === 'app'
      );
      expect(record.revokedAt).toBeDefined();
    });

    it('returns error when no active consent exists', async () => {
      const result = await consentService.revokeConsent('financial_data', 'app');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no active consent/i);
    });

    it('blocks revocation of required consents (voice_data / app)', async () => {
      await consentService.grantConsent('voice_data', 'app', 'read');

      const result = await consentService.revokeConsent('voice_data', 'app');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/required/i);
    });

    it('blocks revocation of required consent (voice_data / ai_assistant)', async () => {
      await consentService.grantConsent('voice_data', 'ai_assistant', 'read');

      const result = await consentService.revokeConsent('voice_data', 'ai_assistant');
      expect(result.success).toBe(false);
    });

    it('fires change listeners on revoke', async () => {
      const listener = jest.fn();
      consentService.addChangeListener(listener);

      await consentService.revokeConsent('health_data', 'app');

      expect(listener).toHaveBeenCalledWith({ category: 'health_data', grantee: 'app' });
    });
  });

  // ---------------------------------------------------------------------------
  // hasConsent
  // ---------------------------------------------------------------------------
  describe('hasConsent', () => {
    beforeEach(async () => {
      await consentService.initialize('user-1');
    });

    it('returns false when no consent exists', () => {
      expect(consentService.hasConsent('financial_data', 'app')).toBe(false);
    });

    it('returns true when a matching active consent exists', async () => {
      await consentService.grantConsent('financial_data', 'app', 'read');

      expect(consentService.hasConsent('financial_data', 'app')).toBe(true);
    });

    it('returns false for revoked consent', async () => {
      await consentService.grantConsent('financial_data', 'app', 'read');
      await consentService.revokeConsent('financial_data', 'app');

      expect(consentService.hasConsent('financial_data', 'app')).toBe(false);
    });

    it('returns false when access level is insufficient (have read, need write)', async () => {
      await consentService.grantConsent('health_data', 'app', 'read');

      expect(consentService.hasConsent('health_data', 'app', 'write')).toBe(false);
    });

    it('returns true when access level meets or exceeds requirement', async () => {
      await consentService.grantConsent('health_data', 'app', 'full');

      expect(consentService.hasConsent('health_data', 'app', 'read')).toBe(true);
      expect(consentService.hasConsent('health_data', 'app', 'write')).toBe(true);
      expect(consentService.hasConsent('health_data', 'app', 'full')).toBe(true);
    });

    it('returns false for expired consent', async () => {
      const pastDate = new Date(Date.now() - 1000).toISOString();
      await consentService.grantConsent('location_data', 'app', 'read', {
        expiresAt: pastDate,
      });

      expect(consentService.hasConsent('location_data', 'app')).toBe(false);
    });

    it('returns false for caregiver grantee when global sharing is off', async () => {
      // Inject a record directly to bypass grantConsent guard
      await consentService.setGlobalDataSharing(true);
      await consentService.grantConsent('health_data', 'caregiver_member', 'read');
      await consentService.setGlobalDataSharing(false);

      expect(consentService.hasConsent('health_data', 'caregiver_member')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Required consents
  // ---------------------------------------------------------------------------
  describe('required consents', () => {
    beforeEach(async () => {
      await consentService.initialize('user-1');
    });

    it('hasAllRequiredConsents() returns false before granting required consents', () => {
      expect(consentService.hasAllRequiredConsents()).toBe(false);
    });

    it('getPendingRequiredConsents() lists voice_data/app and voice_data/ai_assistant', () => {
      const pending = consentService.getPendingRequiredConsents();
      const categories = pending.map((r) => `${r.category}/${r.grantee}`);
      expect(categories).toContain('voice_data/app');
      expect(categories).toContain('voice_data/ai_assistant');
    });

    it('hasAllRequiredConsents() returns true once both required consents are granted', async () => {
      await consentService.grantConsent('voice_data', 'app', 'read');
      await consentService.grantConsent('voice_data', 'ai_assistant', 'read');

      expect(consentService.hasAllRequiredConsents()).toBe(true);
    });

    it('getPendingRequiredConsents() is empty once all required consents are satisfied', async () => {
      await consentService.grantConsent('voice_data', 'app', 'read');
      await consentService.grantConsent('voice_data', 'ai_assistant', 'read');

      expect(consentService.getPendingRequiredConsents()).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // processConsentRequest
  // ---------------------------------------------------------------------------
  describe('processConsentRequest', () => {
    beforeEach(async () => {
      await consentService.initialize('user-1');
    });

    it('grants consent when response.granted is true', async () => {
      const request = {
        id: 'req-1',
        category: 'health_data' as ConsentCategory,
        grantee: 'app' as ConsentGrantee,
        requestedAccessLevel: 'read' as AccessLevel,
        reason: 'For app functionality',
        isRequired: false,
      };
      const response = { requestId: 'req-1', granted: true, accessLevel: 'read' as AccessLevel };

      const result = await consentService.processConsentRequest(request, response);
      expect(result.success).toBe(true);
      expect(consentService.hasConsent('health_data', 'app')).toBe(true);
    });

    it('returns success:true (declined but optional) when response.granted is false and not required', async () => {
      const request = {
        id: 'req-2',
        category: 'usage_analytics' as ConsentCategory,
        grantee: 'analytics' as ConsentGrantee,
        requestedAccessLevel: 'read' as AccessLevel,
        reason: 'Optional analytics',
        isRequired: false,
      };
      const response = { requestId: 'req-2', granted: false };

      const result = await consentService.processConsentRequest(request, response);
      expect(result.success).toBe(true);
    });

    it('returns error when declining a required consent', async () => {
      const request = {
        id: 'req-3',
        category: 'voice_data' as ConsentCategory,
        grantee: 'app' as ConsentGrantee,
        requestedAccessLevel: 'read' as AccessLevel,
        reason: 'Core functionality',
        isRequired: true,
      };
      const response = { requestId: 'req-3', granted: false };

      const result = await consentService.processConsentRequest(request, response);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/required/i);
    });
  });

  // ---------------------------------------------------------------------------
  // getConsentsForCategory / getConsentsForGrantee
  // ---------------------------------------------------------------------------
  describe('getConsentsForCategory and getConsentsForGrantee', () => {
    beforeEach(async () => {
      await consentService.initialize('user-1');
      await consentService.grantConsent('health_data', 'app', 'read');
      await consentService.grantConsent('health_data', 'ai_assistant', 'read');
      await consentService.grantConsent('contact_info', 'app', 'write');
    });

    it('getConsentsForCategory returns all active grants for that category', () => {
      const records = consentService.getConsentsForCategory('health_data');
      expect(records).toHaveLength(2);
      records.forEach((r) => expect(r.category).toBe('health_data'));
    });

    it('getConsentsForGrantee returns all active grants for that grantee', () => {
      const records = consentService.getConsentsForGrantee('app');
      expect(records).toHaveLength(2);
      records.forEach((r) => expect(r.grantee).toBe('app'));
    });
  });

  // ---------------------------------------------------------------------------
  // updateConsentScope
  // ---------------------------------------------------------------------------
  describe('updateConsentScope', () => {
    beforeEach(async () => {
      await consentService.initialize('user-1');
      await consentService.grantConsent('health_data', 'app', 'read');
    });

    it('updates the scope on an existing consent', async () => {
      const result = await consentService.updateConsentScope('health_data', 'app', {
        includesMedications: true,
        includesDoctors: false,
      });

      expect(result.success).toBe(true);
      const record = consentService.getConsent('health_data', 'app');
      expect(record?.scope?.includesMedications).toBe(true);
    });

    it('returns error when no active consent exists to update', async () => {
      const result = await consentService.updateConsentScope('financial_data', 'app', {});
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no active consent/i);
    });
  });

  // ---------------------------------------------------------------------------
  // resetAllConsents
  // ---------------------------------------------------------------------------
  describe('resetAllConsents', () => {
    beforeEach(async () => {
      await consentService.initialize('user-1');
      await consentService.grantConsent('health_data', 'app', 'read');
      await consentService.grantConsent('contact_info', 'app', 'write');
      await consentService.setGlobalDataSharing(true);
    });

    it('returns success true', async () => {
      const result = await consentService.resetAllConsents();
      expect(result.success).toBe(true);
    });

    it('hasConsent returns false for all previously-granted categories', async () => {
      await consentService.resetAllConsents();

      expect(consentService.hasConsent('health_data', 'app')).toBe(false);
      expect(consentService.hasConsent('contact_info', 'app')).toBe(false);
    });

    it('disables global data sharing', async () => {
      await consentService.resetAllConsents();

      expect(consentService.isGlobalSharingEnabled()).toBe(false);
    });

    it('persists the revoked state to AsyncStorage', async () => {
      await consentService.resetAllConsents();

      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const prefs = JSON.parse(raw as string);
      const anyActive = prefs.consents.some((c: any) => !c.revokedAt);
      expect(anyActive).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Change listeners
  // ---------------------------------------------------------------------------
  describe('addChangeListener', () => {
    beforeEach(async () => {
      await consentService.initialize('user-1');
    });

    it('listener is called with correct category and grantee on grant', async () => {
      const listener = jest.fn();
      consentService.addChangeListener(listener);

      await consentService.grantConsent('contact_info', 'app', 'read');

      expect(listener).toHaveBeenCalledWith({ category: 'contact_info', grantee: 'app' });
    });

    it('returned unsubscribe function removes the listener', async () => {
      const listener = jest.fn();
      const unsubscribe = consentService.addChangeListener(listener);
      unsubscribe();

      await consentService.grantConsent('contact_info', 'app', 'read');

      expect(listener).not.toHaveBeenCalled();
    });

    it('multiple listeners are all notified', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      consentService.addChangeListener(listener1);
      consentService.addChangeListener(listener2);

      await consentService.grantConsent('location_data', 'app', 'read');

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('a throwing listener does not prevent other listeners from being called', async () => {
      const badListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn();
      consentService.addChangeListener(badListener);
      consentService.addChangeListener(goodListener);

      await consentService.grantConsent('usage_analytics', 'analytics', 'read');

      expect(goodListener).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // setGlobalDataSharing / isGlobalSharingEnabled
  // ---------------------------------------------------------------------------
  describe('setGlobalDataSharing', () => {
    beforeEach(async () => {
      await consentService.initialize('user-1');
    });

    it('starts as false by default', () => {
      expect(consentService.isGlobalSharingEnabled()).toBe(false);
    });

    it('enables global sharing and persists to storage', async () => {
      await consentService.setGlobalDataSharing(true);

      expect(consentService.isGlobalSharingEnabled()).toBe(true);
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      expect(JSON.parse(raw as string).globalDataSharing).toBe(true);
    });

    it('disables global sharing and persists to storage', async () => {
      await consentService.setGlobalDataSharing(true);
      await consentService.setGlobalDataSharing(false);

      expect(consentService.isGlobalSharingEnabled()).toBe(false);
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      expect(JSON.parse(raw as string).globalDataSharing).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getConsentSummaries
  // ---------------------------------------------------------------------------
  describe('getConsentSummaries', () => {
    beforeEach(async () => {
      await consentService.initialize('user-1');
    });

    it('returns a summary for every consent category', () => {
      const summaries = consentService.getConsentSummaries();
      // 8 categories defined in consent.ts
      expect(summaries.length).toBe(8);
    });

    it('includes displayName and description for each summary', () => {
      const summaries = consentService.getConsentSummaries();
      summaries.forEach((s) => {
        expect(s.displayName).toBeTruthy();
        expect(s.description).toBeTruthy();
      });
    });

    it('reports requiresReview: false for freshly-granted consents', async () => {
      await consentService.grantConsent('health_data', 'app', 'read');

      const summary = consentService.getConsentSummaries().find((s) => s.category === 'health_data');
      expect(summary?.requiresReview).toBe(false);
    });

    it('reports currentAccess with the granted grantee after granting', async () => {
      await consentService.grantConsent('contact_info', 'app', 'write');

      const summary = consentService.getConsentSummaries().find((s) => s.category === 'contact_info');
      expect(summary?.currentAccess.some((a) => a.grantee === 'app' && a.accessLevel === 'write')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // exportPreferences
  // ---------------------------------------------------------------------------
  describe('exportPreferences', () => {
    beforeEach(async () => {
      await consentService.initialize('user-1');
    });

    it('returns a valid JSON string', () => {
      expect(() => JSON.parse(consentService.exportPreferences())).not.toThrow();
    });

    it('exported JSON contains the userId', () => {
      const exported = JSON.parse(consentService.exportPreferences());
      expect(exported.userId).toBe('user-1');
    });
  });

  // ---------------------------------------------------------------------------
  // initialize – error path (lines 67-78)
  // ---------------------------------------------------------------------------
  describe('initialize – AsyncStorage error path', () => {
    it('creates minimal preferences when AsyncStorage.getItem throws', async () => {
      // Simulate a storage failure during initialization
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage failure'));

      await consentService.initialize('error-user');

      // Service should be functional with default preferences
      expect(consentService.isGlobalSharingEnabled()).toBe(false);
      expect(consentService.hasAllRequiredConsents()).toBe(false);
    });

    it('marks service as initialized even after AsyncStorage error', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage failure'));

      await consentService.initialize('error-user');

      // isInitialized flag should be set so subsequent calls are no-ops
      expect((consentService as any).isInitialized).toBe(true);
      // preferences should exist (minimal defaults) so the service is usable
      expect((consentService as any).preferences).not.toBeNull();
      expect((consentService as any).preferences.userId).toBe('error-user');
    });
  });

  // ---------------------------------------------------------------------------
  // grantConsent – not initialized (line 96)
  // ---------------------------------------------------------------------------
  describe('grantConsent – not initialized', () => {
    it('returns error when preferences are null (not initialized)', async () => {
      // Do NOT call initialize — preferences remain null
      const result = await consentService.grantConsent('health_data', 'app', 'read');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not initialized/i);
    });
  });

  // ---------------------------------------------------------------------------
  // revokeConsent – not initialized (line 153)
  // ---------------------------------------------------------------------------
  describe('revokeConsent – not initialized', () => {
    it('returns error when preferences are null (not initialized)', async () => {
      const result = await consentService.revokeConsent('health_data', 'app');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not initialized/i);
    });
  });

  // ---------------------------------------------------------------------------
  // updateConsentScope – not initialized (line 388)
  // ---------------------------------------------------------------------------
  describe('updateConsentScope – not initialized', () => {
    it('returns error when preferences are null (not initialized)', async () => {
      const result = await consentService.updateConsentScope('health_data', 'app', {});
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not initialized/i);
    });
  });

  // ---------------------------------------------------------------------------
  // markAsReviewed (lines 418-428)
  // ---------------------------------------------------------------------------
  describe('markAsReviewed', () => {
    beforeEach(async () => {
      await consentService.initialize('user-1');
    });

    it('updates lastReviewedAt and sets nextReviewReminder ~90 days out', async () => {
      const before = Date.now();
      await consentService.markAsReviewed();

      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const prefs = JSON.parse(raw as string);

      expect(prefs.lastReviewedAt).toBeDefined();
      const reviewedAt = new Date(prefs.lastReviewedAt).getTime();
      expect(reviewedAt).toBeGreaterThanOrEqual(before);

      expect(prefs.nextReviewReminder).toBeDefined();
      const nextReview = new Date(prefs.nextReviewReminder).getTime();
      // Should be approximately 90 days in the future (within 1 minute tolerance)
      const expectedNext = before + 90 * 24 * 60 * 60 * 1000;
      expect(nextReview).toBeGreaterThanOrEqual(expectedNext - 60_000);
      expect(nextReview).toBeLessThanOrEqual(expectedNext + 60_000);
    });

    it('calls auditLogService.logConsentChange with action "viewed"', async () => {
      await consentService.markAsReviewed();

      expect(auditLogService.logConsentChange).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'viewed' })
      );
    });

    it('is a no-op when not initialized (does not throw)', async () => {
      // Reset so preferences is null
      (consentService as any).preferences = null;

      await expect(consentService.markAsReviewed()).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // resetAllConsents – not initialized (line 447)
  // ---------------------------------------------------------------------------
  describe('resetAllConsents – not initialized', () => {
    it('returns error when preferences are null (not initialized)', async () => {
      const result = await consentService.resetAllConsents();
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not initialized/i);
    });
  });

  // ---------------------------------------------------------------------------
  // save() – AsyncStorage.setItem error path (line 500)
  // ---------------------------------------------------------------------------
  describe('save – AsyncStorage.setItem error path', () => {
    beforeEach(async () => {
      await consentService.initialize('user-1');
    });

    it('does not throw when AsyncStorage.setItem fails during grantConsent', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('setItem failure'));

      // Should not throw even when save() fails internally
      await expect(
        consentService.grantConsent('health_data', 'app', 'read')
      ).resolves.toBeDefined();
    });

    it('does not throw when AsyncStorage.setItem fails during markAsReviewed', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('setItem failure'));

      await expect(consentService.markAsReviewed()).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Uninitialized-state branch coverage for query methods
  // ---------------------------------------------------------------------------
  describe('query methods – not initialized (null preferences branch)', () => {
    // Do NOT call initialize — preferences remains null

    it('hasConsent returns false when preferences is null', () => {
      expect(consentService.hasConsent('health_data', 'app')).toBe(false);
    });

    it('getConsent returns null when preferences is null', () => {
      expect(consentService.getConsent('health_data', 'app')).toBeNull();
    });

    it('getConsentsForCategory returns [] when preferences is null', () => {
      expect(consentService.getConsentsForCategory('health_data')).toEqual([]);
    });

    it('getConsentsForGrantee returns [] when preferences is null', () => {
      expect(consentService.getConsentsForGrantee('app')).toEqual([]);
    });

    it('isGlobalSharingEnabled returns false when preferences is null', () => {
      expect(consentService.isGlobalSharingEnabled()).toBe(false);
    });

    it('setGlobalDataSharing is a no-op when preferences is null', async () => {
      // Should not throw
      await expect(consentService.setGlobalDataSharing(true)).resolves.toBeUndefined();
      // Still false since preferences was null
      expect(consentService.isGlobalSharingEnabled()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // processConsentRequest – uses requestedAccessLevel fallback (line 370)
  // ---------------------------------------------------------------------------
  describe('processConsentRequest – accessLevel fallback branch', () => {
    beforeEach(async () => {
      await consentService.initialize('user-1');
    });

    it('uses requestedAccessLevel when response.accessLevel is not provided', async () => {
      const request = {
        id: 'req-fallback',
        category: 'contact_info' as ConsentCategory,
        grantee: 'app' as ConsentGrantee,
        requestedAccessLevel: 'write' as AccessLevel,
        reason: 'Test fallback',
        isRequired: false,
      };
      // No accessLevel in response — should fall back to requestedAccessLevel
      const response = { requestId: 'req-fallback', granted: true };

      const result = await consentService.processConsentRequest(request, response);
      expect(result.success).toBe(true);

      const record = consentService.getConsent('contact_info', 'app');
      expect(record?.accessLevel).toBe('write');
    });
  });
});

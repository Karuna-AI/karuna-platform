import AsyncStorage from '@react-native-async-storage/async-storage';
import { auditLogService } from './auditLog';
import {
  ConsentCategory,
  ConsentGrantee,
  AccessLevel,
  ConsentRecord,
  ConsentPreferences,
  ConsentRequest,
  ConsentResponse,
  ConsentScope,
  ConsentSummary,
  CONSENT_CATEGORY_INFO,
  CONSENT_GRANTEE_INFO,
} from '../types/consent';

const STORAGE_KEY = '@karuna_consent_preferences';

// Default access levels for each category
const DEFAULT_ACCESS_LEVELS: Record<ConsentCategory, AccessLevel> = {
  health_data: 'none',
  financial_data: 'none',
  personal_documents: 'none',
  contact_info: 'none',
  location_data: 'none',
  voice_data: 'read', // Needed for basic app functionality
  usage_analytics: 'read', // Optional but recommended
  caregiver_sharing: 'none',
};

// Required consents for app to function
const REQUIRED_CONSENTS: { category: ConsentCategory; grantee: ConsentGrantee; minAccess: AccessLevel }[] = [
  { category: 'voice_data', grantee: 'app', minAccess: 'read' },
  { category: 'voice_data', grantee: 'ai_assistant', minAccess: 'read' },
];

class ConsentService {
  private preferences: ConsentPreferences | null = null;
  private isInitialized: boolean = false;
  private consentChangeListeners: ((change: { category: ConsentCategory; grantee: ConsentGrantee }) => void)[] = [];

  async initialize(userId: string = 'default'): Promise<void> {
    if (this.isInitialized) return;

    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);

      if (stored) {
        this.preferences = JSON.parse(stored);
      } else {
        // Create default preferences
        this.preferences = {
          userId,
          consents: [],
          defaultAccessLevels: { ...DEFAULT_ACCESS_LEVELS },
          lastReviewedAt: new Date().toISOString(),
          globalDataSharing: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await this.save();
      }

      this.isInitialized = true;
      console.debug('[Consent] Initialized with', this.preferences?.consents.length ?? 0, 'consent records');
    } catch (error) {
      console.error('[Consent] Initialization error:', error);
      // Create minimal preferences
      this.preferences = {
        userId,
        consents: [],
        defaultAccessLevels: { ...DEFAULT_ACCESS_LEVELS },
        lastReviewedAt: new Date().toISOString(),
        globalDataSharing: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.isInitialized = true;
    }
  }

  /**
   * Grant consent for a category to a grantee
   */
  async grantConsent(
    category: ConsentCategory,
    grantee: ConsentGrantee,
    accessLevel: AccessLevel,
    options: {
      scope?: ConsentScope;
      expiresAt?: string;
      reason?: string;
    } = {}
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.preferences) {
      return { success: false, error: 'Consent service not initialized' };
    }

    // Check if global sharing is disabled for caregiver categories
    if (!this.preferences.globalDataSharing && grantee.startsWith('caregiver_')) {
      return { success: false, error: 'Global data sharing is disabled' };
    }

    // Find existing consent or create new
    const existingIndex = this.preferences.consents.findIndex(
      (c) => c.category === category && c.grantee === grantee && !c.revokedAt
    );

    const consentRecord: ConsentRecord = {
      id: `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      category,
      grantee,
      accessLevel,
      grantedAt: new Date().toISOString(),
      expiresAt: options.expiresAt,
      scope: options.scope,
      reason: options.reason,
      version: 1,
    };

    if (existingIndex >= 0) {
      // Update existing
      consentRecord.version = this.preferences.consents[existingIndex].version + 1;
      this.preferences.consents[existingIndex] = consentRecord;
    } else {
      // Add new
      this.preferences.consents.push(consentRecord);
    }

    await this.save();

    await auditLogService.logConsentChange({
      action: 'granted',
      consentCategory: category,
      grantedTo: CONSENT_GRANTEE_INFO[grantee].displayName,
      details: `Granted ${accessLevel} access to ${CONSENT_CATEGORY_INFO[category].displayName}`,
    });

    this.notifyListeners(category, grantee);

    return { success: true };
  }

  /**
   * Revoke consent for a category from a grantee
   */
  async revokeConsent(
    category: ConsentCategory,
    grantee: ConsentGrantee,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.preferences) {
      return { success: false, error: 'Consent service not initialized' };
    }

    // Check if this is a required consent
    const required = REQUIRED_CONSENTS.find(
      (r) => r.category === category && r.grantee === grantee
    );
    if (required) {
      return { success: false, error: 'This consent is required for app functionality' };
    }

    const consentIndex = this.preferences.consents.findIndex(
      (c) => c.category === category && c.grantee === grantee && !c.revokedAt
    );

    if (consentIndex === -1) {
      return { success: false, error: 'No active consent found' };
    }

    // Mark as revoked instead of deleting (for audit trail)
    this.preferences.consents[consentIndex].revokedAt = new Date().toISOString();

    await this.save();

    await auditLogService.logConsentChange({
      action: 'revoked',
      consentCategory: category,
      grantedTo: CONSENT_GRANTEE_INFO[grantee].displayName,
      details: reason || `Revoked access to ${CONSENT_CATEGORY_INFO[category].displayName}`,
    });

    this.notifyListeners(category, grantee);

    return { success: true };
  }

  /**
   * Check if consent is granted for a specific action
   */
  hasConsent(
    category: ConsentCategory,
    grantee: ConsentGrantee,
    requiredLevel: AccessLevel = 'read'
  ): boolean {
    if (!this.preferences) return false;

    // Check global sharing for caregiver categories
    if (!this.preferences.globalDataSharing && grantee.startsWith('caregiver_')) {
      return false;
    }

    const consent = this.preferences.consents.find(
      (c) =>
        c.category === category &&
        c.grantee === grantee &&
        !c.revokedAt &&
        (!c.expiresAt || new Date(c.expiresAt) > new Date())
    );

    if (!consent) return false;

    // Check access level hierarchy
    const levels: AccessLevel[] = ['none', 'read', 'write', 'full'];
    const currentLevelIndex = levels.indexOf(consent.accessLevel);
    const requiredLevelIndex = levels.indexOf(requiredLevel);

    return currentLevelIndex >= requiredLevelIndex;
  }

  /**
   * Get current consent for a category and grantee
   */
  getConsent(category: ConsentCategory, grantee: ConsentGrantee): ConsentRecord | null {
    if (!this.preferences) return null;

    return this.preferences.consents.find(
      (c) =>
        c.category === category &&
        c.grantee === grantee &&
        !c.revokedAt &&
        (!c.expiresAt || new Date(c.expiresAt) > new Date())
    ) || null;
  }

  /**
   * Get all active consents for a category
   */
  getConsentsForCategory(category: ConsentCategory): ConsentRecord[] {
    if (!this.preferences) return [];

    return this.preferences.consents.filter(
      (c) =>
        c.category === category &&
        !c.revokedAt &&
        (!c.expiresAt || new Date(c.expiresAt) > new Date())
    );
  }

  /**
   * Get all active consents for a grantee
   */
  getConsentsForGrantee(grantee: ConsentGrantee): ConsentRecord[] {
    if (!this.preferences) return [];

    return this.preferences.consents.filter(
      (c) =>
        c.grantee === grantee &&
        !c.revokedAt &&
        (!c.expiresAt || new Date(c.expiresAt) > new Date())
    );
  }

  /**
   * Get consent summary for UI display
   */
  getConsentSummaries(): ConsentSummary[] {
    const categories = Object.keys(CONSENT_CATEGORY_INFO) as ConsentCategory[];

    return categories.map((category) => {
      const info = CONSENT_CATEGORY_INFO[category];
      const activeConsents = this.getConsentsForCategory(category);

      const currentAccess = activeConsents.map((consent) => ({
        grantee: consent.grantee,
        accessLevel: consent.accessLevel,
        grantedAt: consent.grantedAt,
      }));

      // Check if review is needed (e.g., consents granted > 90 days ago)
      const requiresReview = activeConsents.some((consent) => {
        const grantedDate = new Date(consent.grantedAt);
        const daysSinceGranted = (Date.now() - grantedDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceGranted > 90;
      });

      const lastChanged = activeConsents.reduce((latest, consent) => {
        const date = consent.revokedAt || consent.grantedAt;
        return !latest || date > latest ? date : latest;
      }, null as string | null);

      return {
        category,
        displayName: info.displayName,
        description: info.description,
        icon: info.icon,
        currentAccess,
        requiresReview,
        lastChangedAt: lastChanged || undefined,
      };
    });
  }

  /**
   * Enable/disable global data sharing
   */
  async setGlobalDataSharing(enabled: boolean): Promise<void> {
    if (!this.preferences) return;

    this.preferences.globalDataSharing = enabled;
    await this.save();

    await auditLogService.logConsentChange({
      action: enabled ? 'granted' : 'revoked',
      consentCategory: 'caregiver_sharing',
      details: `Global data sharing ${enabled ? 'enabled' : 'disabled'}`,
    });
  }

  /**
   * Check if global data sharing is enabled
   */
  isGlobalSharingEnabled(): boolean {
    return this.preferences?.globalDataSharing || false;
  }

  /**
   * Get required consents that haven't been granted
   */
  getPendingRequiredConsents(): ConsentRequest[] {
    return REQUIRED_CONSENTS
      .filter((required) => !this.hasConsent(required.category, required.grantee, required.minAccess))
      .map((required) => ({
        id: `required_${required.category}_${required.grantee}`,
        category: required.category,
        grantee: required.grantee,
        requestedAccessLevel: required.minAccess,
        reason: `Required for ${CONSENT_CATEGORY_INFO[required.category].displayName} functionality`,
        isRequired: true,
      }));
  }

  /**
   * Check if all required consents are granted
   */
  hasAllRequiredConsents(): boolean {
    return REQUIRED_CONSENTS.every((required) =>
      this.hasConsent(required.category, required.grantee, required.minAccess)
    );
  }

  /**
   * Process a consent request
   */
  async processConsentRequest(
    request: ConsentRequest,
    response: ConsentResponse
  ): Promise<{ success: boolean; error?: string }> {
    if (!response.granted) {
      if (request.isRequired) {
        return { success: false, error: 'This consent is required' };
      }
      return { success: true };
    }

    return this.grantConsent(
      request.category,
      request.grantee,
      response.accessLevel || request.requestedAccessLevel,
      {
        scope: response.customScope,
        expiresAt: response.expiresAt,
        reason: request.reason,
      }
    );
  }

  /**
   * Update consent scope
   */
  async updateConsentScope(
    category: ConsentCategory,
    grantee: ConsentGrantee,
    newScope: ConsentScope
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.preferences) {
      return { success: false, error: 'Consent service not initialized' };
    }

    const consentIndex = this.preferences.consents.findIndex(
      (c) => c.category === category && c.grantee === grantee && !c.revokedAt
    );

    if (consentIndex === -1) {
      return { success: false, error: 'No active consent found' };
    }

    this.preferences.consents[consentIndex].scope = newScope;
    this.preferences.consents[consentIndex].version++;

    await this.save();

    await auditLogService.logConsentChange({
      action: 'updated',
      consentCategory: category,
      grantedTo: CONSENT_GRANTEE_INFO[grantee].displayName,
      details: `Updated scope for ${CONSENT_CATEGORY_INFO[category].displayName}`,
    });

    return { success: true };
  }

  /**
   * Mark consents as reviewed
   */
  async markAsReviewed(): Promise<void> {
    if (!this.preferences) return;

    this.preferences.lastReviewedAt = new Date().toISOString();
    // Set next review reminder for 90 days
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + 90);
    this.preferences.nextReviewReminder = nextReview.toISOString();

    await this.save();

    await auditLogService.logConsentChange({
      action: 'viewed',
      consentCategory: 'caregiver_sharing',
      details: 'All consents reviewed by user',
    });
  }

  /**
   * Export consent preferences
   */
  exportPreferences(): string {
    return JSON.stringify(this.preferences, null, 2);
  }

  /**
   * Reset all consents (with required consents warning)
   */
  async resetAllConsents(): Promise<{ success: boolean; error?: string }> {
    if (!this.preferences) {
      return { success: false, error: 'Consent service not initialized' };
    }

    // Revoke all consents
    const now = new Date().toISOString();
    this.preferences.consents.forEach((consent) => {
      if (!consent.revokedAt) {
        consent.revokedAt = now;
      }
    });

    this.preferences.globalDataSharing = false;

    await this.save();

    await auditLogService.logConsentChange({
      action: 'revoked',
      consentCategory: 'caregiver_sharing',
      details: 'All consents reset',
    });

    return { success: true };
  }

  /**
   * Add listener for consent changes
   */
  addChangeListener(
    listener: (change: { category: ConsentCategory; grantee: ConsentGrantee }) => void
  ): () => void {
    this.consentChangeListeners.push(listener);
    return () => {
      this.consentChangeListeners = this.consentChangeListeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(category: ConsentCategory, grantee: ConsentGrantee): void {
    this.consentChangeListeners.forEach((listener) => {
      try {
        listener({ category, grantee });
      } catch (error) {
        console.error('[Consent] Listener error:', error);
      }
    });
  }

  private async save(): Promise<void> {
    if (!this.preferences) return;

    try {
      this.preferences.updatedAt = new Date().toISOString();
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.preferences));
    } catch (error) {
      console.error('[Consent] Save error:', error);
    }
  }
}

export const consentService = new ConsentService();
export default consentService;

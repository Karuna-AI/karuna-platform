/**
 * Feature Flags Service
 *
 * Manages feature flags fetched from the admin panel.
 * Flags are cached locally and refreshed periodically.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@karuna:feature_flags';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Default flags (used when no server connection)
const DEFAULT_FLAGS: Record<string, boolean> = {
  proactive_checkins: true,
  medication_reminders: true,
  voice_conversations: true,
  health_monitoring: true,
  caregiver_alerts: true,
  ai_memory: true,
  emergency_sos: true,
  dark_mode: false,
  beta_features: false,
};

interface CachedFlags {
  flags: Record<string, boolean>;
  lastFetched: number;
}

class FeatureFlagsService {
  private flags: Record<string, boolean> = { ...DEFAULT_FLAGS };
  private lastFetched: number = 0;
  private isInitialized: boolean = false;
  private userId: string | null = null;
  private circleId: string | null = null;

  /**
   * Initialize the service with user context
   */
  async initialize(userId?: string, circleId?: string): Promise<void> {
    this.userId = userId || null;
    this.circleId = circleId || null;

    // Load from cache first
    await this.loadFromCache();

    // Then refresh from server in background
    this.refreshFromServer().catch(console.error);

    this.isInitialized = true;
  }

  /**
   * Check if a feature flag is enabled
   */
  isEnabled(flagName: string): boolean {
    return this.flags[flagName] ?? DEFAULT_FLAGS[flagName] ?? false;
  }

  /**
   * Get all current flags
   */
  getAllFlags(): Record<string, boolean> {
    return { ...this.flags };
  }

  /**
   * Force refresh flags from server
   */
  async refresh(): Promise<void> {
    await this.refreshFromServer();
  }

  /**
   * Load flags from local cache
   */
  private async loadFromCache(): Promise<void> {
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEY);
      if (cached) {
        const data: CachedFlags = JSON.parse(cached);
        this.flags = { ...DEFAULT_FLAGS, ...data.flags };
        this.lastFetched = data.lastFetched;
      }
    } catch (error) {
      console.warn('[FeatureFlags] Failed to load from cache:', error);
    }
  }

  /**
   * Save flags to local cache
   */
  private async saveToCache(): Promise<void> {
    try {
      const data: CachedFlags = {
        flags: this.flags,
        lastFetched: this.lastFetched,
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('[FeatureFlags] Failed to save to cache:', error);
    }
  }

  /**
   * Refresh flags from the server
   */
  private async refreshFromServer(): Promise<void> {
    // Skip if recently fetched
    if (Date.now() - this.lastFetched < CACHE_DURATION_MS) {
      return;
    }

    try {
      const API_URL = process.env.API_URL || 'http://localhost:3021';
      const response = await fetch(`${API_URL}/api/admin/feature-flags`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.flags && Array.isArray(data.flags)) {
        const newFlags: Record<string, boolean> = { ...DEFAULT_FLAGS };

        for (const flag of data.flags) {
          // Check if flag is enabled for this user/circle
          let isEnabled = flag.is_enabled;

          if (isEnabled) {
            if (flag.enabled_for_all) {
              isEnabled = true;
            } else if (this.userId && flag.enabled_user_ids?.includes(this.userId)) {
              isEnabled = true;
            } else if (this.circleId && flag.enabled_circle_ids?.includes(this.circleId)) {
              isEnabled = true;
            } else if (flag.rollout_percentage > 0) {
              // Simple rollout based on user ID hash
              if (this.userId) {
                const hash = this.hashString(this.userId + flag.name);
                isEnabled = (hash % 100) < flag.rollout_percentage;
              } else {
                isEnabled = false;
              }
            } else {
              isEnabled = false;
            }
          }

          newFlags[flag.name] = isEnabled;
        }

        this.flags = newFlags;
        this.lastFetched = Date.now();
        await this.saveToCache();

        console.log('[FeatureFlags] Refreshed from server:', Object.keys(newFlags).length, 'flags');
      }
    } catch (error) {
      console.warn('[FeatureFlags] Failed to refresh from server:', error);
      // Continue using cached/default flags
    }
  }

  /**
   * Simple hash function for rollout percentage calculation
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Clean up service
   */
  async cleanup(): Promise<void> {
    this.isInitialized = false;
    this.userId = null;
    this.circleId = null;
  }
}

// Export singleton instance
export const featureFlags = new FeatureFlagsService();

// Export convenience functions
export function isFeatureEnabled(flagName: string): boolean {
  return featureFlags.isEnabled(flagName);
}

export function getAllFeatureFlags(): Record<string, boolean> {
  return featureFlags.getAllFlags();
}

// Feature flag names as constants
export const FLAGS = {
  PROACTIVE_CHECKINS: 'proactive_checkins',
  MEDICATION_REMINDERS: 'medication_reminders',
  VOICE_CONVERSATIONS: 'voice_conversations',
  HEALTH_MONITORING: 'health_monitoring',
  CAREGIVER_ALERTS: 'caregiver_alerts',
  AI_MEMORY: 'ai_memory',
  EMERGENCY_SOS: 'emergency_sos',
  DARK_MODE: 'dark_mode',
  BETA_FEATURES: 'beta_features',
} as const;

export default featureFlags;

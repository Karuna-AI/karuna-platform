import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { consentService } from './consent';
import { auditLogService } from './auditLog';
import {
  VitalType,
  VitalReading,
  VitalSummary,
  StepsData,
  HeartRateData,
  SleepData,
  HealthSyncStatus,
  VITAL_TYPE_INFO,
} from '../types/health';

const STORAGE_KEYS = {
  VITALS: '@karuna_health_vitals',
  SYNC_STATUS: '@karuna_health_sync_status',
  STEPS_GOAL: '@karuna_steps_goal',
};

const DEFAULT_STEPS_GOAL = 7000;

/**
 * Health Data Service
 * Abstracts HealthKit (iOS) and Health Connect (Android) integration
 * Falls back to manual entry when health APIs are not available
 */
class HealthDataService {
  private vitals: VitalReading[] = [];
  private syncStatus: HealthSyncStatus;
  private stepsGoal: number = DEFAULT_STEPS_GOAL;
  private isInitialized: boolean = false;

  constructor() {
    this.syncStatus = {
      isConnected: false,
      platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'none',
      permissionsGranted: [],
      permissionsDenied: [],
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load stored vitals
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.VITALS);
      if (stored) {
        this.vitals = JSON.parse(stored);
      }

      // Load sync status
      const statusStored = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_STATUS);
      if (statusStored) {
        this.syncStatus = JSON.parse(statusStored);
      }

      // Load steps goal
      const goalStored = await AsyncStorage.getItem(STORAGE_KEYS.STEPS_GOAL);
      if (goalStored) {
        this.stepsGoal = parseInt(goalStored, 10);
      }

      this.isInitialized = true;
      console.log('[HealthData] Initialized with', this.vitals.length, 'readings');
    } catch (error) {
      console.error('[HealthData] Initialization error:', error);
      this.isInitialized = true;
    }
  }

  /**
   * Request permissions for health data access
   * In a real app, this would call HealthKit/Health Connect APIs
   */
  async requestPermissions(types: VitalType[]): Promise<{
    granted: VitalType[];
    denied: VitalType[];
  }> {
    // Check if user has consented to health data access
    const hasConsent = consentService.hasConsent('health_data', 'app', 'read');
    if (!hasConsent) {
      return { granted: [], denied: types };
    }

    // In a real implementation, this would call platform-specific APIs
    // For now, we'll simulate permission granting
    if (Platform.OS === 'ios') {
      // Would call: await HealthKit.requestAuthorization(types)
      console.log('[HealthData] iOS HealthKit permission request for:', types);
    } else if (Platform.OS === 'android') {
      // Would call: await HealthConnect.requestPermissions(types)
      console.log('[HealthData] Android Health Connect permission request for:', types);
    }

    // Simulate granting permissions (in real app, this comes from the API)
    const granted = types;
    const denied: VitalType[] = [];

    this.syncStatus.permissionsGranted = granted;
    this.syncStatus.isConnected = granted.length > 0;
    await this.saveSyncStatus();

    await auditLogService.log({
      action: 'consent_granted',
      category: 'consent',
      description: `Health data permissions granted: ${granted.join(', ')}`,
    });

    return { granted, denied };
  }

  /**
   * Sync data from health platform
   */
  async syncFromHealthPlatform(): Promise<{
    success: boolean;
    synced: number;
    error?: string;
  }> {
    if (!this.syncStatus.isConnected) {
      return { success: false, synced: 0, error: 'Not connected to health platform' };
    }

    // Check consent
    const hasConsent = consentService.hasConsent('health_data', 'app', 'read');
    if (!hasConsent) {
      return { success: false, synced: 0, error: 'Health data consent not granted' };
    }

    try {
      let syncedCount = 0;

      // In a real implementation, these would call platform APIs
      // For demo, we'll generate sample data

      if (this.syncStatus.permissionsGranted.includes('steps')) {
        const stepsData = await this.fetchStepsFromPlatform();
        if (stepsData) {
          await this.addVitalReading({
            type: 'steps',
            value: stepsData.count,
            unit: 'steps',
            source: Platform.OS === 'ios' ? 'healthkit' : 'health_connect',
          });
          syncedCount++;
        }
      }

      if (this.syncStatus.permissionsGranted.includes('heart_rate')) {
        const hrData = await this.fetchHeartRateFromPlatform();
        if (hrData) {
          await this.addVitalReading({
            type: 'heart_rate',
            value: hrData.bpm,
            unit: 'bpm',
            source: Platform.OS === 'ios' ? 'healthkit' : 'health_connect',
          });
          syncedCount++;
        }
      }

      this.syncStatus.lastSyncTime = new Date().toISOString();
      await this.saveSyncStatus();

      await auditLogService.log({
        action: 'caregiver_data_sync',
        category: 'data_access',
        description: `Health data synced: ${syncedCount} readings`,
      });

      return { success: true, synced: syncedCount };
    } catch (error) {
      console.error('[HealthData] Sync error:', error);
      return { success: false, synced: 0, error: 'Sync failed' };
    }
  }

  /**
   * Fetch steps from health platform (simulated)
   */
  private async fetchStepsFromPlatform(): Promise<StepsData | null> {
    // In real implementation:
    // iOS: await HealthKit.getStepCount({ startDate, endDate })
    // Android: await HealthConnect.readRecords('Steps', { startTime, endTime })

    // Return simulated data
    const today = new Date().toISOString().split('T')[0];
    return {
      date: today,
      count: Math.floor(Math.random() * 5000) + 3000, // 3000-8000 steps
      goal: this.stepsGoal,
      distance: Math.floor(Math.random() * 3000) + 1000,
      caloriesBurned: Math.floor(Math.random() * 200) + 100,
    };
  }

  /**
   * Fetch heart rate from health platform (simulated)
   */
  private async fetchHeartRateFromPlatform(): Promise<HeartRateData | null> {
    // In real implementation:
    // iOS: await HealthKit.getHeartRate({ startDate, endDate })
    // Android: await HealthConnect.readRecords('HeartRate', { startTime, endTime })

    return {
      timestamp: new Date().toISOString(),
      bpm: Math.floor(Math.random() * 30) + 65, // 65-95 bpm
      context: 'resting',
    };
  }

  /**
   * Add a vital reading (manual or from sync)
   */
  async addVitalReading(reading: Omit<VitalReading, 'id' | 'timestamp'>): Promise<VitalReading> {
    const newReading: VitalReading = {
      id: `vital_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...reading,
    };

    this.vitals.unshift(newReading);
    await this.saveVitals();

    await auditLogService.logVaultAccess({
      action: 'created',
      entityType: 'vital_reading',
      entityId: newReading.id,
      entityName: `${VITAL_TYPE_INFO[reading.type].displayName}: ${reading.value}`,
    });

    return newReading;
  }

  /**
   * Get vitals by type
   */
  getVitalsByType(type: VitalType, limit?: number): VitalReading[] {
    const filtered = this.vitals.filter((v) => v.type === type);
    return limit ? filtered.slice(0, limit) : filtered;
  }

  /**
   * Get latest vital reading
   */
  getLatestVital(type: VitalType): VitalReading | null {
    return this.vitals.find((v) => v.type === type) || null;
  }

  /**
   * Get today's steps
   */
  getTodaySteps(): StepsData | null {
    const today = new Date().toISOString().split('T')[0];
    const todayReadings = this.vitals.filter(
      (v) => v.type === 'steps' && v.timestamp.startsWith(today)
    );

    if (todayReadings.length === 0) return null;

    // Sum all steps for today
    const totalSteps = todayReadings.reduce((sum, r) => sum + r.value, 0);

    return {
      date: today,
      count: totalSteps,
      goal: this.stepsGoal,
    };
  }

  /**
   * Get vital summary for dashboard
   */
  getVitalSummary(type: VitalType, period: 'day' | 'week' | 'month' = 'day'): VitalSummary {
    const info = VITAL_TYPE_INFO[type];
    const readings = this.getReadingsForPeriod(type, period);

    let average: number | undefined;
    let min: number | undefined;
    let max: number | undefined;
    let trend: 'up' | 'down' | 'stable' | 'unknown' = 'unknown';

    if (readings.length > 0) {
      const values = readings.map((r) => r.value);
      average = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      min = Math.min(...values);
      max = Math.max(...values);

      // Calculate trend (compare recent half to older half)
      if (readings.length >= 4) {
        const mid = Math.floor(readings.length / 2);
        const recentAvg = values.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
        const olderAvg = values.slice(mid).reduce((a, b) => a + b, 0) / (readings.length - mid);

        if (recentAvg > olderAvg * 1.05) trend = 'up';
        else if (recentAvg < olderAvg * 0.95) trend = 'down';
        else trend = 'stable';
      }
    }

    return {
      type,
      displayName: info.displayName,
      icon: info.icon,
      latestReading: readings[0],
      average,
      min,
      max,
      trend,
      unit: info.unit,
      normalRange: info.normalRange,
      period,
    };
  }

  /**
   * Get readings for a time period
   */
  private getReadingsForPeriod(type: VitalType, period: 'day' | 'week' | 'month'): VitalReading[] {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
    }

    return this.vitals.filter(
      (v) => v.type === type && new Date(v.timestamp) >= startDate
    );
  }

  /**
   * Get step count comparison with goal
   */
  getStepsComparison(): {
    current: number;
    goal: number;
    percentage: number;
    status: 'below' | 'near' | 'met' | 'exceeded';
    message: string;
  } {
    const todaySteps = this.getTodaySteps();
    const current = todaySteps?.count || 0;
    const percentage = Math.round((current / this.stepsGoal) * 100);

    let status: 'below' | 'near' | 'met' | 'exceeded';
    let message: string;

    if (percentage >= 100) {
      status = 'exceeded';
      message = `Great job! You've exceeded your step goal with ${current.toLocaleString()} steps!`;
    } else if (percentage >= 80) {
      status = 'met';
      message = `Almost there! You're at ${current.toLocaleString()} steps, just ${(this.stepsGoal - current).toLocaleString()} more to go.`;
    } else if (percentage >= 50) {
      status = 'near';
      message = `You're making progress with ${current.toLocaleString()} steps. Keep moving!`;
    } else {
      status = 'below';
      message = `Your step count is ${current.toLocaleString()} today. Try to get moving more!`;
    }

    return { current, goal: this.stepsGoal, percentage, status, message };
  }

  /**
   * Set daily steps goal
   */
  async setStepsGoal(goal: number): Promise<void> {
    this.stepsGoal = goal;
    await AsyncStorage.setItem(STORAGE_KEYS.STEPS_GOAL, goal.toString());
  }

  /**
   * Get sync status
   */
  getSyncStatus(): HealthSyncStatus {
    return { ...this.syncStatus };
  }

  /**
   * Check if connected to health platform
   */
  isConnected(): boolean {
    return this.syncStatus.isConnected;
  }

  /**
   * Delete a vital reading
   */
  async deleteVitalReading(id: string): Promise<boolean> {
    const index = this.vitals.findIndex((v) => v.id === id);
    if (index === -1) return false;

    this.vitals.splice(index, 1);
    await this.saveVitals();

    await auditLogService.logVaultAccess({
      action: 'deleted',
      entityType: 'vital_reading',
      entityId: id,
    });

    return true;
  }

  /**
   * Get all vitals for export
   */
  exportVitals(): VitalReading[] {
    return [...this.vitals];
  }

  /**
   * Clear all vitals
   */
  async clearAllVitals(): Promise<void> {
    this.vitals = [];
    await this.saveVitals();

    await auditLogService.log({
      action: 'data_deleted',
      category: 'data_modification',
      description: 'All vital readings cleared',
    });
  }

  private async saveVitals(): Promise<void> {
    try {
      // Keep only last 1000 readings
      if (this.vitals.length > 1000) {
        this.vitals = this.vitals.slice(0, 1000);
      }
      await AsyncStorage.setItem(STORAGE_KEYS.VITALS, JSON.stringify(this.vitals));
    } catch (error) {
      console.error('[HealthData] Save vitals error:', error);
    }
  }

  private async saveSyncStatus(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SYNC_STATUS, JSON.stringify(this.syncStatus));
    } catch (error) {
      console.error('[HealthData] Save sync status error:', error);
    }
  }
}

export const healthDataService = new HealthDataService();
export default healthDataService;

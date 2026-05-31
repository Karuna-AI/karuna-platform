import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pedometer } from 'expo-sensors';
import { consentService } from './consent';
import { auditLogService } from './auditLog';
import { healthAdapter } from './healthAdapter';
import { careCircleSyncService } from './careCircleSync';
import {
  VitalType,
  VitalReading,
  VitalSummary,
  StepsData,
  HeartRateData,
  HealthSyncStatus,
  VITAL_TYPE_INFO,
} from '../types/health';

const STORAGE_KEYS = {
  VITALS: '@karuna_health_vitals',
  SYNC_STATUS: '@karuna_health_sync_status',
  STEPS_GOAL: '@karuna_steps_goal',
};

const DEFAULT_STEPS_GOAL = 7000;

// dataTypes the gateway's POST /health accepts. 'sleep' has no server equivalent.
const SERVER_HEALTH_TYPES: VitalType[] = [
  'heart_rate', 'blood_pressure', 'blood_glucose', 'weight', 'temperature', 'oxygen_saturation', 'steps',
];

/**
 * Map a local VitalReading to the gateway POST /health reading shape, or null
 * if the type isn't supported server-side. blood_pressure becomes a nested
 * {systolic,diastolic} object (diastolic = secondaryValue); scalars pass through.
 */
export function vitalReadingToServerReading(v: VitalReading): {
  dataType: string;
  value: unknown;
  unit?: string;
  measuredAt: string;
  source: string;
  notes?: string;
} | null {
  if (!SERVER_HEALTH_TYPES.includes(v.type)) return null;
  const value =
    v.type === 'blood_pressure'
      ? { systolic: v.value, diastolic: v.secondaryValue ?? 0 }
      : v.value;
  return {
    dataType: v.type,
    value,
    unit: v.unit,
    measuredAt: v.timestamp,
    source: v.source || 'device',
    notes: v.notes,
  };
}

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
      console.debug('[HealthData] Initialized with', this.vitals.length, 'readings');
    } catch (error) {
      console.error('[HealthData] Initialization error:', error);
      // Do NOT set isInitialized=true here — allow the next call to retry
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

    // Request permissions from the platform health adapter (HealthKit / Health Connect)
    // Pedometer via expo-sensors is used for steps as a fallback
    const granted: VitalType[] = [];
    const denied: VitalType[] = [];

    const adapterAvailable = await healthAdapter.isAvailable();

    if (adapterAvailable) {
      const adapterResult = await healthAdapter.requestPermissions(types as any);
      for (const type of types) {
        if (adapterResult.granted.includes(type)) {
          granted.push(type);
        } else {
          denied.push(type);
        }
      }
    } else {
      // No native health module available — allow all types via manual entry
      for (const type of types) {
        if (type === 'steps') {
          try {
            await Pedometer.isAvailableAsync();
          } catch {
            // Pedometer unavailable — still grant for manual entry
          }
        }
        granted.push(type);
      }
    }

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
      const sourceName = Platform.OS === 'ios' ? 'healthkit' : 'health_connect';
      const now = new Date();
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);

      const adapterAvailable = await healthAdapter.isAvailable();

      if (this.syncStatus.permissionsGranted.includes('steps')) {
        const stepsData = await this.fetchStepsFromPlatform();
        if (stepsData) {
          await this.addVitalReading({ type: 'steps', value: stepsData.count, unit: 'steps', source: sourceName });
          syncedCount++;
        }
      }

      if (adapterAvailable) {
        if (this.syncStatus.permissionsGranted.includes('heart_rate')) {
          const hr = await healthAdapter.getHeartRate(dayStart, now);
          if (hr) {
            await this.addVitalReading({ type: 'heart_rate', value: hr.value, unit: hr.unit, source: sourceName });
            syncedCount++;
          }
        }

        if (this.syncStatus.permissionsGranted.includes('blood_pressure')) {
          const bp = await healthAdapter.getBloodPressure(dayStart, now);
          if (bp) {
            await this.addVitalReading({
              type: 'blood_pressure',
              value: bp.systolic,
              secondaryValue: bp.diastolic,
              unit: 'mmHg',
              source: sourceName,
            });
            syncedCount++;
          }
        }

        if (this.syncStatus.permissionsGranted.includes('blood_glucose')) {
          const bg = await healthAdapter.getBloodGlucose(dayStart, now);
          if (bg) {
            await this.addVitalReading({ type: 'blood_glucose', value: bg.value, unit: bg.unit, source: sourceName });
            syncedCount++;
          }
        }

        if (this.syncStatus.permissionsGranted.includes('weight')) {
          const wt = await healthAdapter.getWeight(dayStart, now);
          if (wt) {
            await this.addVitalReading({ type: 'weight', value: wt.value, unit: wt.unit, source: sourceName });
            syncedCount++;
          }
        }

        if (this.syncStatus.permissionsGranted.includes('oxygen_saturation')) {
          const spo2 = await healthAdapter.getOxygenSaturation(dayStart, now);
          if (spo2) {
            await this.addVitalReading({ type: 'oxygen_saturation', value: spo2.value, unit: spo2.unit, source: sourceName });
            syncedCount++;
          }
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
   * Fetch steps from health platform using expo-sensors Pedometer
   * Falls back to simulated data if Pedometer is not available
   */
  private async fetchStepsFromPlatform(): Promise<StepsData | null> {
    const today = new Date().toISOString().split('T')[0];

    try {
      // Check if Pedometer is available on this device
      const isAvailable = await Pedometer.isAvailableAsync();

      if (isAvailable && Platform.OS !== 'web') {
        // Get step count for today
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();

        const result = await Pedometer.getStepCountAsync(start, end);

        console.debug('[HealthData] Pedometer steps:', result.steps);

        // Estimate distance and calories based on steps
        // Average stride length ~0.75m, ~0.04 calories per step
        const distance = Math.round(result.steps * 0.75);
        const caloriesBurned = Math.round(result.steps * 0.04);

        return {
          date: today,
          count: result.steps,
          goal: this.stepsGoal,
          distance,
          caloriesBurned,
        };
      }
    } catch (error) {
      console.warn('[HealthData] Pedometer error, using simulated data:', error);
    }

    // On web, return null (no pedometer available)
    // On native without pedometer, return null - user can manually log
    console.debug('[HealthData] Pedometer not available, steps require manual entry');
    return null;
  }

  /**
   * Fetch heart rate via platform health adapter (HealthKit / Health Connect)
   */
  private async fetchHeartRateFromPlatform(): Promise<HeartRateData | null> {
    try {
      const now = new Date();
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      const sample = await healthAdapter.getHeartRate(dayStart, now);
      if (!sample) return null;
      return { bpm: sample.value, timestamp: sample.startDate };
    } catch {
      return null;
    }
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

    // Upload to the care circle so caregivers see the vital and the server can
    // run its abnormal-vital → caregiver_alert pipeline. Fire-and-forget: a
    // failure leaves the reading stored locally and is retried on the next add.
    if (careCircleSyncService.isConnected()) {
      const serverReading = vitalReadingToServerReading(newReading);
      if (serverReading) {
        void careCircleSyncService
          .pushHealthReadings([serverReading])
          .then((r) => {
            if (!r.success) {
              console.warn('[HealthData] vital upload failed:', r.error);
              this.notifySyncError(r.error || 'Upload failed');
            }
          })
          .catch((e) => {
            console.warn('[HealthData] vital upload error:', e);
            this.notifySyncError('Network error');
          });
      }
    }

    return newReading;
  }

  private syncErrorListeners: ((error: string) => void)[] = [];

  /** Subscribe to vital-upload failures so the UI can tell the user it didn't reach caregivers. */
  addSyncErrorListener(listener: (error: string) => void): () => void {
    this.syncErrorListeners.push(listener);
    return () => {
      this.syncErrorListeners = this.syncErrorListeners.filter((l) => l !== listener);
    };
  }

  private notifySyncError(error: string): void {
    this.syncErrorListeners.forEach((l) => {
      try { l(error); } catch { /* listener errors must not break health logging */ }
    });
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

/**
 * Platform Health Adapter
 *
 * Bridges HealthKit (iOS) and Health Connect (Android) into a unified interface.
 * Falls back gracefully when native modules are not installed.
 *
 * To enable native health sync, install:
 *   iOS:     npx expo install @kingstinct/react-native-healthkit
 *   Android: npx expo install react-native-health-connect
 * Then rebuild with EAS: eas build --platform all
 */

import { Platform } from 'react-native';

export interface HealthSample {
  value: number;
  unit: string;
  startDate: string;
  endDate: string;
  source?: string;
}

export interface HealthPermissions {
  granted: string[];
  denied: string[];
}

export interface HealthAdapterInterface {
  isAvailable(): Promise<boolean>;
  requestPermissions(types: HealthDataType[]): Promise<HealthPermissions>;
  getSteps(startDate: Date, endDate: Date): Promise<number | null>;
  getHeartRate(startDate: Date, endDate: Date): Promise<HealthSample | null>;
  getBloodPressure(startDate: Date, endDate: Date): Promise<{ systolic: number; diastolic: number } | null>;
  getBloodGlucose(startDate: Date, endDate: Date): Promise<HealthSample | null>;
  getWeight(startDate: Date, endDate: Date): Promise<HealthSample | null>;
  getOxygenSaturation(startDate: Date, endDate: Date): Promise<HealthSample | null>;
  writeSteps(steps: number, startDate: Date, endDate: Date): Promise<boolean>;
  writeHeartRate(bpm: number, date: Date): Promise<boolean>;
}

export type HealthDataType =
  | 'steps'
  | 'heart_rate'
  | 'blood_pressure'
  | 'blood_glucose'
  | 'weight'
  | 'oxygen_saturation';

// Null adapter — used when native modules are not installed
class NullHealthAdapter implements HealthAdapterInterface {
  async isAvailable() { return false; }
  async requestPermissions() { return { granted: [], denied: [] }; }
  async getSteps() { return null; }
  async getHeartRate() { return null; }
  async getBloodPressure() { return null; }
  async getBloodGlucose() { return null; }
  async getWeight() { return null; }
  async getOxygenSaturation() { return null; }
  async writeSteps() { return false; }
  async writeHeartRate() { return false; }
}

// iOS HealthKit adapter — wraps @kingstinct/react-native-healthkit
class HealthKitAdapter implements HealthAdapterInterface {
  private HK: any = null;

  constructor() {
    try {
      // Dynamic require — won't throw a build error when the module isn't installed
      this.HK = require('@kingstinct/react-native-healthkit');
    } catch {
      // Module not installed — isAvailable() will return false
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.HK) return false;
    try {
      return await this.HK.isHealthDataAvailable();
    } catch {
      return false;
    }
  }

  async requestPermissions(types: HealthDataType[]): Promise<HealthPermissions> {
    if (!this.HK) return { granted: [], denied: types.map(String) };
    try {
      const readTypes = types.map((t) => this._mapType(t)).filter(Boolean);
      await this.HK.requestAuthorization(readTypes, readTypes);
      return { granted: types.map(String), denied: [] };
    } catch {
      return { granted: [], denied: types.map(String) };
    }
  }

  async getSteps(startDate: Date, endDate: Date): Promise<number | null> {
    if (!this.HK) return null;
    try {
      const result = await this.HK.getStatisticsForQuantity(
        this.HK.HKQuantityTypeIdentifier.StepCount,
        'sum',
        startDate,
        endDate
      );
      return result?.quantity ?? null;
    } catch {
      return null;
    }
  }

  async getHeartRate(startDate: Date, endDate: Date): Promise<HealthSample | null> {
    if (!this.HK) return null;
    try {
      const samples = await this.HK.querySamplesSortedByDate(
        this.HK.HKQuantityTypeIdentifier.HeartRate,
        startDate,
        endDate,
        1
      );
      if (!samples?.length) return null;
      const s = samples[0];
      return { value: s.quantity, unit: 'bpm', startDate: s.startDate, endDate: s.endDate };
    } catch {
      return null;
    }
  }

  async getBloodPressure(startDate: Date, endDate: Date): Promise<{ systolic: number; diastolic: number } | null> {
    if (!this.HK) return null;
    try {
      const systolicSamples = await this.HK.querySamplesSortedByDate(
        this.HK.HKQuantityTypeIdentifier.BloodPressureSystolic,
        startDate, endDate, 1
      );
      const diastolicSamples = await this.HK.querySamplesSortedByDate(
        this.HK.HKQuantityTypeIdentifier.BloodPressureDiastolic,
        startDate, endDate, 1
      );
      if (!systolicSamples?.length || !diastolicSamples?.length) return null;
      return { systolic: systolicSamples[0].quantity, diastolic: diastolicSamples[0].quantity };
    } catch {
      return null;
    }
  }

  async getBloodGlucose(startDate: Date, endDate: Date): Promise<HealthSample | null> {
    if (!this.HK) return null;
    try {
      const samples = await this.HK.querySamplesSortedByDate(
        this.HK.HKQuantityTypeIdentifier.BloodGlucose,
        startDate, endDate, 1
      );
      if (!samples?.length) return null;
      const s = samples[0];
      return { value: s.quantity, unit: 'mg/dL', startDate: s.startDate, endDate: s.endDate };
    } catch {
      return null;
    }
  }

  async getWeight(startDate: Date, endDate: Date): Promise<HealthSample | null> {
    if (!this.HK) return null;
    try {
      const samples = await this.HK.querySamplesSortedByDate(
        this.HK.HKQuantityTypeIdentifier.BodyMass,
        startDate, endDate, 1
      );
      if (!samples?.length) return null;
      const s = samples[0];
      return { value: s.quantity, unit: 'kg', startDate: s.startDate, endDate: s.endDate };
    } catch {
      return null;
    }
  }

  async getOxygenSaturation(startDate: Date, endDate: Date): Promise<HealthSample | null> {
    if (!this.HK) return null;
    try {
      const samples = await this.HK.querySamplesSortedByDate(
        this.HK.HKQuantityTypeIdentifier.OxygenSaturation,
        startDate, endDate, 1
      );
      if (!samples?.length) return null;
      const s = samples[0];
      return { value: Math.round(s.quantity * 100), unit: '%', startDate: s.startDate, endDate: s.endDate };
    } catch {
      return null;
    }
  }

  async writeSteps(steps: number, startDate: Date, endDate: Date): Promise<boolean> {
    if (!this.HK) return false;
    try {
      await this.HK.saveQuantitySample(
        this.HK.HKQuantityTypeIdentifier.StepCount,
        'count',
        steps,
        startDate,
        endDate
      );
      return true;
    } catch {
      return false;
    }
  }

  async writeHeartRate(bpm: number, date: Date): Promise<boolean> {
    if (!this.HK) return false;
    try {
      await this.HK.saveQuantitySample(
        this.HK.HKQuantityTypeIdentifier.HeartRate,
        'count/min',
        bpm,
        date,
        date
      );
      return true;
    } catch {
      return false;
    }
  }

  private _mapType(type: HealthDataType): string | null {
    if (!this.HK) return null;
    const map: Record<HealthDataType, string> = {
      steps: this.HK.HKQuantityTypeIdentifier?.StepCount,
      heart_rate: this.HK.HKQuantityTypeIdentifier?.HeartRate,
      blood_pressure: this.HK.HKQuantityTypeIdentifier?.BloodPressureSystolic,
      blood_glucose: this.HK.HKQuantityTypeIdentifier?.BloodGlucose,
      weight: this.HK.HKQuantityTypeIdentifier?.BodyMass,
      oxygen_saturation: this.HK.HKQuantityTypeIdentifier?.OxygenSaturation,
    };
    return map[type] ?? null;
  }
}

// Android Health Connect adapter — wraps react-native-health-connect
class HealthConnectAdapter implements HealthAdapterInterface {
  private HC: any = null;

  constructor() {
    try {
      this.HC = require('react-native-health-connect');
    } catch {
      // Module not installed
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.HC) return false;
    try {
      const status = await this.HC.getSdkStatus();
      return status === this.HC.SdkAvailabilityStatus.SDK_AVAILABLE;
    } catch {
      return false;
    }
  }

  async requestPermissions(types: HealthDataType[]): Promise<HealthPermissions> {
    if (!this.HC) return { granted: [], denied: types.map(String) };
    try {
      await this.HC.initialize();
      const permissions = types.flatMap((t) => {
        const recordType = this._mapType(t);
        return recordType
          ? [
              { accessType: 'read', recordType },
              { accessType: 'write', recordType },
            ]
          : [];
      });
      const result = await this.HC.requestPermission(permissions);
      const grantedTypes = result
        .filter((r: any) => r.granted)
        .map((r: any) => r.recordType as string);
      const granted = types.filter((t) => {
        const mapped = this._mapType(t);
        return mapped && grantedTypes.includes(mapped);
      });
      const denied = types.filter((t) => !granted.includes(t));
      return { granted: granted.map(String), denied: denied.map(String) };
    } catch {
      return { granted: [], denied: types.map(String) };
    }
  }

  async getSteps(startDate: Date, endDate: Date): Promise<number | null> {
    if (!this.HC) return null;
    try {
      await this.HC.initialize();
      const result = await this.HC.readRecords('Steps', {
        timeRangeFilter: { operator: 'between', startTime: startDate.toISOString(), endTime: endDate.toISOString() },
      });
      if (!result?.records?.length) return null;
      return result.records.reduce((sum: number, r: any) => sum + r.count, 0);
    } catch {
      return null;
    }
  }

  async getHeartRate(startDate: Date, endDate: Date): Promise<HealthSample | null> {
    if (!this.HC) return null;
    try {
      await this.HC.initialize();
      const result = await this.HC.readRecords('HeartRate', {
        timeRangeFilter: { operator: 'between', startTime: startDate.toISOString(), endTime: endDate.toISOString() },
        ascendingOrder: false,
        pageSize: 1,
      });
      if (!result?.records?.length) return null;
      const rec = result.records[0];
      const sample = rec.samples?.[0];
      if (!sample) return null;
      return {
        value: sample.beatsPerMinute,
        unit: 'bpm',
        startDate: rec.startTime,
        endDate: rec.endTime,
      };
    } catch {
      return null;
    }
  }

  async getBloodPressure(startDate: Date, endDate: Date): Promise<{ systolic: number; diastolic: number } | null> {
    if (!this.HC) return null;
    try {
      await this.HC.initialize();
      const result = await this.HC.readRecords('BloodPressure', {
        timeRangeFilter: { operator: 'between', startTime: startDate.toISOString(), endTime: endDate.toISOString() },
        ascendingOrder: false,
        pageSize: 1,
      });
      if (!result?.records?.length) return null;
      const rec = result.records[0];
      return { systolic: rec.systolic.inMillimetersOfMercury, diastolic: rec.diastolic.inMillimetersOfMercury };
    } catch {
      return null;
    }
  }

  async getBloodGlucose(startDate: Date, endDate: Date): Promise<HealthSample | null> {
    if (!this.HC) return null;
    try {
      await this.HC.initialize();
      const result = await this.HC.readRecords('BloodGlucose', {
        timeRangeFilter: { operator: 'between', startTime: startDate.toISOString(), endTime: endDate.toISOString() },
        ascendingOrder: false,
        pageSize: 1,
      });
      if (!result?.records?.length) return null;
      const rec = result.records[0];
      // Convert mmol/L to mg/dL (multiply by 18.016)
      return { value: Math.round(rec.level.inMillimolesPerLiter * 18.016), unit: 'mg/dL', startDate: rec.time, endDate: rec.time };
    } catch {
      return null;
    }
  }

  async getWeight(startDate: Date, endDate: Date): Promise<HealthSample | null> {
    if (!this.HC) return null;
    try {
      await this.HC.initialize();
      const result = await this.HC.readRecords('Weight', {
        timeRangeFilter: { operator: 'between', startTime: startDate.toISOString(), endTime: endDate.toISOString() },
        ascendingOrder: false,
        pageSize: 1,
      });
      if (!result?.records?.length) return null;
      const rec = result.records[0];
      return { value: rec.weight.inKilograms, unit: 'kg', startDate: rec.time, endDate: rec.time };
    } catch {
      return null;
    }
  }

  async getOxygenSaturation(startDate: Date, endDate: Date): Promise<HealthSample | null> {
    if (!this.HC) return null;
    try {
      await this.HC.initialize();
      const result = await this.HC.readRecords('OxygenSaturation', {
        timeRangeFilter: { operator: 'between', startTime: startDate.toISOString(), endTime: endDate.toISOString() },
        ascendingOrder: false,
        pageSize: 1,
      });
      if (!result?.records?.length) return null;
      const rec = result.records[0];
      return { value: Math.round(rec.percentage.value), unit: '%', startDate: rec.time, endDate: rec.time };
    } catch {
      return null;
    }
  }

  async writeSteps(steps: number, startDate: Date, endDate: Date): Promise<boolean> {
    if (!this.HC) return false;
    try {
      await this.HC.initialize();
      await this.HC.insertRecords([{ recordType: 'Steps', count: steps, startTime: startDate.toISOString(), endTime: endDate.toISOString() }]);
      return true;
    } catch {
      return false;
    }
  }

  async writeHeartRate(bpm: number, date: Date): Promise<boolean> {
    if (!this.HC) return false;
    try {
      await this.HC.initialize();
      await this.HC.insertRecords([{
        recordType: 'HeartRate',
        samples: [{ time: date.toISOString(), beatsPerMinute: bpm }],
        startTime: date.toISOString(),
        endTime: date.toISOString(),
      }]);
      return true;
    } catch {
      return false;
    }
  }

  private _mapType(type: HealthDataType): string | null {
    const map: Record<HealthDataType, string> = {
      steps: 'Steps',
      heart_rate: 'HeartRate',
      blood_pressure: 'BloodPressure',
      blood_glucose: 'BloodGlucose',
      weight: 'Weight',
      oxygen_saturation: 'OxygenSaturation',
    };
    return map[type] ?? null;
  }
}

// Singleton — picks the right adapter for the current platform
function createHealthAdapter(): HealthAdapterInterface {
  if (Platform.OS === 'ios') return new HealthKitAdapter();
  if (Platform.OS === 'android') return new HealthConnectAdapter();
  return new NullHealthAdapter();
}

export const healthAdapter: HealthAdapterInterface = createHealthAdapter();
export default healthAdapter;

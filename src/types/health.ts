/**
 * Health Data Types
 * Types for medications, vitals, appointments, and medical records
 */

// Medication Types
export interface Medication {
  id: string;
  name: string;
  genericName?: string;
  dosage: string;
  unit: 'mg' | 'ml' | 'tablet' | 'capsule' | 'drops' | 'units' | 'puff' | 'patch' | 'other';
  frequency: MedicationFrequency;
  schedule: MedicationSchedule[];
  prescribedBy?: string;
  prescribedDate?: string;
  purpose?: string;
  instructions?: string;
  sideEffects?: string[];
  refillDate?: string;
  refillReminder?: boolean;
  isActive: boolean;
  startDate: string;
  endDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type MedicationFrequency =
  | 'once_daily'
  | 'twice_daily'
  | 'three_times_daily'
  | 'four_times_daily'
  | 'every_other_day'
  | 'weekly'
  | 'as_needed'
  | 'custom';

export interface MedicationSchedule {
  id: string;
  time: string; // HH:mm format
  label?: string; // "Morning", "With breakfast", etc.
  daysOfWeek?: number[]; // 0-6, Sunday-Saturday (for custom frequency)
}

export interface MedicationDose {
  id: string;
  medicationId: string;
  scheduledTime: string;
  actualTime?: string;
  status: 'pending' | 'taken' | 'missed' | 'skipped';
  notes?: string;
  recordedAt?: string;
}

export interface MedicationAdherence {
  medicationId: string;
  medicationName: string;
  period: 'day' | 'week' | 'month';
  totalDoses: number;
  takenDoses: number;
  missedDoses: number;
  skippedDoses: number;
  adherenceRate: number; // 0-100
}

// Vital Signs Types
export type VitalType =
  | 'steps'
  | 'heart_rate'
  | 'blood_pressure'
  | 'blood_glucose'
  | 'weight'
  | 'temperature'
  | 'oxygen_saturation'
  | 'sleep';

export interface VitalReading {
  id: string;
  type: VitalType;
  value: number;
  secondaryValue?: number; // For blood pressure (diastolic)
  unit: string;
  timestamp: string;
  source: 'manual' | 'health_connect' | 'healthkit' | 'device';
  deviceName?: string;
  notes?: string;
}

export interface VitalSummary {
  type: VitalType;
  displayName: string;
  icon: string;
  latestReading?: VitalReading;
  average?: number;
  min?: number;
  max?: number;
  trend: 'up' | 'down' | 'stable' | 'unknown';
  unit: string;
  normalRange?: { min: number; max: number };
  period: 'day' | 'week' | 'month';
}

export interface StepsData {
  date: string;
  count: number;
  goal: number;
  distance?: number; // in meters
  caloriesBurned?: number;
}

export interface HeartRateData {
  timestamp: string;
  bpm: number;
  context?: 'resting' | 'active' | 'workout' | 'sleep';
}

export interface BloodPressureData {
  timestamp: string;
  systolic: number;
  diastolic: number;
  pulse?: number;
}

export interface SleepData {
  date: string;
  totalMinutes: number;
  deepSleepMinutes?: number;
  lightSleepMinutes?: number;
  remSleepMinutes?: number;
  awakeMinutes?: number;
  sleepScore?: number;
}

// Appointment Types
export interface Appointment {
  id: string;
  title: string;
  doctorId?: string;
  doctorName: string;
  specialty?: string;
  location?: string;
  address?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  duration?: number; // in minutes
  type: 'checkup' | 'followup' | 'specialist' | 'lab' | 'imaging' | 'procedure' | 'other';
  notes?: string;
  reminderTime?: number; // minutes before
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'rescheduled';
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentReminder {
  appointmentId: string;
  reminderTime: string;
  sent: boolean;
  sentAt?: string;
}

// Medical Records Types
export interface MedicalRecord {
  id: string;
  title: string;
  type: MedicalRecordType;
  category: string;
  date: string;
  provider?: string;
  description?: string;
  fileUri?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  thumbnail?: string;
  tags: string[];
  summary?: string; // AI-generated summary
  extractedData?: Record<string, unknown>; // AI-extracted key data
  isConfidential: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MedicalRecordType =
  | 'lab_report'
  | 'imaging'
  | 'prescription'
  | 'discharge_summary'
  | 'consultation_note'
  | 'vaccination_record'
  | 'insurance_document'
  | 'other';

export const MEDICAL_RECORD_CATEGORIES: Record<MedicalRecordType, {
  displayName: string;
  icon: string;
  description: string;
}> = {
  lab_report: {
    displayName: 'Lab Report',
    icon: '🧪',
    description: 'Blood tests, urine tests, pathology reports',
  },
  imaging: {
    displayName: 'Imaging',
    icon: '🩻',
    description: 'X-rays, MRI, CT scans, ultrasounds',
  },
  prescription: {
    displayName: 'Prescription',
    icon: '📝',
    description: 'Doctor prescriptions and medication orders',
  },
  discharge_summary: {
    displayName: 'Discharge Summary',
    icon: '🏥',
    description: 'Hospital discharge documents',
  },
  consultation_note: {
    displayName: 'Consultation Note',
    icon: '👨‍⚕️',
    description: 'Doctor visit notes and consultations',
  },
  vaccination_record: {
    displayName: 'Vaccination Record',
    icon: '💉',
    description: 'Immunization records',
  },
  insurance_document: {
    displayName: 'Insurance Document',
    icon: '📋',
    description: 'Health insurance papers and claims',
  },
  other: {
    displayName: 'Other',
    icon: '📄',
    description: 'Other medical documents',
  },
};

// Health Sync Status
export interface HealthSyncStatus {
  isConnected: boolean;
  platform: 'ios' | 'android' | 'none';
  lastSyncTime?: string;
  permissionsGranted: string[];
  permissionsDenied: string[];
  error?: string;
}

// Vital type metadata
export const VITAL_TYPE_INFO: Record<VitalType, {
  displayName: string;
  icon: string;
  unit: string;
  normalRange?: { min: number; max: number };
  description: string;
}> = {
  steps: {
    displayName: 'Steps',
    icon: '👟',
    unit: 'steps',
    normalRange: { min: 7000, max: 10000 },
    description: 'Daily step count',
  },
  heart_rate: {
    displayName: 'Heart Rate',
    icon: '❤️',
    unit: 'bpm',
    normalRange: { min: 60, max: 100 },
    description: 'Beats per minute',
  },
  blood_pressure: {
    displayName: 'Blood Pressure',
    icon: '🩺',
    unit: 'mmHg',
    normalRange: { min: 90, max: 120 }, // systolic
    description: 'Systolic/Diastolic pressure',
  },
  blood_glucose: {
    displayName: 'Blood Glucose',
    icon: '🩸',
    unit: 'mg/dL',
    normalRange: { min: 70, max: 100 },
    description: 'Blood sugar level',
  },
  weight: {
    displayName: 'Weight',
    icon: '⚖️',
    unit: 'kg',
    description: 'Body weight',
  },
  temperature: {
    displayName: 'Temperature',
    icon: '🌡️',
    unit: '°F',
    normalRange: { min: 97, max: 99 },
    description: 'Body temperature',
  },
  oxygen_saturation: {
    displayName: 'Oxygen Saturation',
    icon: '💨',
    unit: '%',
    normalRange: { min: 95, max: 100 },
    description: 'Blood oxygen level',
  },
  sleep: {
    displayName: 'Sleep',
    icon: '😴',
    unit: 'hours',
    normalRange: { min: 7, max: 9 },
    description: 'Sleep duration',
  },
};

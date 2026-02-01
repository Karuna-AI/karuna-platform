import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { auditLogService } from './auditLog';
import {
  Medication,
  MedicationSchedule,
  MedicationDose,
  MedicationAdherence,
  MedicationFrequency,
} from '../types/health';

const STORAGE_KEYS = {
  MEDICATIONS: '@karuna_medications',
  DOSES: '@karuna_medication_doses',
  NOTIFICATION_IDS: '@karuna_medication_notification_ids',
};

// Configure notifications (native only)
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

class MedicationService {
  private medications: Medication[] = [];
  private doses: MedicationDose[] = [];
  private notificationIds: Map<string, string[]> = new Map();
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load medications
      const medsStored = await AsyncStorage.getItem(STORAGE_KEYS.MEDICATIONS);
      if (medsStored) {
        this.medications = JSON.parse(medsStored);
      }

      // Load dose history
      const dosesStored = await AsyncStorage.getItem(STORAGE_KEYS.DOSES);
      if (dosesStored) {
        this.doses = JSON.parse(dosesStored);
      }

      // Load notification IDs
      const notifStored = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATION_IDS);
      if (notifStored) {
        this.notificationIds = new Map(JSON.parse(notifStored));
      }

      // Request notification permissions
      await this.requestNotificationPermissions();

      // Schedule notifications for active medications
      await this.rescheduleAllNotifications();

      this.isInitialized = true;
      console.log('[Medication] Initialized with', this.medications.length, 'medications');
    } catch (error) {
      console.error('[Medication] Initialization error:', error);
      this.isInitialized = true;
    }
  }

  /**
   * Request notification permissions
   */
  private async requestNotificationPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      return finalStatus === 'granted';
    } catch (error) {
      console.error('[Medication] Notification permission error:', error);
      return false;
    }
  }

  /**
   * Add a new medication
   */
  async addMedication(
    medication: Omit<Medication, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Medication> {
    const newMedication: Medication = {
      id: `med_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...medication,
    };

    this.medications.push(newMedication);
    await this.saveMedications();

    // Schedule notifications
    if (newMedication.isActive) {
      await this.scheduleNotifications(newMedication);
    }

    await auditLogService.logVaultAccess({
      action: 'created',
      entityType: 'medication',
      entityId: newMedication.id,
      entityName: newMedication.name,
    });

    return newMedication;
  }

  /**
   * Update a medication
   */
  async updateMedication(
    id: string,
    updates: Partial<Medication>
  ): Promise<Medication | null> {
    const index = this.medications.findIndex((m) => m.id === id);
    if (index === -1) return null;

    const updated = {
      ...this.medications[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.medications[index] = updated;
    await this.saveMedications();

    // Reschedule notifications
    await this.cancelNotifications(id);
    if (updated.isActive) {
      await this.scheduleNotifications(updated);
    }

    await auditLogService.logVaultAccess({
      action: 'updated',
      entityType: 'medication',
      entityId: id,
      entityName: updated.name,
    });

    return updated;
  }

  /**
   * Delete a medication
   */
  async deleteMedication(id: string): Promise<boolean> {
    const index = this.medications.findIndex((m) => m.id === id);
    if (index === -1) return false;

    const medication = this.medications[index];
    await this.cancelNotifications(id);

    this.medications.splice(index, 1);
    await this.saveMedications();

    await auditLogService.logVaultAccess({
      action: 'deleted',
      entityType: 'medication',
      entityId: id,
      entityName: medication.name,
    });

    return true;
  }

  /**
   * Get all medications
   */
  getMedications(activeOnly: boolean = false): Medication[] {
    if (activeOnly) {
      return this.medications.filter((m) => m.isActive);
    }
    return [...this.medications];
  }

  /**
   * Get medication by ID
   */
  getMedicationById(id: string): Medication | null {
    return this.medications.find((m) => m.id === id) || null;
  }

  /**
   * Search medications by name
   */
  searchMedications(query: string): Medication[] {
    const lowerQuery = query.toLowerCase();
    return this.medications.filter(
      (m) =>
        m.name.toLowerCase().includes(lowerQuery) ||
        m.genericName?.toLowerCase().includes(lowerQuery) ||
        m.purpose?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get today's medication schedule
   */
  getTodaySchedule(): {
    medication: Medication;
    schedule: MedicationSchedule;
    dose: MedicationDose | null;
  }[] {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const todayStr = today.toISOString().split('T')[0];

    const schedule: {
      medication: Medication;
      schedule: MedicationSchedule;
      dose: MedicationDose | null;
    }[] = [];

    for (const medication of this.medications) {
      if (!medication.isActive) continue;

      for (const sched of medication.schedule) {
        // Check if this schedule applies to today
        if (sched.daysOfWeek && !sched.daysOfWeek.includes(dayOfWeek)) {
          continue;
        }

        // Find existing dose for this schedule
        const existingDose = this.doses.find(
          (d) =>
            d.medicationId === medication.id &&
            d.scheduledTime.startsWith(todayStr) &&
            d.scheduledTime.includes(sched.time)
        );

        schedule.push({
          medication,
          schedule: sched,
          dose: existingDose || null,
        });
      }
    }

    // Sort by time
    schedule.sort((a, b) => a.schedule.time.localeCompare(b.schedule.time));

    return schedule;
  }

  /**
   * Record a dose taken
   */
  async recordDose(
    medicationId: string,
    scheduleId: string,
    status: 'taken' | 'skipped',
    notes?: string
  ): Promise<MedicationDose> {
    const medication = this.getMedicationById(medicationId);
    const schedule = medication?.schedule.find((s) => s.id === scheduleId);

    if (!medication || !schedule) {
      throw new Error('Medication or schedule not found');
    }

    const today = new Date().toISOString().split('T')[0];
    const scheduledTime = `${today}T${schedule.time}:00`;

    const dose: MedicationDose = {
      id: `dose_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      medicationId,
      scheduledTime,
      actualTime: status === 'taken' ? new Date().toISOString() : undefined,
      status,
      notes,
      recordedAt: new Date().toISOString(),
    };

    this.doses.unshift(dose);
    await this.saveDoses();

    await auditLogService.log({
      action: 'vault_data_updated',
      category: 'vault',
      description: `Medication ${status}: ${medication.name}`,
      entityType: 'medication_dose',
      entityId: dose.id,
    });

    return dose;
  }

  /**
   * Mark a dose as missed (called by background job or notification)
   */
  async markDoseMissed(medicationId: string, scheduledTime: string): Promise<MedicationDose> {
    const medication = this.getMedicationById(medicationId);
    if (!medication) {
      throw new Error('Medication not found');
    }

    const dose: MedicationDose = {
      id: `dose_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      medicationId,
      scheduledTime,
      status: 'missed',
      recordedAt: new Date().toISOString(),
    };

    this.doses.unshift(dose);
    await this.saveDoses();

    return dose;
  }

  /**
   * Get adherence statistics
   */
  getAdherence(
    medicationId?: string,
    period: 'day' | 'week' | 'month' = 'week'
  ): MedicationAdherence[] {
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

    const medications = medicationId
      ? this.medications.filter((m) => m.id === medicationId)
      : this.medications.filter((m) => m.isActive);

    return medications.map((medication) => {
      const doses = this.doses.filter(
        (d) =>
          d.medicationId === medication.id &&
          new Date(d.scheduledTime) >= startDate
      );

      const takenDoses = doses.filter((d) => d.status === 'taken').length;
      const missedDoses = doses.filter((d) => d.status === 'missed').length;
      const skippedDoses = doses.filter((d) => d.status === 'skipped').length;
      const totalDoses = doses.length;

      return {
        medicationId: medication.id,
        medicationName: medication.name,
        period,
        totalDoses,
        takenDoses,
        missedDoses,
        skippedDoses,
        adherenceRate: totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 100,
      };
    });
  }

  /**
   * Get medication summary for AI queries
   */
  getMedicationSummary(): string {
    const activeMeds = this.getMedications(true);
    if (activeMeds.length === 0) {
      return 'No active medications recorded.';
    }

    const lines = activeMeds.map((med) => {
      const schedule = med.schedule
        .map((s) => s.label || s.time)
        .join(', ');
      return `- ${med.name} (${med.dosage} ${med.unit}): ${schedule}${med.purpose ? ` - for ${med.purpose}` : ''}`;
    });

    return `Current medications:\n${lines.join('\n')}`;
  }

  /**
   * Get next scheduled dose
   */
  getNextDose(): {
    medication: Medication;
    schedule: MedicationSchedule;
    time: Date;
  } | null {
    const now = new Date();
    const todaySchedule = this.getTodaySchedule();

    // Find next pending dose
    for (const item of todaySchedule) {
      if (!item.dose || item.dose.status === 'pending') {
        const [hours, minutes] = item.schedule.time.split(':').map(Number);
        const doseTime = new Date();
        doseTime.setHours(hours, minutes, 0, 0);

        if (doseTime > now) {
          return {
            medication: item.medication,
            schedule: item.schedule,
            time: doseTime,
          };
        }
      }
    }

    return null;
  }

  /**
   * Schedule notifications for a medication
   */
  private async scheduleNotifications(medication: Medication): Promise<void> {
    if (Platform.OS === 'web') return;
    const ids: string[] = [];

    for (const schedule of medication.schedule) {
      const [hours, minutes] = schedule.time.split(':').map(Number);

      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: '💊 Medication Reminder',
            body: `Time to take ${medication.name} (${medication.dosage} ${medication.unit})`,
            data: { medicationId: medication.id, scheduleId: schedule.id },
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: hours,
            minute: minutes,
          },
        });

        ids.push(id);
      } catch (error) {
        console.error('[Medication] Failed to schedule notification:', error);
      }
    }

    this.notificationIds.set(medication.id, ids);
    await this.saveNotificationIds();
  }

  /**
   * Cancel notifications for a medication
   */
  private async cancelNotifications(medicationId: string): Promise<void> {
    if (Platform.OS === 'web') return;
    const ids = this.notificationIds.get(medicationId) || [];

    for (const id of ids) {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch (error) {
        console.error('[Medication] Failed to cancel notification:', error);
      }
    }

    this.notificationIds.delete(medicationId);
    await this.saveNotificationIds();
  }

  /**
   * Reschedule all notifications
   */
  private async rescheduleAllNotifications(): Promise<void> {
    if (Platform.OS === 'web') return;
    // Cancel all existing notifications
    await Notifications.cancelAllScheduledNotificationsAsync();
    this.notificationIds.clear();

    // Schedule for active medications
    for (const medication of this.medications) {
      if (medication.isActive) {
        await this.scheduleNotifications(medication);
      }
    }
  }

  /**
   * Create schedule times based on frequency
   */
  static createScheduleFromFrequency(frequency: MedicationFrequency): MedicationSchedule[] {
    const schedules: MedicationSchedule[] = [];
    const makeId = () => `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    switch (frequency) {
      case 'once_daily':
        schedules.push({ id: makeId(), time: '09:00', label: 'Morning' });
        break;
      case 'twice_daily':
        schedules.push({ id: makeId(), time: '09:00', label: 'Morning' });
        schedules.push({ id: makeId(), time: '21:00', label: 'Evening' });
        break;
      case 'three_times_daily':
        schedules.push({ id: makeId(), time: '08:00', label: 'Morning' });
        schedules.push({ id: makeId(), time: '14:00', label: 'Afternoon' });
        schedules.push({ id: makeId(), time: '20:00', label: 'Evening' });
        break;
      case 'four_times_daily':
        schedules.push({ id: makeId(), time: '08:00', label: 'Morning' });
        schedules.push({ id: makeId(), time: '12:00', label: 'Noon' });
        schedules.push({ id: makeId(), time: '18:00', label: 'Evening' });
        schedules.push({ id: makeId(), time: '22:00', label: 'Night' });
        break;
      case 'every_other_day':
        schedules.push({
          id: makeId(),
          time: '09:00',
          label: 'Morning',
          daysOfWeek: [0, 2, 4, 6], // Sun, Tue, Thu, Sat
        });
        break;
      case 'weekly':
        schedules.push({
          id: makeId(),
          time: '09:00',
          label: 'Morning',
          daysOfWeek: [0], // Sunday
        });
        break;
      case 'as_needed':
      case 'custom':
        // No default schedule
        break;
    }

    return schedules;
  }

  private async saveMedications(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.MEDICATIONS, JSON.stringify(this.medications));
    } catch (error) {
      console.error('[Medication] Save medications error:', error);
    }
  }

  private async saveDoses(): Promise<void> {
    try {
      // Keep only last 500 doses
      if (this.doses.length > 500) {
        this.doses = this.doses.slice(0, 500);
      }
      await AsyncStorage.setItem(STORAGE_KEYS.DOSES, JSON.stringify(this.doses));
    } catch (error) {
      console.error('[Medication] Save doses error:', error);
    }
  }

  private async saveNotificationIds(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.NOTIFICATION_IDS,
        JSON.stringify(Array.from(this.notificationIds.entries()))
      );
    } catch (error) {
      console.error('[Medication] Save notification IDs error:', error);
    }
  }
}

export const medicationService = new MedicationService();
export default medicationService;

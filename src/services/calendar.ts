/**
 * Calendar Service
 * Manages appointments, reminders, and integrates with device calendar
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { auditLogService } from './auditLog';
import { CalendarEvent } from '../types/proactive';
import { Appointment } from '../types/health';

const STORAGE_KEYS = {
  APPOINTMENTS: '@karuna_appointments',
  REMINDERS: '@karuna_reminders',
  CALENDAR_ID: '@karuna_calendar_id',
};

export interface Reminder {
  id: string;
  title: string;
  description?: string;
  time: string;
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    daysOfWeek?: number[];
  };
  enabled: boolean;
  notificationId?: string;
  createdAt: string;
}

class CalendarService {
  private appointments: Appointment[] = [];
  private reminders: Reminder[] = [];
  private karunaCalendarId: string | null = null;
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load appointments
      const appointmentsStored = await AsyncStorage.getItem(STORAGE_KEYS.APPOINTMENTS);
      if (appointmentsStored) {
        this.appointments = JSON.parse(appointmentsStored);
      }

      // Load reminders
      const remindersStored = await AsyncStorage.getItem(STORAGE_KEYS.REMINDERS);
      if (remindersStored) {
        this.reminders = JSON.parse(remindersStored);
      }

      // Load calendar ID
      const calendarId = await AsyncStorage.getItem(STORAGE_KEYS.CALENDAR_ID);
      if (calendarId) {
        this.karunaCalendarId = calendarId;
      }

      this.isInitialized = true;
      console.debug('[Calendar] Initialized with', this.appointments.length, 'appointments');
    } catch (error) {
      console.error('[Calendar] Initialization error:', error);
      this.isInitialized = true;
    }
  }

  /**
   * Request calendar permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('[Calendar] Permission error:', error);
      return false;
    }
  }

  /**
   * Get or create Karuna calendar
   */
  async getOrCreateKarunaCalendar(): Promise<string | null> {
    if (this.karunaCalendarId) {
      return this.karunaCalendarId;
    }

    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return null;

      // Check if calendar already exists
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const existingCalendar = calendars.find((c) => c.title === 'Karuna');

      if (existingCalendar) {
        this.karunaCalendarId = existingCalendar.id;
        await AsyncStorage.setItem(STORAGE_KEYS.CALENDAR_ID, existingCalendar.id);
        return existingCalendar.id;
      }

      // Create new calendar
      const defaultCalendarSource =
        Platform.OS === 'ios'
          ? calendars.find((c) => c.source.name === 'iCloud')?.source ||
            calendars.find((c) => c.source.name === 'Default')?.source
          : { isLocalAccount: true, name: 'Karuna', type: Calendar.SourceType.LOCAL };

      if (!defaultCalendarSource) {
        console.debug('[Calendar] No suitable calendar source found');
        return null;
      }

      const newCalendarId = await Calendar.createCalendarAsync({
        title: 'Karuna',
        color: '#3b82f6',
        entityType: Calendar.EntityTypes.EVENT,
        sourceId: (defaultCalendarSource as any).id,
        source: defaultCalendarSource as any,
        name: 'Karuna',
        ownerAccount: 'personal',
        accessLevel: Calendar.CalendarAccessLevel.OWNER,
      });

      this.karunaCalendarId = newCalendarId;
      await AsyncStorage.setItem(STORAGE_KEYS.CALENDAR_ID, newCalendarId);

      return newCalendarId;
    } catch (error) {
      console.error('[Calendar] Error creating calendar:', error);
      return null;
    }
  }

  /**
   * Add an appointment
   */
  async addAppointment(
    appointment: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Appointment> {
    const newAppointment: Appointment = {
      id: `apt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...appointment,
    };

    this.appointments.push(newAppointment);
    await this.saveAppointments();

    // Add to device calendar
    await this.addToDeviceCalendar(newAppointment);

    // Schedule reminder notification
    if (appointment.reminderTime) {
      await this.scheduleAppointmentReminder(newAppointment);
    }

    await auditLogService.logVaultAccess({
      action: 'created',
      entityType: 'appointment',
      entityId: newAppointment.id,
      entityName: newAppointment.title,
    });

    return newAppointment;
  }

  /**
   * Update an appointment
   */
  async updateAppointment(
    id: string,
    updates: Partial<Appointment>
  ): Promise<Appointment | null> {
    const index = this.appointments.findIndex((a) => a.id === id);
    if (index === -1) return null;

    const updated = {
      ...this.appointments[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.appointments[index] = updated;
    await this.saveAppointments();

    await auditLogService.logVaultAccess({
      action: 'updated',
      entityType: 'appointment',
      entityId: id,
      entityName: updated.title,
    });

    return updated;
  }

  /**
   * Delete an appointment
   */
  async deleteAppointment(id: string): Promise<boolean> {
    const index = this.appointments.findIndex((a) => a.id === id);
    if (index === -1) return false;

    const appointment = this.appointments[index];
    this.appointments.splice(index, 1);
    await this.saveAppointments();

    await auditLogService.logVaultAccess({
      action: 'deleted',
      entityType: 'appointment',
      entityId: id,
      entityName: appointment.title,
    });

    return true;
  }

  /**
   * Get all appointments
   */
  getAppointments(upcomingOnly: boolean = false): Appointment[] {
    if (upcomingOnly) {
      const now = new Date().toISOString();
      return this.appointments
        .filter((a) => `${a.date}T${a.time}` >= now && a.status !== 'cancelled')
        .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
    }
    return [...this.appointments];
  }

  /**
   * Get appointments for a specific date
   */
  getAppointmentsForDate(date: string): Appointment[] {
    return this.appointments.filter((a) => a.date === date);
  }

  /**
   * Get today's appointments
   */
  getTodayAppointments(): Appointment[] {
    const today = new Date().toISOString().split('T')[0];
    return this.getAppointmentsForDate(today);
  }

  /**
   * Get upcoming appointments in the next N days
   */
  getUpcomingAppointments(days: number = 7): Appointment[] {
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const startStr = now.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    return this.appointments
      .filter(
        (a) =>
          a.date >= startStr &&
          a.date <= endStr &&
          a.status !== 'cancelled'
      )
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  }

  /**
   * Get calendar events formatted for proactive signals
   */
  getCalendarSignalData(): {
    upcomingEvents: CalendarEvent[];
    todayEventCount: number;
    nextEvent?: CalendarEvent;
  } {
    const todayAppointments = this.getTodayAppointments();
    const upcomingAppointments = this.getUpcomingAppointments(3);

    const toCalendarEvent = (apt: Appointment): CalendarEvent => ({
      id: apt.id,
      title: apt.title,
      startTime: `${apt.date}T${apt.time}`,
      endTime: apt.duration
        ? new Date(new Date(`${apt.date}T${apt.time}`).getTime() + apt.duration * 60000).toISOString()
        : undefined,
      location: apt.location,
      isAllDay: false,
      type: 'appointment',
    });

    const upcomingEvents = upcomingAppointments.map(toCalendarEvent);
    const todayEventCount = todayAppointments.length;

    // Find next event
    const now = new Date();
    const nextAppointment = upcomingAppointments.find((apt) => {
      const aptTime = new Date(`${apt.date}T${apt.time}`);
      return aptTime > now;
    });

    return {
      upcomingEvents,
      todayEventCount,
      nextEvent: nextAppointment ? toCalendarEvent(nextAppointment) : undefined,
    };
  }

  /**
   * Add a reminder
   */
  async addReminder(
    reminder: Omit<Reminder, 'id' | 'createdAt'>
  ): Promise<Reminder> {
    const newReminder: Reminder = {
      id: `rem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      ...reminder,
    };

    this.reminders.push(newReminder);
    await this.saveReminders();

    // Schedule notification
    if (newReminder.enabled) {
      await this.scheduleReminderNotification(newReminder);
    }

    return newReminder;
  }

  /**
   * Update a reminder
   */
  async updateReminder(
    id: string,
    updates: Partial<Reminder>
  ): Promise<Reminder | null> {
    const index = this.reminders.findIndex((r) => r.id === id);
    if (index === -1) return null;

    const updated = {
      ...this.reminders[index],
      ...updates,
    };
    this.reminders[index] = updated;
    await this.saveReminders();

    // Reschedule notification if needed
    if (updated.notificationId && Platform.OS !== 'web') {
      await Notifications.cancelScheduledNotificationAsync(updated.notificationId);
    }
    if (updated.enabled) {
      await this.scheduleReminderNotification(updated);
    }

    return updated;
  }

  /**
   * Delete a reminder
   */
  async deleteReminder(id: string): Promise<boolean> {
    const index = this.reminders.findIndex((r) => r.id === id);
    if (index === -1) return false;

    const reminder = this.reminders[index];
    if (reminder.notificationId && Platform.OS !== 'web') {
      await Notifications.cancelScheduledNotificationAsync(reminder.notificationId);
    }

    this.reminders.splice(index, 1);
    await this.saveReminders();

    return true;
  }

  /**
   * Get all reminders
   */
  getReminders(enabledOnly: boolean = false): Reminder[] {
    if (enabledOnly) {
      return this.reminders.filter((r) => r.enabled);
    }
    return [...this.reminders];
  }

  /**
   * Add appointment to device calendar
   */
  private async addToDeviceCalendar(appointment: Appointment): Promise<void> {
    try {
      const calendarId = await this.getOrCreateKarunaCalendar();
      if (!calendarId) return;

      const startDate = new Date(`${appointment.date}T${appointment.time}`);
      const endDate = new Date(startDate.getTime() + (appointment.duration || 60) * 60000);

      await Calendar.createEventAsync(calendarId, {
        title: appointment.title,
        startDate,
        endDate,
        location: appointment.location,
        notes: appointment.notes,
        alarms: appointment.reminderTime
          ? [{ relativeOffset: -appointment.reminderTime }]
          : [],
      });
    } catch (error) {
      console.error('[Calendar] Error adding to device calendar:', error);
    }
  }

  /**
   * Schedule appointment reminder notification
   */
  private async scheduleAppointmentReminder(appointment: Appointment): Promise<void> {
    if (!appointment.reminderTime || Platform.OS === 'web') return;

    try {
      const appointmentTime = new Date(`${appointment.date}T${appointment.time}`);
      const reminderTime = new Date(appointmentTime.getTime() - appointment.reminderTime * 60000);

      if (reminderTime > new Date()) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '📅 Upcoming Appointment',
            body: `${appointment.title} with ${appointment.doctorName} in ${appointment.reminderTime} minutes`,
            data: { appointmentId: appointment.id, type: 'appointment_reminder' },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderTime },
        });
      }
    } catch (error) {
      console.error('[Calendar] Error scheduling reminder:', error);
    }
  }

  /**
   * Schedule reminder notification
   */
  private async scheduleReminderNotification(reminder: Reminder): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      const [hours, minutes] = reminder.time.split(':').map(Number);

      let trigger: any;

      if (reminder.recurring) {
        trigger = {
          hour: hours,
          minute: minutes,
          repeats: true,
        };

        if (reminder.recurring.frequency === 'weekly' && reminder.recurring.daysOfWeek) {
          // For weekly, schedule for specific days
          trigger.weekday = reminder.recurring.daysOfWeek[0] + 1; // expo uses 1-7
        }
      } else {
        // One-time reminder
        const reminderDate = new Date();
        reminderDate.setHours(hours, minutes, 0, 0);

        if (reminderDate <= new Date()) {
          reminderDate.setDate(reminderDate.getDate() + 1);
        }

        trigger = reminderDate;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ Reminder',
          body: reminder.title,
          data: { reminderId: reminder.id, type: 'reminder' },
        },
        trigger,
      });

      reminder.notificationId = notificationId;
      await this.saveReminders();
    } catch (error) {
      console.error('[Calendar] Error scheduling notification:', error);
    }
  }

  /**
   * Get appointment summary for AI
   */
  getAppointmentSummary(): string {
    const upcoming = this.getUpcomingAppointments(7);

    if (upcoming.length === 0) {
      return 'No upcoming appointments in the next week.';
    }

    const today = new Date().toISOString().split('T')[0];
    const todayAppointments = upcoming.filter((a) => a.date === today);

    let summary = '';

    if (todayAppointments.length > 0) {
      const todayList = todayAppointments
        .map((a) => `- ${a.time}: ${a.title} with ${a.doctorName}`)
        .join('\n');
      summary += `Today's appointments:\n${todayList}\n\n`;
    }

    const futureAppointments = upcoming.filter((a) => a.date > today);
    if (futureAppointments.length > 0) {
      const futureList = futureAppointments
        .slice(0, 5)
        .map((a) => `- ${a.date} ${a.time}: ${a.title}`)
        .join('\n');
      summary += `Upcoming appointments:\n${futureList}`;
    }

    return summary || 'No upcoming appointments.';
  }

  private async saveAppointments(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.APPOINTMENTS,
        JSON.stringify(this.appointments)
      );
    } catch (error) {
      console.error('[Calendar] Save appointments error:', error);
    }
  }

  private async saveReminders(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.REMINDERS,
        JSON.stringify(this.reminders)
      );
    } catch (error) {
      console.error('[Calendar] Save reminders error:', error);
    }
  }
}

export const calendarService = new CalendarService();
export default calendarService;

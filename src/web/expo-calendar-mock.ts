/**
 * Web mock for expo-calendar
 * Basic calendar functionality using localStorage
 */

export const EntityTypes = {
  EVENT: 'event',
  REMINDER: 'reminder',
} as const;

export const CalendarAccessLevel = {
  CONTRIBUTOR: 'contributor',
  EDITOR: 'editor',
  FREEBUSY: 'freebusy',
  NONE: 'none',
  OWNER: 'owner',
  READ: 'read',
  ROOT: 'root',
} as const;

export const Frequency = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  YEARLY: 'YEARLY',
} as const;

export const Availability = {
  BUSY: 'busy',
  FREE: 'free',
  TENTATIVE: 'tentative',
  UNAVAILABLE: 'unavailable',
} as const;

export const CalendarType = {
  LOCAL: 'local',
  CALDAV: 'caldav',
  EXCHANGE: 'exchange',
  SUBSCRIBED: 'subscribed',
  BIRTHDAYS: 'birthdays',
  UNKNOWN: 'unknown',
} as const;

const STORAGE_KEY = '__expo_calendar_events__';

function getStoredEvents(): any[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveEvents(events: any[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

export async function requestCalendarPermissionsAsync(): Promise<{ status: string }> {
  // Always grant on web (using localStorage)
  return { status: 'granted' };
}

export async function getCalendarPermissionsAsync(): Promise<{ status: string }> {
  return { status: 'granted' };
}

export async function requestRemindersPermissionsAsync(): Promise<{ status: string }> {
  return { status: 'granted' };
}

export async function getRemindersPermissionsAsync(): Promise<{ status: string }> {
  return { status: 'granted' };
}

export async function getCalendarsAsync(entityType?: string): Promise<any[]> {
  // Return a mock "Local" calendar
  return [{
    id: 'web-local-calendar',
    title: 'Local Calendar',
    source: { id: 'local', type: 'local', name: 'Local' },
    type: CalendarType.LOCAL,
    allowsModifications: true,
    color: '#1976D2',
    isPrimary: true,
    accessLevel: CalendarAccessLevel.OWNER,
  }];
}

export async function getDefaultCalendarAsync(): Promise<any> {
  const calendars = await getCalendarsAsync();
  return calendars[0] || null;
}

export async function createCalendarAsync(details: any): Promise<string> {
  return 'web-local-calendar';
}

export async function deleteCalendarAsync(id: string): Promise<void> {
  // No-op - can't delete the mock calendar
}

export async function getEventsAsync(
  calendarIds: string[],
  startDate: Date,
  endDate: Date
): Promise<any[]> {
  const events = getStoredEvents();
  return events.filter(event => {
    const eventStart = new Date(event.startDate);
    const eventEnd = new Date(event.endDate);
    return eventStart <= endDate && eventEnd >= startDate;
  });
}

export async function getEventAsync(
  eventId: string,
  options?: { futureEvents?: boolean; instanceStartDate?: Date }
): Promise<any | null> {
  const events = getStoredEvents();
  return events.find(e => e.id === eventId) || null;
}

export async function createEventAsync(
  calendarId: string,
  eventDetails: {
    title: string;
    startDate: Date;
    endDate: Date;
    allDay?: boolean;
    location?: string;
    notes?: string;
    alarms?: any[];
    recurrenceRule?: any;
  }
): Promise<string> {
  const events = getStoredEvents();
  const newEvent = {
    id: `event-${Date.now()}`,
    calendarId,
    ...eventDetails,
    startDate: eventDetails.startDate.toISOString(),
    endDate: eventDetails.endDate.toISOString(),
  };
  events.push(newEvent);
  saveEvents(events);
  return newEvent.id;
}

export async function updateEventAsync(
  eventId: string,
  eventDetails: any,
  options?: { futureEvents?: boolean; instanceStartDate?: Date }
): Promise<void> {
  const events = getStoredEvents();
  const index = events.findIndex(e => e.id === eventId);
  if (index >= 0) {
    events[index] = {
      ...events[index],
      ...eventDetails,
      startDate: eventDetails.startDate?.toISOString?.() || events[index].startDate,
      endDate: eventDetails.endDate?.toISOString?.() || events[index].endDate,
    };
    saveEvents(events);
  }
}

export async function deleteEventAsync(
  eventId: string,
  options?: { futureEvents?: boolean; instanceStartDate?: Date }
): Promise<void> {
  const events = getStoredEvents();
  const filtered = events.filter(e => e.id !== eventId);
  saveEvents(filtered);
}

export default {
  EntityTypes,
  CalendarAccessLevel,
  Frequency,
  Availability,
  CalendarType,
  requestCalendarPermissionsAsync,
  getCalendarPermissionsAsync,
  requestRemindersPermissionsAsync,
  getRemindersPermissionsAsync,
  getCalendarsAsync,
  getDefaultCalendarAsync,
  createCalendarAsync,
  deleteCalendarAsync,
  getEventsAsync,
  getEventAsync,
  createEventAsync,
  updateEventAsync,
  deleteEventAsync,
};

/**
 * Proactive Assistance Types
 * Types for the "Karuna checks in" feature
 */

// Signal Types - Data sources for proactive assistance
export type SignalType =
  | 'steps'
  | 'weather'
  | 'calendar'
  | 'medication'
  | 'sleep'
  | 'inactivity'
  | 'wellbeing';

export interface Signal {
  type: SignalType;
  timestamp: string;
  value: unknown;
  metadata?: Record<string, unknown>;
}

export interface StepsSignal extends Signal {
  type: 'steps';
  value: {
    current: number;
    goal: number;
    percentage: number;
    trend: 'low' | 'normal' | 'good' | 'excellent';
  };
}

export interface WeatherSignal extends Signal {
  type: 'weather';
  value: {
    temperature: number;
    feelsLike: number;
    condition: WeatherCondition;
    humidity: number;
    uvIndex: number;
    alert?: string;
  };
}

export type WeatherCondition =
  | 'clear'
  | 'cloudy'
  | 'partly_cloudy'
  | 'rain'
  | 'thunderstorm'
  | 'snow'
  | 'fog'
  | 'hot'
  | 'cold';

export interface CalendarSignal extends Signal {
  type: 'calendar';
  value: {
    upcomingEvents: CalendarEvent[];
    todayEventCount: number;
    nextEvent?: CalendarEvent;
  };
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  location?: string;
  isAllDay: boolean;
  type: 'appointment' | 'reminder' | 'event' | 'medication';
}

export interface MedicationSignal extends Signal {
  type: 'medication';
  value: {
    pendingDoses: number;
    missedDoses: number;
    nextDose?: {
      name: string;
      time: string;
    };
    adherenceRate: number;
  };
}

export interface InactivitySignal extends Signal {
  type: 'inactivity';
  value: {
    minutesSinceActivity: number;
    lastActivityType: string;
    concernLevel: 'normal' | 'mild' | 'moderate' | 'high';
  };
}

// Check-in Types
export type CheckInType =
  | 'step_nudge'
  | 'weather_alert'
  | 'medication_reminder'
  | 'appointment_reminder'
  | 'wellbeing_check'
  | 'inactivity_check'
  | 'hydration_reminder'
  | 'rest_suggestion';

export type CheckInPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CheckIn {
  id: string;
  type: CheckInType;
  priority: CheckInPriority;
  title: string;
  message: string;
  suggestion?: string;
  createdAt: string;
  expiresAt?: string;
  triggerSignals: SignalType[];
  actions: CheckInAction[];
  dismissed: boolean;
  dismissedAt?: string;
  response?: CheckInResponse;
}

export interface CheckInAction {
  id: string;
  label: string;
  type: 'positive' | 'negative' | 'neutral' | 'action' | 'call_caregiver';
  icon?: string;
}

export interface CheckInResponse {
  actionId: string;
  timestamp: string;
  followUp?: string;
}

// Rule Types
export interface ProactiveRule {
  id: string;
  name: string;
  description: string;
  type: CheckInType;
  priority: CheckInPriority;
  enabled: boolean;
  conditions: RuleCondition[];
  cooldownMinutes: number; // Minimum time between triggers
  maxPerDay: number;
  timeWindow?: {
    startHour: number;
    endHour: number;
  };
  messageTemplate: string;
  actions: CheckInAction[];
}

export interface RuleCondition {
  signalType: SignalType;
  operator: 'lt' | 'gt' | 'eq' | 'lte' | 'gte' | 'between' | 'contains';
  value: unknown;
  secondaryValue?: unknown; // For 'between' operator
}

// User Preferences
export interface ProactivePreferences {
  enabled: boolean;
  maxNudgesPerDay: number; // 1-5, default 3
  quietHours: {
    enabled: boolean;
    startHour: number;
    endHour: number;
  };
  categories: {
    steps: boolean;
    weather: boolean;
    medication: boolean;
    appointments: boolean;
    wellbeing: boolean;
    hydration: boolean;
  };
  concerningPatternAlert: boolean;
  caregiverAlertThreshold: 'never' | 'high' | 'moderate' | 'low';
}

// AI Message Generation
export interface AIMessageRequest {
  checkInType: CheckInType;
  signals: Signal[];
  userContext: {
    name?: string;
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    recentMood?: string;
  };
  constraints: {
    maxLength: number;
    tone: 'warm' | 'gentle' | 'encouraging' | 'concerned';
    avoidTopics?: string[];
  };
}

export interface AIMessageResponse {
  message: string;
  suggestion?: string;
  confidence: number;
}

// Proactive Engine State
export interface ProactiveEngineState {
  isRunning: boolean;
  lastCheckTime?: string;
  todayCheckInCount: number;
  pendingCheckIns: CheckIn[];
  recentSignals: Signal[];
  lastRuleTriggers: Record<string, string>; // ruleId -> timestamp
}

// Default preferences
export const DEFAULT_PROACTIVE_PREFERENCES: ProactivePreferences = {
  enabled: true,
  maxNudgesPerDay: 3,
  quietHours: {
    enabled: true,
    startHour: 22, // 10 PM
    endHour: 7,    // 7 AM
  },
  categories: {
    steps: true,
    weather: true,
    medication: true,
    appointments: true,
    wellbeing: true,
    hydration: true,
  },
  concerningPatternAlert: true,
  caregiverAlertThreshold: 'high',
};

// Check-in type metadata
export const CHECK_IN_TYPE_INFO: Record<CheckInType, {
  displayName: string;
  icon: string;
  category: keyof ProactivePreferences['categories'];
  defaultPriority: CheckInPriority;
}> = {
  step_nudge: {
    displayName: 'Step Reminder',
    icon: '👟',
    category: 'steps',
    defaultPriority: 'low',
  },
  weather_alert: {
    displayName: 'Weather Alert',
    icon: '🌤️',
    category: 'weather',
    defaultPriority: 'medium',
  },
  medication_reminder: {
    displayName: 'Medication Reminder',
    icon: '💊',
    category: 'medication',
    defaultPriority: 'high',
  },
  appointment_reminder: {
    displayName: 'Appointment Reminder',
    icon: '📅',
    category: 'appointments',
    defaultPriority: 'high',
  },
  wellbeing_check: {
    displayName: 'Wellbeing Check',
    icon: '💚',
    category: 'wellbeing',
    defaultPriority: 'medium',
  },
  inactivity_check: {
    displayName: 'Activity Check',
    icon: '🏃',
    category: 'wellbeing',
    defaultPriority: 'medium',
  },
  hydration_reminder: {
    displayName: 'Hydration Reminder',
    icon: '💧',
    category: 'hydration',
    defaultPriority: 'low',
  },
  rest_suggestion: {
    displayName: 'Rest Suggestion',
    icon: '😴',
    category: 'wellbeing',
    defaultPriority: 'low',
  },
};

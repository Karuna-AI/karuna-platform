/**
 * Proactive Rules Engine
 * Deterministic rules for triggering check-ins
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ProactiveRule,
  RuleCondition,
  CheckIn,
  CheckInAction,
  Signal,
  StepsSignal,
  WeatherSignal,
  CalendarSignal,
  MedicationSignal,
  InactivitySignal,
  SignalType,
} from '../types/proactive';

const STORAGE_KEYS = {
  RULE_TRIGGERS: '@karuna_rule_triggers',
  DAILY_COUNT: '@karuna_daily_checkin_count',
};

// Default rules for proactive check-ins
const DEFAULT_RULES: ProactiveRule[] = [
  // Step nudge - mid-afternoon if steps are low
  {
    id: 'step_nudge_afternoon',
    name: 'Afternoon Step Nudge',
    description: 'Encourage movement if steps are low in the afternoon',
    type: 'step_nudge',
    priority: 'low',
    enabled: true,
    conditions: [
      { signalType: 'steps', operator: 'lt', value: 3000 },
    ],
    cooldownMinutes: 180, // 3 hours
    maxPerDay: 2,
    timeWindow: { startHour: 14, endHour: 17 },
    messageTemplate: "You've taken {{steps}} steps today. A short walk could feel great!",
    actions: [
      { id: 'yes', label: "I'll go for a walk", type: 'positive', icon: '👍' },
      { id: 'later', label: 'Remind me later', type: 'neutral', icon: '⏰' },
      { id: 'no', label: 'Not today', type: 'negative', icon: '🙅' },
    ],
  },

  // Weather alert - extreme conditions
  {
    id: 'weather_alert_extreme',
    name: 'Extreme Weather Alert',
    description: 'Alert when weather is extreme',
    type: 'weather_alert',
    priority: 'high',
    enabled: true,
    conditions: [
      { signalType: 'weather', operator: 'gt', value: 95 }, // Temperature > 95°F
    ],
    cooldownMinutes: 360, // 6 hours
    maxPerDay: 2,
    timeWindow: { startHour: 8, endHour: 20 },
    messageTemplate: "It's very hot today ({{temperature}}°F). Please stay hydrated and avoid the heat.",
    actions: [
      { id: 'ok', label: 'Got it', type: 'positive', icon: '✓' },
      { id: 'tips', label: 'Show me tips', type: 'action', icon: '💡' },
    ],
  },

  // Weather alert - rain
  {
    id: 'weather_alert_rain',
    name: 'Rain Alert',
    description: 'Alert when rain is expected',
    type: 'weather_alert',
    priority: 'medium',
    enabled: true,
    conditions: [
      { signalType: 'weather', operator: 'eq', value: 'rain' },
    ],
    cooldownMinutes: 360,
    maxPerDay: 1,
    timeWindow: { startHour: 7, endHour: 10 },
    messageTemplate: "It looks like rain today. Don't forget your umbrella if you go out!",
    actions: [
      { id: 'ok', label: 'Thanks!', type: 'positive', icon: '☂️' },
    ],
  },

  // Medication reminder - missed doses
  {
    id: 'medication_missed',
    name: 'Missed Medication Alert',
    description: 'Alert when medication doses are missed',
    type: 'medication_reminder',
    priority: 'high',
    enabled: true,
    conditions: [
      { signalType: 'medication', operator: 'gt', value: 0 }, // missedDoses > 0
    ],
    cooldownMinutes: 120,
    maxPerDay: 3,
    timeWindow: { startHour: 8, endHour: 21 },
    messageTemplate: "It looks like you may have missed a medication dose. Would you like me to help you catch up?",
    actions: [
      { id: 'take', label: 'Take it now', type: 'positive', icon: '💊' },
      { id: 'skip', label: 'Skip this dose', type: 'neutral', icon: '⏭' },
      { id: 'help', label: 'Call for help', type: 'call_caregiver', icon: '📞' },
    ],
  },

  // Appointment reminder - upcoming
  {
    id: 'appointment_today',
    name: 'Today Appointment Reminder',
    description: 'Remind about appointments today',
    type: 'appointment_reminder',
    priority: 'high',
    enabled: true,
    conditions: [
      { signalType: 'calendar', operator: 'gt', value: 0 }, // todayEventCount > 0
    ],
    cooldownMinutes: 240,
    maxPerDay: 2,
    timeWindow: { startHour: 7, endHour: 20 },
    messageTemplate: "You have an appointment today: {{nextEvent}}. Would you like help preparing?",
    actions: [
      { id: 'details', label: 'Show details', type: 'action', icon: '📋' },
      { id: 'remind', label: 'Remind me in 1 hour', type: 'neutral', icon: '⏰' },
      { id: 'ok', label: 'I remember', type: 'positive', icon: '✓' },
    ],
  },

  // Wellbeing check - morning
  {
    id: 'wellbeing_morning',
    name: 'Morning Wellbeing Check',
    description: 'Check in on wellbeing in the morning',
    type: 'wellbeing_check',
    priority: 'medium',
    enabled: true,
    conditions: [], // No specific conditions, time-based
    cooldownMinutes: 1440, // 24 hours
    maxPerDay: 1,
    timeWindow: { startHour: 8, endHour: 10 },
    messageTemplate: "Good morning! How are you feeling today?",
    actions: [
      { id: 'great', label: 'Feeling great!', type: 'positive', icon: '😊' },
      { id: 'ok', label: 'Doing okay', type: 'neutral', icon: '😐' },
      { id: 'not_well', label: 'Not so good', type: 'negative', icon: '😔' },
    ],
  },

  // Inactivity check - extended inactivity
  {
    id: 'inactivity_check',
    name: 'Inactivity Check',
    description: 'Check in after extended inactivity',
    type: 'inactivity_check',
    priority: 'medium',
    enabled: true,
    conditions: [
      { signalType: 'inactivity', operator: 'gte', value: 180 }, // 3+ hours inactive
    ],
    cooldownMinutes: 180,
    maxPerDay: 2,
    timeWindow: { startHour: 9, endHour: 20 },
    messageTemplate: "I noticed it's been a while since we chatted. Just checking in - is everything okay?",
    actions: [
      { id: 'fine', label: "I'm fine!", type: 'positive', icon: '👍' },
      { id: 'busy', label: 'Just busy', type: 'neutral', icon: '📱' },
      { id: 'help', label: 'Need some help', type: 'negative', icon: '🤔' },
      { id: 'call', label: 'Call my caregiver', type: 'call_caregiver', icon: '📞' },
    ],
  },

  // Hydration reminder
  {
    id: 'hydration_reminder',
    name: 'Hydration Reminder',
    description: 'Remind to drink water',
    type: 'hydration_reminder',
    priority: 'low',
    enabled: true,
    conditions: [
      { signalType: 'weather', operator: 'gt', value: 80 }, // Hot weather
    ],
    cooldownMinutes: 120,
    maxPerDay: 3,
    timeWindow: { startHour: 10, endHour: 18 },
    messageTemplate: "It's warm today! Have you had some water recently?",
    actions: [
      { id: 'yes', label: 'Yes, I have', type: 'positive', icon: '💧' },
      { id: 'will', label: "I'll get some now", type: 'neutral', icon: '🥤' },
    ],
  },
];

class ProactiveRulesEngine {
  private rules: ProactiveRule[] = DEFAULT_RULES;
  private ruleTriggers: Record<string, string> = {}; // ruleId -> last trigger timestamp
  private dailyCount: { date: string; count: number } = { date: '', count: 0 };

  async initialize(): Promise<void> {
    try {
      // Load rule triggers
      const triggersStored = await AsyncStorage.getItem(STORAGE_KEYS.RULE_TRIGGERS);
      if (triggersStored) {
        this.ruleTriggers = JSON.parse(triggersStored);
      }

      // Load daily count
      const dailyStored = await AsyncStorage.getItem(STORAGE_KEYS.DAILY_COUNT);
      if (dailyStored) {
        this.dailyCount = JSON.parse(dailyStored);
      }

      // Reset daily count if it's a new day
      const today = new Date().toISOString().split('T')[0];
      if (this.dailyCount.date !== today) {
        this.dailyCount = { date: today, count: 0 };
        await this.saveDailyCount();
      }
    } catch (error) {
      console.error('[ProactiveRules] Initialization error:', error);
    }
  }

  /**
   * Evaluate all rules against current signals
   */
  async evaluateRules(
    signals: Signal[],
    maxNudgesPerDay: number
  ): Promise<CheckIn[]> {
    const checkIns: CheckIn[] = [];
    const now = new Date();
    const currentHour = now.getHours();

    // Check daily limit
    if (this.dailyCount.count >= maxNudgesPerDay) {
      return [];
    }

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      // Check time window
      if (rule.timeWindow) {
        if (currentHour < rule.timeWindow.startHour || currentHour >= rule.timeWindow.endHour) {
          continue;
        }
      }

      // Check cooldown
      const lastTrigger = this.ruleTriggers[rule.id];
      if (lastTrigger) {
        const cooldownMs = rule.cooldownMinutes * 60 * 1000;
        if (now.getTime() - new Date(lastTrigger).getTime() < cooldownMs) {
          continue;
        }
      }

      // Check max per day for this rule
      const todayTriggers = this.getTodayTriggerCount(rule.id);
      if (todayTriggers >= rule.maxPerDay) {
        continue;
      }

      // Evaluate conditions
      if (this.evaluateConditions(rule.conditions, signals)) {
        const checkIn = this.createCheckIn(rule, signals);
        checkIns.push(checkIn);

        // Mark rule as triggered
        this.ruleTriggers[rule.id] = now.toISOString();
        await this.saveRuleTriggers();
      }
    }

    return checkIns;
  }

  /**
   * Evaluate rule conditions against signals
   */
  private evaluateConditions(conditions: RuleCondition[], signals: Signal[]): boolean {
    // If no conditions, rule is time-based only
    if (conditions.length === 0) {
      return true;
    }

    return conditions.every((condition) => {
      const signal = signals.find((s) => s.type === condition.signalType);
      if (!signal) return false;

      return this.evaluateCondition(condition, signal);
    });
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(condition: RuleCondition, signal: Signal): boolean {
    let actualValue: unknown;

    // Extract the relevant value from the signal
    switch (signal.type) {
      case 'steps':
        actualValue = (signal as StepsSignal).value.current;
        break;
      case 'weather':
        if (condition.operator === 'eq' && typeof condition.value === 'string') {
          // Check weather condition
          actualValue = (signal as WeatherSignal).value.condition;
        } else {
          // Check temperature
          actualValue = (signal as WeatherSignal).value.temperature;
        }
        break;
      case 'calendar':
        actualValue = (signal as CalendarSignal).value.todayEventCount;
        break;
      case 'medication':
        actualValue = (signal as MedicationSignal).value.missedDoses;
        break;
      case 'inactivity':
        actualValue = (signal as InactivitySignal).value.minutesSinceActivity;
        break;
      default:
        return false;
    }

    // Compare values
    switch (condition.operator) {
      case 'lt':
        return (actualValue as number) < (condition.value as number);
      case 'gt':
        return (actualValue as number) > (condition.value as number);
      case 'lte':
        return (actualValue as number) <= (condition.value as number);
      case 'gte':
        return (actualValue as number) >= (condition.value as number);
      case 'eq':
        return actualValue === condition.value;
      case 'between':
        return (
          (actualValue as number) >= (condition.value as number) &&
          (actualValue as number) <= (condition.secondaryValue as number)
        );
      case 'contains':
        return String(actualValue).includes(String(condition.value));
      default:
        return false;
    }
  }

  /**
   * Create a check-in from a rule
   */
  private createCheckIn(rule: ProactiveRule, signals: Signal[]): CheckIn {
    const message = this.interpolateMessage(rule.messageTemplate, signals);

    return {
      id: `checkin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: rule.type,
      priority: rule.priority,
      title: this.getCheckInTitle(rule.type),
      message,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour expiry
      triggerSignals: signals.map((s) => s.type),
      actions: rule.actions,
      dismissed: false,
    };
  }

  /**
   * Interpolate message template with signal values
   */
  private interpolateMessage(template: string, signals: Signal[]): string {
    let message = template;

    for (const signal of signals) {
      switch (signal.type) {
        case 'steps':
          message = message.replace('{{steps}}', String((signal as StepsSignal).value.current));
          break;
        case 'weather':
          message = message.replace('{{temperature}}', String((signal as WeatherSignal).value.temperature));
          message = message.replace('{{condition}}', (signal as WeatherSignal).value.condition);
          break;
        case 'calendar':
          const nextEvent = (signal as CalendarSignal).value.nextEvent;
          if (nextEvent) {
            message = message.replace('{{nextEvent}}', nextEvent.title);
          }
          break;
        case 'medication':
          message = message.replace('{{missedDoses}}', String((signal as MedicationSignal).value.missedDoses));
          break;
      }
    }

    return message;
  }

  /**
   * Get check-in title based on type
   */
  private getCheckInTitle(type: string): string {
    const titles: Record<string, string> = {
      step_nudge: 'Time to Move!',
      weather_alert: 'Weather Update',
      medication_reminder: 'Medication Check',
      appointment_reminder: 'Upcoming Appointment',
      wellbeing_check: "Hi there!",
      inactivity_check: 'Checking In',
      hydration_reminder: 'Stay Hydrated!',
      rest_suggestion: 'Rest Time',
    };
    return titles[type] || 'Karuna Check-In';
  }

  /**
   * Get today's trigger count for a rule
   */
  private getTodayTriggerCount(ruleId: string): number {
    const today = new Date().toISOString().split('T')[0];
    const lastTrigger = this.ruleTriggers[ruleId];

    if (lastTrigger && lastTrigger.startsWith(today)) {
      return 1; // Simplified - just check if triggered today
    }
    return 0;
  }

  /**
   * Increment daily check-in count
   */
  async incrementDailyCount(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    if (this.dailyCount.date !== today) {
      this.dailyCount = { date: today, count: 1 };
    } else {
      this.dailyCount.count++;
    }
    await this.saveDailyCount();
  }

  /**
   * Get daily check-in count
   */
  getDailyCount(): number {
    const today = new Date().toISOString().split('T')[0];
    if (this.dailyCount.date !== today) {
      return 0;
    }
    return this.dailyCount.count;
  }

  /**
   * Enable or disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
    }
  }

  /**
   * Get all rules
   */
  getRules(): ProactiveRule[] {
    return [...this.rules];
  }

  /**
   * Reset rule triggers (for testing)
   */
  async resetTriggers(): Promise<void> {
    this.ruleTriggers = {};
    this.dailyCount = { date: '', count: 0 };
    await this.saveRuleTriggers();
    await this.saveDailyCount();
  }

  private async saveRuleTriggers(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.RULE_TRIGGERS,
        JSON.stringify(this.ruleTriggers)
      );
    } catch (error) {
      console.error('[ProactiveRules] Save triggers error:', error);
    }
  }

  private async saveDailyCount(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.DAILY_COUNT,
        JSON.stringify(this.dailyCount)
      );
    } catch (error) {
      console.error('[ProactiveRules] Save daily count error:', error);
    }
  }
}

export const proactiveRulesEngine = new ProactiveRulesEngine();
export default proactiveRulesEngine;

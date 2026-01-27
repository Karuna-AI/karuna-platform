/**
 * Signals Service
 * Aggregates signals from various sources for proactive assistance
 */

import { healthDataService } from './healthData';
import { medicationService } from './medication';
import { weatherService, WeatherData } from './weather';
import { calendarService } from './calendar';
import {
  Signal,
  StepsSignal,
  WeatherSignal,
  CalendarSignal,
  MedicationSignal,
  InactivitySignal,
  SignalType,
} from '../types/proactive';

class SignalsService {
  private lastActivityTime: Date = new Date();
  private cachedSignals: Map<SignalType, Signal> = new Map();
  private signalTTL: number = 5 * 60 * 1000; // 5 minutes cache

  /**
   * Update last activity time (called on user interactions)
   */
  recordActivity(): void {
    this.lastActivityTime = new Date();
  }

  /**
   * Get all current signals
   */
  async getAllSignals(): Promise<Signal[]> {
    const signals: Signal[] = [];

    // Fetch all signals in parallel
    const [steps, weather, calendar, medication, inactivity] = await Promise.all([
      this.getStepsSignal(),
      this.getWeatherSignal(),
      this.getCalendarSignal(),
      this.getMedicationSignal(),
      this.getInactivitySignal(),
    ]);

    if (steps) signals.push(steps);
    if (weather) signals.push(weather);
    if (calendar) signals.push(calendar);
    if (medication) signals.push(medication);
    if (inactivity) signals.push(inactivity);

    return signals;
  }

  /**
   * Get a specific signal type
   */
  async getSignal(type: SignalType): Promise<Signal | null> {
    // Check cache first
    const cached = this.cachedSignals.get(type);
    if (cached) {
      const age = Date.now() - new Date(cached.timestamp).getTime();
      if (age < this.signalTTL) {
        return cached;
      }
    }

    let signal: Signal | null = null;

    switch (type) {
      case 'steps':
        signal = await this.getStepsSignal();
        break;
      case 'weather':
        signal = await this.getWeatherSignal();
        break;
      case 'calendar':
        signal = await this.getCalendarSignal();
        break;
      case 'medication':
        signal = await this.getMedicationSignal();
        break;
      case 'inactivity':
        signal = await this.getInactivitySignal();
        break;
    }

    if (signal) {
      this.cachedSignals.set(type, signal);
    }

    return signal;
  }

  /**
   * Get steps signal
   */
  async getStepsSignal(): Promise<StepsSignal | null> {
    try {
      await healthDataService.initialize();
      const comparison = healthDataService.getStepsComparison();

      let trend: StepsSignal['value']['trend'];
      if (comparison.percentage >= 100) trend = 'excellent';
      else if (comparison.percentage >= 70) trend = 'good';
      else if (comparison.percentage >= 40) trend = 'normal';
      else trend = 'low';

      return {
        type: 'steps',
        timestamp: new Date().toISOString(),
        value: {
          current: comparison.current,
          goal: comparison.goal,
          percentage: comparison.percentage,
          trend,
        },
      };
    } catch (error) {
      console.error('[Signals] Error getting steps signal:', error);
      return null;
    }
  }

  /**
   * Get weather signal
   */
  async getWeatherSignal(): Promise<WeatherSignal | null> {
    try {
      const weather = await weatherService.getCurrentWeather();
      if (!weather) return null;

      return {
        type: 'weather',
        timestamp: new Date().toISOString(),
        value: {
          temperature: weather.temperature,
          feelsLike: weather.feelsLike,
          condition: weather.condition,
          humidity: weather.humidity,
          uvIndex: weather.uvIndex,
          alert: weather.alert?.description,
        },
      };
    } catch (error) {
      console.error('[Signals] Error getting weather signal:', error);
      return null;
    }
  }

  /**
   * Get calendar signal
   */
  async getCalendarSignal(): Promise<CalendarSignal | null> {
    try {
      await calendarService.initialize();
      const calendarData = calendarService.getCalendarSignalData();

      return {
        type: 'calendar',
        timestamp: new Date().toISOString(),
        value: calendarData,
      };
    } catch (error) {
      console.error('[Signals] Error getting calendar signal:', error);
      return null;
    }
  }

  /**
   * Get medication signal
   */
  async getMedicationSignal(): Promise<MedicationSignal | null> {
    try {
      await medicationService.initialize();

      const schedule = medicationService.getTodaySchedule();
      const nextDose = medicationService.getNextDose();
      const adherence = medicationService.getAdherence(undefined, 'week');

      const pendingDoses = schedule.filter(
        (s) => !s.dose || s.dose.status === 'pending'
      ).length;
      const missedDoses = schedule.filter(
        (s) => s.dose?.status === 'missed'
      ).length;

      const overallAdherence = adherence.length > 0
        ? Math.round(adherence.reduce((sum, a) => sum + a.adherenceRate, 0) / adherence.length)
        : 100;

      return {
        type: 'medication',
        timestamp: new Date().toISOString(),
        value: {
          pendingDoses,
          missedDoses,
          nextDose: nextDose
            ? {
                name: nextDose.medication.name,
                time: nextDose.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              }
            : undefined,
          adherenceRate: overallAdherence,
        },
      };
    } catch (error) {
      console.error('[Signals] Error getting medication signal:', error);
      return null;
    }
  }

  /**
   * Get inactivity signal
   */
  async getInactivitySignal(): Promise<InactivitySignal | null> {
    const minutesSinceActivity = Math.floor(
      (Date.now() - this.lastActivityTime.getTime()) / 60000
    );

    let concernLevel: InactivitySignal['value']['concernLevel'];
    if (minutesSinceActivity < 60) concernLevel = 'normal';
    else if (minutesSinceActivity < 120) concernLevel = 'mild';
    else if (minutesSinceActivity < 240) concernLevel = 'moderate';
    else concernLevel = 'high';

    return {
      type: 'inactivity',
      timestamp: new Date().toISOString(),
      value: {
        minutesSinceActivity,
        lastActivityType: 'app_interaction',
        concernLevel,
      },
    };
  }

  /**
   * Check if any signals indicate a concerning pattern
   */
  async checkConcerningPatterns(): Promise<{
    isConcerning: boolean;
    reasons: string[];
    suggestCaregiverCall: boolean;
  }> {
    const signals = await this.getAllSignals();
    const reasons: string[] = [];
    let concernLevel = 0;

    for (const signal of signals) {
      switch (signal.type) {
        case 'inactivity': {
          const inactivity = signal as InactivitySignal;
          if (inactivity.value.concernLevel === 'high') {
            reasons.push('Extended period of inactivity');
            concernLevel += 3;
          } else if (inactivity.value.concernLevel === 'moderate') {
            reasons.push('Long period without activity');
            concernLevel += 1;
          }
          break;
        }

        case 'medication': {
          const medication = signal as MedicationSignal;
          if (medication.value.missedDoses >= 2) {
            reasons.push('Multiple missed medication doses');
            concernLevel += 2;
          }
          if (medication.value.adherenceRate < 50) {
            reasons.push('Low medication adherence');
            concernLevel += 1;
          }
          break;
        }

        case 'steps': {
          const steps = signal as StepsSignal;
          // Only concerning if it's late in the day and steps are very low
          const hour = new Date().getHours();
          if (hour >= 14 && steps.value.percentage < 20) {
            reasons.push('Very low activity today');
            concernLevel += 1;
          }
          break;
        }
      }
    }

    return {
      isConcerning: concernLevel >= 2,
      reasons,
      suggestCaregiverCall: concernLevel >= 4,
    };
  }

  /**
   * Get time of day context
   */
  getTimeOfDayContext(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  /**
   * Clear cached signals
   */
  clearCache(): void {
    this.cachedSignals.clear();
  }
}

export const signalsService = new SignalsService();
export default signalsService;

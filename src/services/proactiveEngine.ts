/**
 * Proactive Engine
 * Main orchestrator for the "Karuna checks in" feature
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { signalsService } from './signals';
import { proactiveRulesEngine } from './proactiveRules';
import { aiMessageCrafterService } from './aiMessageCrafter';
import { auditLogService } from './auditLog';
import {
  CheckIn,
  CheckInResponse,
  ProactivePreferences,
  ProactiveEngineState,
  DEFAULT_PROACTIVE_PREFERENCES,
  CHECK_IN_TYPE_INFO,
} from '../types/proactive';

const STORAGE_KEYS = {
  PREFERENCES: '@karuna_proactive_preferences',
  PENDING_CHECKINS: '@karuna_pending_checkins',
  ENGINE_STATE: '@karuna_proactive_engine_state',
};

const BACKGROUND_FETCH_TASK = 'KARUNA_PROACTIVE_CHECK';

// Configure notification handler (native only)
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

class ProactiveEngineService {
  private preferences: ProactivePreferences = DEFAULT_PROACTIVE_PREFERENCES;
  private pendingCheckIns: CheckIn[] = [];
  private state: ProactiveEngineState;
  private isInitialized: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private listeners: Set<(checkIns: CheckIn[]) => void> = new Set();

  constructor() {
    this.state = {
      isRunning: false,
      todayCheckInCount: 0,
      pendingCheckIns: [],
      recentSignals: [],
      lastRuleTriggers: {},
    };
  }

  /**
   * Initialize the proactive engine
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load preferences
      const prefsStored = await AsyncStorage.getItem(STORAGE_KEYS.PREFERENCES);
      if (prefsStored) {
        this.preferences = { ...DEFAULT_PROACTIVE_PREFERENCES, ...JSON.parse(prefsStored) };
      }

      // Load pending check-ins
      const checkInsStored = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_CHECKINS);
      if (checkInsStored) {
        this.pendingCheckIns = JSON.parse(checkInsStored);
        // Filter out expired check-ins
        this.pendingCheckIns = this.pendingCheckIns.filter(
          (c) => !c.expiresAt || new Date(c.expiresAt) > new Date()
        );
      }

      // Load engine state
      const stateStored = await AsyncStorage.getItem(STORAGE_KEYS.ENGINE_STATE);
      if (stateStored) {
        this.state = JSON.parse(stateStored);
      }

      // Initialize rules engine
      await proactiveRulesEngine.initialize();

      // Request notification permissions
      await this.requestNotificationPermissions();

      // Register background task
      await this.registerBackgroundTask();

      // Set up app state listener
      AppState.addEventListener('change', this.handleAppStateChange);

      this.isInitialized = true;
      console.debug('[ProactiveEngine] Initialized');

      // Start if enabled
      if (this.preferences.enabled) {
        await this.start();
      }
    } catch (error) {
      console.error('[ProactiveEngine] Initialization error:', error);
      this.isInitialized = true;
    }
  }

  /**
   * Start the proactive engine
   */
  async start(): Promise<void> {
    if (this.state.isRunning) return;

    this.state.isRunning = true;
    await this.saveState();

    // Run initial check
    await this.runCheck();

    // Set up periodic check (every 15 minutes when app is active)
    this.checkInterval = setInterval(() => {
      this.runCheck();
    }, 15 * 60 * 1000);

    console.debug('[ProactiveEngine] Started');
  }

  /**
   * Stop the proactive engine
   */
  async stop(): Promise<void> {
    this.state.isRunning = false;
    await this.saveState();

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    console.debug('[ProactiveEngine] Stopped');
  }

  /**
   * Run a proactive check
   */
  async runCheck(): Promise<CheckIn[]> {
    if (!this.preferences.enabled) return [];

    // Check quiet hours
    if (this.isQuietHours()) {
      return [];
    }

    try {
      // Collect signals
      const signals = await signalsService.getAllSignals();
      this.state.recentSignals = signals;

      // Evaluate rules
      const newCheckIns = await proactiveRulesEngine.evaluateRules(
        signals,
        this.preferences.maxNudgesPerDay
      );

      // Filter by enabled categories
      const filteredCheckIns = newCheckIns.filter((checkIn) => {
        const typeInfo = CHECK_IN_TYPE_INFO[checkIn.type];
        return typeInfo && this.preferences.categories[typeInfo.category];
      });

      // Enhance messages with AI (optional, based on preferences)
      for (const checkIn of filteredCheckIns) {
        try {
          const enhanced = await aiMessageCrafterService.craftMessage({
            checkInType: checkIn.type,
            signals,
            userContext: {
              timeOfDay: signalsService.getTimeOfDayContext(),
            },
            constraints: {
              maxLength: 150,
              tone: 'warm',
            },
          });

          if (enhanced.confidence > 0.8) {
            checkIn.message = enhanced.message;
          }
        } catch (error) {
          // Keep original message if AI enhancement fails
          console.error('[ProactiveEngine] AI enhancement failed:', error);
        }
      }

      // Add to pending check-ins
      for (const checkIn of filteredCheckIns) {
        this.pendingCheckIns.push(checkIn);
        await proactiveRulesEngine.incrementDailyCount();

        // Send notification
        await this.sendCheckInNotification(checkIn);

        // Log the check-in
        await auditLogService.log({
          action: 'proactive_checkin',
          category: 'system',
          description: `Proactive check-in: ${checkIn.type}`,
          metadata: { checkInId: checkIn.id, type: checkIn.type },
        });
      }

      await this.savePendingCheckIns();
      this.notifyListeners();

      this.state.lastCheckTime = new Date().toISOString();
      this.state.todayCheckInCount = proactiveRulesEngine.getDailyCount();
      await this.saveState();

      // Check for concerning patterns
      const concernCheck = await signalsService.checkConcerningPatterns();
      if (concernCheck.isConcerning && this.preferences.concerningPatternAlert) {
        await this.handleConcerningPattern(concernCheck);
      }

      return filteredCheckIns;
    } catch (error) {
      console.error('[ProactiveEngine] Check error:', error);
      return [];
    }
  }

  /**
   * Handle concerning pattern detection
   */
  private async handleConcerningPattern(pattern: {
    isConcerning: boolean;
    reasons: string[];
    suggestCaregiverCall: boolean;
  }): Promise<void> {
    const checkIn: CheckIn = {
      id: `concern_${Date.now()}`,
      type: 'inactivity_check',
      priority: 'urgent',
      title: 'Checking In',
      message: "I noticed a few things that made me want to check on you. Is everything okay?",
      suggestion: pattern.suggestCaregiverCall
        ? 'Would you like me to reach out to your caregiver?'
        : undefined,
      createdAt: new Date().toISOString(),
      triggerSignals: [],
      actions: [
        { id: 'fine', label: "I'm doing fine", type: 'positive', icon: '👍' },
        { id: 'help', label: 'I need some help', type: 'negative', icon: '🆘' },
        { id: 'call', label: 'Call my caregiver', type: 'call_caregiver', icon: '📞' },
      ],
      dismissed: false,
    };

    this.pendingCheckIns.push(checkIn);
    await this.savePendingCheckIns();
    await this.sendCheckInNotification(checkIn);
    this.notifyListeners();
  }

  /**
   * Send a notification for a check-in
   */
  private async sendCheckInNotification(checkIn: CheckIn): Promise<void> {
    if (Platform.OS === 'web') return;
    const typeInfo = CHECK_IN_TYPE_INFO[checkIn.type];

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${typeInfo?.icon || '💬'} ${checkIn.title}`,
          body: checkIn.message,
          data: { checkInId: checkIn.id, type: 'proactive_checkin' },
          sound: true,
        },
        trigger: null, // Send immediately
      });
    } catch (error) {
      console.error('[ProactiveEngine] Notification error:', error);
    }
  }

  /**
   * Handle user response to a check-in
   */
  async respondToCheckIn(
    checkInId: string,
    actionId: string
  ): Promise<{ success: boolean; followUp?: string }> {
    const checkIn = this.pendingCheckIns.find((c) => c.id === checkInId);
    if (!checkIn) {
      return { success: false };
    }

    const action = checkIn.actions.find((a) => a.id === actionId);
    if (!action) {
      return { success: false };
    }

    // Record the response
    checkIn.response = {
      actionId,
      timestamp: new Date().toISOString(),
    };
    checkIn.dismissed = true;
    checkIn.dismissedAt = new Date().toISOString();

    await this.savePendingCheckIns();
    this.notifyListeners();

    // Log the response
    await auditLogService.log({
      action: 'proactive_checkin_response',
      category: 'system',
      description: `Check-in response: ${action.label}`,
      metadata: { checkInId, actionId, type: checkIn.type },
    });

    // Generate follow-up message
    const responseType = action.type === 'positive' ? 'positive' :
                        action.type === 'negative' ? 'negative' : 'neutral';

    const followUp = await aiMessageCrafterService.craftFollowUp(
      checkIn.type,
      responseType,
      { timeOfDay: signalsService.getTimeOfDayContext() }
    );

    // Handle special actions
    if (action.type === 'call_caregiver') {
      // This would trigger caregiver notification
      await this.notifyCaregiver(checkIn, action);
    }

    return { success: true, followUp };
  }

  /**
   * Dismiss a check-in without responding
   */
  async dismissCheckIn(checkInId: string): Promise<void> {
    const checkIn = this.pendingCheckIns.find((c) => c.id === checkInId);
    if (checkIn) {
      checkIn.dismissed = true;
      checkIn.dismissedAt = new Date().toISOString();
      await this.savePendingCheckIns();
      this.notifyListeners();
    }
  }

  /**
   * Snooze a check-in
   */
  async snoozeCheckIn(checkInId: string, minutes: number = 30): Promise<void> {
    const checkIn = this.pendingCheckIns.find((c) => c.id === checkInId);
    if (checkIn) {
      // Update expiry time
      checkIn.expiresAt = new Date(Date.now() + minutes * 60 * 1000 + 60 * 60 * 1000).toISOString();

      // Schedule a reminder notification (native only)
      if (Platform.OS !== 'web') {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: CHECK_IN_TYPE_INFO[checkIn.type]?.icon + ' Reminder',
            body: checkIn.message,
            data: { checkInId: checkIn.id, type: 'proactive_checkin' },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: minutes * 60 },
        });
      }

      await this.savePendingCheckIns();
      this.notifyListeners();
    }
  }

  /**
   * Notify caregiver about a concerning check-in
   */
  private async notifyCaregiver(checkIn: CheckIn, action: any): Promise<void> {
    // This would integrate with the care circle service
    // For now, just log it
    await auditLogService.log({
      action: 'caregiver_alert_requested',
      category: 'care_circle',
      description: `User requested caregiver contact from check-in`,
      metadata: { checkInId: checkIn.id, type: checkIn.type },
    });
  }

  /**
   * Get pending check-ins
   */
  getPendingCheckIns(): CheckIn[] {
    return this.pendingCheckIns.filter(
      (c) => !c.dismissed && (!c.expiresAt || new Date(c.expiresAt) > new Date())
    );
  }

  /**
   * Get preferences
   */
  getPreferences(): ProactivePreferences {
    return { ...this.preferences };
  }

  /**
   * Update preferences
   */
  async updatePreferences(updates: Partial<ProactivePreferences>): Promise<void> {
    this.preferences = { ...this.preferences, ...updates };
    await AsyncStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(this.preferences));

    // Start or stop based on enabled state
    if (this.preferences.enabled && !this.state.isRunning) {
      await this.start();
    } else if (!this.preferences.enabled && this.state.isRunning) {
      await this.stop();
    }
  }

  /**
   * Check if currently in quiet hours
   */
  private isQuietHours(): boolean {
    if (!this.preferences.quietHours.enabled) return false;

    const hour = new Date().getHours();
    const { startHour, endHour } = this.preferences.quietHours;

    if (startHour > endHour) {
      // Spans midnight (e.g., 22:00 to 07:00)
      return hour >= startHour || hour < endHour;
    } else {
      return hour >= startHour && hour < endHour;
    }
  }

  /**
   * Request notification permissions
   */
  private async requestNotificationPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('[ProactiveEngine] Notification permission error:', error);
      return false;
    }
  }

  /**
   * Register background fetch task
   */
  private async registerBackgroundTask(): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      // Define the task
      TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
        try {
          await this.runCheck();
          return BackgroundFetch.BackgroundFetchResult.NewData;
        } catch (error) {
          console.error('[ProactiveEngine] Background task error:', error);
          return BackgroundFetch.BackgroundFetchResult.Failed;
        }
      });

      // Register the task
      await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
        minimumInterval: 15 * 60, // 15 minutes
        stopOnTerminate: false,
        startOnBoot: true,
      });

      console.debug('[ProactiveEngine] Background task registered');
    } catch (error) {
      console.error('[ProactiveEngine] Background task registration error:', error);
    }
  }

  /**
   * Handle app state changes
   */
  private handleAppStateChange = async (state: AppStateStatus): Promise<void> => {
    if (state === 'active' && this.preferences.enabled) {
      // Record activity
      signalsService.recordActivity();

      // Run a check when app becomes active
      await this.runCheck();
    }
  };

  /**
   * Add a listener for check-in updates
   */
  addListener(callback: (checkIns: CheckIn[]) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    const pending = this.getPendingCheckIns();
    this.listeners.forEach((callback) => callback(pending));
  }

  /**
   * Get engine state
   */
  getState(): ProactiveEngineState {
    return { ...this.state, pendingCheckIns: this.getPendingCheckIns() };
  }

  private async savePendingCheckIns(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.PENDING_CHECKINS,
        JSON.stringify(this.pendingCheckIns)
      );
    } catch (error) {
      console.error('[ProactiveEngine] Save check-ins error:', error);
    }
  }

  private async saveState(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.ENGINE_STATE, JSON.stringify(this.state));
    } catch (error) {
      console.error('[ProactiveEngine] Save state error:', error);
    }
  }
}

export const proactiveEngineService = new ProactiveEngineService();
export default proactiveEngineService;

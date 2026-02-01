import { Platform } from 'react-native';

/**
 * Telemetry events we track
 * These are important for understanding real-world reliability
 */
export type TelemetryEvent =
  | 'stt_failure'
  | 'tts_failure'
  | 'permission_denied'
  | 'app_error'
  | 'action_cancelled'
  | 'emergency_call'
  | 'chat_error'
  | 'network_error'
  | 'call_executed'
  // Onboarding events
  | 'onboarding_started'
  | 'onboarding_role_selected'
  | 'onboarding_language_selected'
  | 'onboarding_voice_tested'
  | 'onboarding_permission_mic_granted'
  | 'onboarding_permission_mic_denied'
  | 'onboarding_permission_mic_skipped'
  | 'onboarding_permission_notify_granted'
  | 'onboarding_permission_notify_denied'
  | 'onboarding_permission_notify_skipped'
  | 'onboarding_security_setup'
  | 'onboarding_security_skipped'
  | 'onboarding_quick_setup_saved'
  | 'onboarding_caregiver_invite_shared'
  | 'onboarding_caregiver_invite_skipped'
  | 'onboarding_tutorial_viewed'
  | 'onboarding_completed'
  | 'onboarding_skipped';

export interface TelemetryData {
  errorType?: string;
  errorCode?: string;
  errorMessage?: string;
  platform?: string;
  appVersion?: string;
  [key: string]: string | number | boolean | undefined;
}

// Configuration
const TELEMETRY_ENDPOINT = process.env.TELEMETRY_ENDPOINT || '/api/telemetry';
const APP_VERSION = '1.0.0';
const BATCH_SIZE = 10;
const FLUSH_INTERVAL = 30000; // 30 seconds

/**
 * Telemetry service for tracking important app metrics
 *
 * Privacy-focused: Only collects error types and codes, no PII
 */
class TelemetryService {
  private queue: Array<{ event: TelemetryEvent; data: TelemetryData; timestamp: number }> = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private enabled = true;
  private gatewayUrl: string | null = null;

  /**
   * Initialize the telemetry service
   */
  initialize(gatewayUrl?: string) {
    this.gatewayUrl = gatewayUrl || null;

    // Start periodic flush
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL);

    console.debug('Telemetry service initialized');
  }

  /**
   * Enable or disable telemetry
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.queue = [];
    }
  }

  /**
   * Track an event
   */
  track(event: TelemetryEvent, data: Partial<TelemetryData> = {}) {
    if (!this.enabled) return;

    const enrichedData: TelemetryData = {
      ...data,
      platform: Platform.OS,
      appVersion: APP_VERSION,
    };

    // Remove any potential PII
    delete enrichedData.errorMessage; // Could contain user input

    this.queue.push({
      event,
      data: enrichedData,
      timestamp: Date.now(),
    });

    // Log locally for debugging
    console.debug(`[Telemetry] ${event}`, enrichedData);

    // Auto-flush if queue is full
    if (this.queue.length >= BATCH_SIZE) {
      this.flush();
    }
  }

  /**
   * Track STT failure
   */
  trackSTTFailure(errorType: string, errorCode?: string) {
    this.track('stt_failure', { errorType, errorCode });
  }

  /**
   * Track TTS failure
   */
  trackTTSFailure(errorType: string, errorCode?: string) {
    this.track('tts_failure', { errorType, errorCode });
  }

  /**
   * Track permission denied
   */
  trackPermissionDenied(permissionType: string, wasBlocked: boolean) {
    this.track('permission_denied', {
      errorType: permissionType,
      errorCode: wasBlocked ? 'blocked' : 'denied',
    });
  }

  /**
   * Track chat/API error
   */
  trackChatError(errorType: string, statusCode?: number) {
    this.track('chat_error', {
      errorType,
      errorCode: statusCode?.toString(),
    });
  }

  /**
   * Track network error
   */
  trackNetworkError(errorType: string) {
    this.track('network_error', { errorType });
  }

  /**
   * Track app error/crash
   */
  trackAppError(errorType: string, componentName?: string) {
    this.track('app_error', {
      errorType,
      errorCode: componentName,
    });
  }

  /**
   * Track when user cancels an action
   */
  trackActionCancelled(actionType: string) {
    this.track('action_cancelled', { errorType: actionType });
  }

  /**
   * Track emergency call (important safety metric)
   */
  trackEmergencyCall(completed: boolean) {
    this.track('emergency_call', {
      errorType: completed ? 'completed' : 'cancelled',
    });
  }

  /**
   * Flush queued events to the server
   */
  async flush() {
    if (this.queue.length === 0) return;

    const events = [...this.queue];
    this.queue = [];

    // If no gateway URL or on web (CORS issues), just log locally
    if (!this.gatewayUrl || Platform.OS === 'web') {
      console.debug('[Telemetry] No gateway URL or web platform - events logged locally only');
      return;
    }

    try {
      // Send each event (in production, batch them)
      for (const { event, data } of events) {
        await fetch(`${this.gatewayUrl}${TELEMETRY_ENDPOINT}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ event, data }),
        });
      }
    } catch (error) {
      // Silently fail - telemetry should never break the app
      console.warn('[Telemetry] Failed to send events:', error);
      // Re-queue failed events (up to a limit)
      if (this.queue.length < BATCH_SIZE * 2) {
        this.queue.push(...events);
      }
    }
  }

  /**
   * Get current metrics summary (for debugging)
   */
  getLocalMetrics(): Record<TelemetryEvent, number> {
    const metrics: Record<string, number> = {};

    for (const { event } of this.queue) {
      metrics[event] = (metrics[event] || 0) + 1;
    }

    return metrics as Record<TelemetryEvent, number>;
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}

export const telemetryService = new TelemetryService();
export default telemetryService;

import { Platform, AppState, AppStateStatus } from 'react-native';

type AudioSessionCallback = () => void;

interface AudioSessionCallbacks {
  onInterruptionBegan?: AudioSessionCallback;
  onInterruptionEnded?: AudioSessionCallback;
  onAppBackground?: AudioSessionCallback;
  onAppForeground?: AudioSessionCallback;
}

/**
 * AudioSessionService manages audio session state and handles interruptions
 * (phone calls, Siri, alarms, other apps playing audio)
 */
class AudioSessionService {
  private callbacks: AudioSessionCallbacks = {};
  private appStateSubscription: any = null;
  private currentAppState: AppStateStatus = 'active';
  private isRecording: boolean = false;
  private isSpeaking: boolean = false;

  /**
   * Initialize the audio session manager
   */
  initialize(callbacks: AudioSessionCallbacks): void {
    this.callbacks = callbacks;
    this.setupAppStateListener();
  }

  /**
   * Clean up listeners
   */
  cleanup(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  /**
   * Set up app state change listener (background/foreground)
   */
  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange.bind(this)
    );
  }

  /**
   * Handle app state changes (foreground/background)
   */
  private handleAppStateChange(nextAppState: AppStateStatus): void {
    const wasActive = this.currentAppState === 'active';
    const isNowActive = nextAppState === 'active';

    if (wasActive && !isNowActive) {
      // App went to background
      console.log('[AudioSession] App moved to background');

      // If recording, we should stop safely
      if (this.isRecording) {
        this.callbacks.onInterruptionBegan?.();
      }

      this.callbacks.onAppBackground?.();
    } else if (!wasActive && isNowActive) {
      // App came to foreground
      console.log('[AudioSession] App moved to foreground');
      this.callbacks.onAppForeground?.();
    }

    this.currentAppState = nextAppState;
  }

  /**
   * Notify that recording has started
   */
  setRecordingActive(active: boolean): void {
    this.isRecording = active;
  }

  /**
   * Notify that TTS is speaking
   */
  setSpeakingActive(active: boolean): void {
    this.isSpeaking = active;
  }

  /**
   * Handle audio interruption (phone call, Siri, etc.)
   * This should be called from native code via event emitter
   */
  handleInterruptionBegan(): void {
    console.log('[AudioSession] Audio interruption began');

    if (this.isRecording) {
      this.callbacks.onInterruptionBegan?.();
    }
  }

  /**
   * Handle audio interruption ended
   */
  handleInterruptionEnded(): void {
    console.log('[AudioSession] Audio interruption ended');
    this.callbacks.onInterruptionEnded?.();
  }

  /**
   * Check if app is currently in foreground
   */
  isAppActive(): boolean {
    return this.currentAppState === 'active';
  }

  /**
   * Get current recording state
   */
  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Get current speaking state
   */
  isCurrentlySpeaking(): boolean {
    return this.isSpeaking;
  }
}

export const audioSessionService = new AudioSessionService();
export default audioSessionService;

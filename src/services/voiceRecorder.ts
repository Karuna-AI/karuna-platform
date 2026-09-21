import { permissionsService, PermissionResult } from './permissions';
import { AudioModule, RecordingPresets, setAudioModeAsync } from 'expo-audio';

// Use expo-audio (not expo-av) to avoid the iOS 26 AVAudioSession crash —
// expo-av's native module triggers AVInputDeviceDiscoverySession.initialize on
// import which SIGABRTs during launch. expo-audio defers all native init until
// you actually construct/play, so a static import is safe.
//
// IMPORTANT: the recorder class is at `AudioModule.AudioRecorder` — NOT a
// top-level named export. An earlier version reached for the nonexistent
// `audioModule.AudioRecorder` (undefined), and `new undefined(preset)` plus
// expo-audio's top-level prototype monkey-patch produced the user-facing
// "Cannot read property 'prototype' of undefined" crash on first record.
const AudioRecorderClass: any = (AudioModule as any)?.AudioRecorder;
const RecordingPresetsRef: any = RecordingPresets;

async function loadExpoAudio() {
  // Kept for call-site compatibility; module is now loaded statically.
  return {
    AudioRecorder: AudioRecorderClass,
    RecordingPresets: RecordingPresetsRef,
    setAudioModeAsync,
  };
}

export type RecordingError =
  | 'permission_denied'
  | 'permission_blocked'
  | 'recording_failed'
  | 'too_short'
  | 'unknown';

export type AutoStopReason = 'silence' | 'max_duration';

export interface RecordingResult {
  path: string;
  duration: number;
  /** True when the recorder stopped itself (silence or max duration). */
  autoStopped: boolean;
  reason?: AutoStopReason;
}

/** #29: hard cap on recording length — 60 seconds. */
export const MAX_RECORDING_MS = 60_000;
/** #29: ~3 seconds of silence ends the recording. */
export const SILENCE_DETECTION_MS = 3_000;
/** Metering floor (dB) treated as silence. */
export const SILENCE_DB_THRESHOLD = -50;
/** Don't auto-stop on silence before the user has had a moment to start. */
const MIN_SPEAK_MS = 2_000;

export class RecordingException extends Error {
  type: RecordingError;
  canRetry: boolean;

  constructor(type: RecordingError, message: string, canRetry: boolean = true) {
    super(message);
    this.type = type;
    this.canRetry = canRetry;
    this.name = 'RecordingException';
  }
}

class VoiceRecorder {
  private recorder: any = null;
  private recordingDuration: number = 0;
  private lastPermissionResult: PermissionResult | null = null;
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  // Silence / max-duration auto-stop bookkeeping
  private autoStopFired: boolean = false;
  private autoStopReason: AutoStopReason | undefined = undefined;
  private silenceStart: number = 0;

  constructor() {
    // Audio module loaded lazily on first use
  }

  async initialize(): Promise<void> {
    try {
      const mod = await loadExpoAudio();
      if (mod.setAudioModeAsync) {
        await mod.setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
        });
      }
    } catch (error) {
      console.error('[VoiceRecorder] Error configuring audio mode:', error);
    }
  }

  async checkPermissions(): Promise<PermissionResult> {
    return permissionsService.checkMicrophonePermission();
  }

  async requestPermissions(): Promise<PermissionResult> {
    const result = await permissionsService.requestAllPermissions();
    this.lastPermissionResult = result;
    return result;
  }

  getLastPermissionResult(): PermissionResult | null {
    return this.lastPermissionResult;
  }

  async openSettings(): Promise<void> {
    return permissionsService.openSettings();
  }

  async startRecording(
    onProgress?: (duration: number) => void,
    onAutoStop?: (reason: AutoStopReason) => void
  ): Promise<string> {
    // #33: check first, request only when not already decided.
    let permissionResult = await this.checkPermissions();
    if (permissionResult.status !== 'granted' && permissionResult.status !== 'blocked') {
      permissionResult = await permissionsService.requestMicrophonePermission();
    }
    this.lastPermissionResult = permissionResult;

    if (permissionResult.status !== 'granted') {
      if (permissionResult.status === 'blocked') {
        throw new RecordingException(
          'permission_blocked',
          'Microphone access is blocked. Please enable it in Settings.',
          false
        );
      }
      throw new RecordingException(
        'permission_denied',
        'Microphone permission is needed to record your voice.',
        permissionResult.canAskAgain
      );
    }

    await this.initialize();

    try {
      await loadExpoAudio();

      // Create recorder with high quality preset + metering for silence detection
      const basePreset = RecordingPresetsRef?.HIGH_QUALITY || {
        extension: '.m4a',
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 128000,
      };
      const preset = { ...basePreset, isMeteringEnabled: true };

      this.recorder = new AudioRecorderClass(preset);
      await this.recorder.prepareToRecordAsync();
      this.recorder.record();
      this.recordingDuration = 0;
      this.autoStopFired = false;
      this.autoStopReason = undefined;
      this.silenceStart = 0;

      // Poll for duration updates + silence / max-duration auto-stop (#29)
      this.progressInterval = setInterval(() => {
        try {
          const status = this.recorder?.getStatus?.();
          if (!status) return;
          if (status.durationMillis !== undefined) {
            this.recordingDuration = status.durationMillis;
            onProgress?.(status.durationMillis);
          }

          // #29: cap recordings at 60 seconds
          if (this.recordingDuration >= MAX_RECORDING_MS && !this.autoStopFired) {
            this.autoStopFired = true;
            this.autoStopReason = 'max_duration';
            onAutoStop?.('max_duration');
            return;
          }

          // #29: ~3s of silence ends the recording with spoken/visual feedback
          // (the caller speaks the prompt + shows the message).
          const metering: number | undefined =
            typeof status.metering === 'number' ? status.metering : undefined;
          const now = Date.now();
          if (metering === undefined) {
            // Metering unavailable on this platform — skip silence detection
            // rather than risk a false positive.
            this.silenceStart = 0;
          } else if (metering < SILENCE_DB_THRESHOLD) {
            if (this.silenceStart === 0) {
              this.silenceStart = now;
            } else if (
              now - this.silenceStart >= SILENCE_DETECTION_MS &&
              this.recordingDuration >= MIN_SPEAK_MS &&
              !this.autoStopFired
            ) {
              this.autoStopFired = true;
              this.autoStopReason = 'silence';
              onAutoStop?.('silence');
            }
          } else {
            this.silenceStart = 0;
          }
        } catch {
          /* intentionally empty */
        }
      }, 250);

      return this.recorder.uri || '';
    } catch (error) {
      console.error('[VoiceRecorder] Start recording error:', error);
      if (error instanceof RecordingException) {
        throw error;
      }
      throw new RecordingException(
        'recording_failed',
        'Could not start recording. Please try again.',
        true
      );
    }
  }

  async stopRecording(): Promise<RecordingResult> {
    try {
      if (!this.recorder) {
        throw new RecordingException(
          'recording_failed',
          'No active recording to stop.',
          true
        );
      }

      // Clear progress polling
      if (this.progressInterval) {
        clearInterval(this.progressInterval);
        this.progressInterval = null;
      }

      // Get status before stopping
      const status = this.recorder.getStatus?.() || {};
      const duration = status.durationMillis || this.recordingDuration;
      const autoStopped = this.autoStopFired;

      await this.recorder.stop();

      const uri = this.recorder.uri;
      const reason = this.autoStopReason;
      this.recorder = null;
      this.recordingDuration = 0;
      this.autoStopFired = false;
      this.autoStopReason = undefined;
      this.silenceStart = 0;

      if (duration < 500) {
        // Lazy translation lookup avoids a hard provider dependency in tests.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { getCurrentTranslations } = require('../i18n/translations');
        throw new RecordingException(
          'too_short',
          getCurrentTranslations().chat.recordingTooShort,
          true
        );
      }

      return { path: uri || '', duration, autoStopped, reason };
    } catch (error) {
      this.recorder = null;
      this.recordingDuration = 0;
      this.autoStopFired = false;
      this.autoStopReason = undefined;
      this.silenceStart = 0;

      if (error instanceof RecordingException) {
        throw error;
      }

      console.error('[VoiceRecorder] Stop recording error:', error);
      throw new RecordingException(
        'recording_failed',
        'Could not save the recording. Please try again.',
        true
      );
    }
  }

  async cancelRecording(): Promise<void> {
    try {
      if (this.progressInterval) {
        clearInterval(this.progressInterval);
        this.progressInterval = null;
      }
      if (this.recorder) {
        await this.recorder.stop();
        this.recorder = null;
        this.recordingDuration = 0;
        this.autoStopFired = false;
        this.autoStopReason = undefined;
        this.silenceStart = 0;
      }
    } catch (error) {
      console.error('[VoiceRecorder] Cancel recording error:', error);
      this.recorder = null;
      this.recordingDuration = 0;
    }
  }

  getCurrentDuration(): number {
    return this.recordingDuration;
  }

  isRecording(): boolean {
    return this.recorder !== null;
  }
}

export const voiceRecorder = new VoiceRecorder();

export default voiceRecorder;

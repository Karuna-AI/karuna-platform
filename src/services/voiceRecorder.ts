import { Platform } from 'react-native';
import { permissionsService, PermissionResult } from './permissions';

// Use expo-audio (not expo-av) to avoid iOS 26 AVAudioSession crash
// expo-av's native module triggers AVInputDeviceDiscoverySession.initialize
// during app launch which causes SIGABRT on iOS 26+
let audioModule: any = null;
let AudioRecorderClass: any = null;
let RecordingPresetsRef: any = null;

async function loadExpoAudio() {
  if (!audioModule) {
    audioModule = await import('expo-audio');
    AudioRecorderClass = audioModule.AudioRecorder;
    RecordingPresetsRef = audioModule.RecordingPresets;
  }
  return audioModule;
}

export type RecordingError =
  | 'permission_denied'
  | 'permission_blocked'
  | 'recording_failed'
  | 'too_short'
  | 'unknown';

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
    onProgress?: (duration: number) => void
  ): Promise<string> {
    const permissionResult = await this.requestPermissions();

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

      // Create recorder with high quality preset
      const preset = RecordingPresetsRef?.HIGH_QUALITY || {
        extension: '.m4a',
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 128000,
      };

      this.recorder = new AudioRecorderClass(preset);
      await this.recorder.prepareToRecordAsync();
      this.recorder.record();
      this.recordingDuration = 0;

      // Poll for duration updates
      if (onProgress) {
        this.progressInterval = setInterval(() => {
          try {
            const status = this.recorder?.getStatus?.();
            if (status?.durationMillis !== undefined) {
              this.recordingDuration = status.durationMillis;
              onProgress(status.durationMillis);
            }
          } catch {
            /* intentionally empty */
          }
        }, 100);
      }

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

  async stopRecording(): Promise<{ path: string; duration: number }> {
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

      await this.recorder.stop();

      const uri = this.recorder.uri;
      this.recorder = null;
      this.recordingDuration = 0;

      if (duration < 500) {
        throw new RecordingException(
          'too_short',
          'Recording too short. Please hold the button and speak.',
          true
        );
      }

      return { path: uri || '', duration };
    } catch (error) {
      this.recorder = null;
      this.recordingDuration = 0;

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

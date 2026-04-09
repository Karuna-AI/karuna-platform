import { Platform } from 'react-native';
import { permissionsService, PermissionResult } from './permissions';

// Lazy-load expo-av to prevent AVAudioSession crash on iOS 26+
// The native module initializes AVInputDeviceDiscoverySession on import,
// which crashes during app launch on iOS 26.4
let Audio: any = null;
async function getAudio() {
  if (!Audio) {
    const mod = await import('expo-av');
    Audio = mod.Audio;
  }
  return Audio;
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
  private recording: any = null;
  private recordingDuration: number = 0;
  private lastPermissionResult: PermissionResult | null = null;
  private statusUpdateInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Audio configuration deferred to initialize() to avoid racing with
    // iOS 26's UITraitCollection setup during window presentation.
  }

  async initialize(): Promise<void> {
    await this.configureAudio();
  }

  private async configureAudio(): Promise<void> {
    try {
      const AudioModule = await getAudio();
      await AudioModule.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (error) {
      console.error('Error configuring audio mode:', error);
    }
  }

  /**
   * Check current permission status
   */
  async checkPermissions(): Promise<PermissionResult> {
    return permissionsService.checkMicrophonePermission();
  }

  /**
   * Request all required permissions
   * Returns detailed result including whether we can ask again
   */
  async requestPermissions(): Promise<PermissionResult> {
    const result = await permissionsService.requestAllPermissions();
    this.lastPermissionResult = result;
    return result;
  }

  /**
   * Get the last permission result (useful for UI decisions)
   */
  getLastPermissionResult(): PermissionResult | null {
    return this.lastPermissionResult;
  }

  /**
   * Open device settings for manual permission grant
   */
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

    // Ensure audio mode is configured for recording
    await this.configureAudio();

    try {
      // Create a new recording instance
      const AudioModule = await getAudio();
      const { recording } = await AudioModule.Recording.createAsync(
        {
          android: {
            extension: '.m4a',
            outputFormat: AudioModule.AndroidOutputFormat.MPEG_4,
            audioEncoder: AudioModule.AndroidAudioEncoder.AAC,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000,
          },
          ios: {
            extension: '.m4a',
            outputFormat: AudioModule.IOSOutputFormat.MPEG4AAC,
            audioQuality: AudioModule.IOSAudioQuality.HIGH,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
          web: {
            mimeType: 'audio/webm',
            bitsPerSecond: 128000,
          },
        },
        (status) => {
          if (status.isRecording && status.durationMillis !== undefined) {
            this.recordingDuration = status.durationMillis;
            if (onProgress) {
              onProgress(status.durationMillis);
            }
          }
        },
        100 // Update interval in ms
      );

      this.recording = recording;
      this.recordingDuration = 0;

      const uri = recording.getURI();
      return uri || '';
    } catch (error) {
      console.error('Start recording error:', error);
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
      if (!this.recording) {
        throw new RecordingException(
          'recording_failed',
          'No active recording to stop.',
          true
        );
      }

      // Get the status before stopping
      const status = await this.recording.getStatusAsync();
      const duration = status.durationMillis || this.recordingDuration;

      // Stop and unload the recording
      await this.recording.stopAndUnloadAsync();

      // Reset audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const uri = this.recording.getURI();
      this.recording = null;
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
      this.recording = null;
      this.recordingDuration = 0;

      if (error instanceof RecordingException) {
        throw error;
      }

      console.error('Stop recording error:', error);
      throw new RecordingException(
        'recording_failed',
        'Could not save the recording. Please try again.',
        true
      );
    }
  }

  async cancelRecording(): Promise<void> {
    try {
      if (this.recording) {
        await this.recording.stopAndUnloadAsync();
        this.recording = null;
        this.recordingDuration = 0;

        // Reset audio mode
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
      }
    } catch (error) {
      console.error('Cancel recording error:', error);
      this.recording = null;
      this.recordingDuration = 0;
    }
  }

  getCurrentDuration(): number {
    return this.recordingDuration;
  }

  isRecording(): boolean {
    return this.recording !== null;
  }
}

export const voiceRecorder = new VoiceRecorder();

export default voiceRecorder;

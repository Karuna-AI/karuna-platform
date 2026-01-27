import AudioRecorderPlayer, {
  AudioSet,
  AVEncoderAudioQualityIOSType,
  AVEncodingOption,
  AudioSourceAndroidType,
  OutputFormatAndroidType,
  AudioEncoderAndroidType,
} from 'react-native-audio-recorder-player';
import { Platform } from 'react-native';
import { permissionsService, PermissionResult } from './permissions';

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
  private audioRecorderPlayer: AudioRecorderPlayer;
  private currentRecordingPath: string | null = null;
  private recordingDuration: number = 0;
  private lastPermissionResult: PermissionResult | null = null;

  constructor() {
    this.audioRecorderPlayer = new AudioRecorderPlayer();
    this.audioRecorderPlayer.setSubscriptionDuration(0.1);
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

    const audioSet: AudioSet = {
      AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
      AudioSourceAndroid: AudioSourceAndroidType.MIC,
      AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high,
      AVNumberOfChannelsKeyIOS: 1,
      AVFormatIDKeyIOS: AVEncodingOption.aac,
      OutputFormatAndroid: OutputFormatAndroidType.AAC_ADTS,
    };

    const path = Platform.select({
      ios: 'karuna_recording.m4a',
      android: `${Date.now()}_karuna_recording.m4a`,
    });

    try {
      const uri = await this.audioRecorderPlayer.startRecorder(path, audioSet);
      this.currentRecordingPath = uri;
      this.recordingDuration = 0;

      this.audioRecorderPlayer.addRecordBackListener((e) => {
        this.recordingDuration = e.currentPosition;
        if (onProgress) {
          onProgress(e.currentPosition);
        }
      });

      return uri;
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
      const result = await this.audioRecorderPlayer.stopRecorder();
      this.audioRecorderPlayer.removeRecordBackListener();

      const duration = this.recordingDuration;
      const path = this.currentRecordingPath || result;

      this.currentRecordingPath = null;
      this.recordingDuration = 0;

      if (duration < 500) {
        throw new RecordingException(
          'too_short',
          'Recording too short. Please hold the button and speak.',
          true
        );
      }

      return { path, duration };
    } catch (error) {
      this.audioRecorderPlayer.removeRecordBackListener();

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
      await this.audioRecorderPlayer.stopRecorder();
      this.audioRecorderPlayer.removeRecordBackListener();
      this.currentRecordingPath = null;
      this.recordingDuration = 0;
    } catch (error) {
      console.error('Cancel recording error:', error);
    }
  }

  getCurrentDuration(): number {
    return this.recordingDuration;
  }

  isRecording(): boolean {
    return this.currentRecordingPath !== null;
  }
}

export const voiceRecorder = new VoiceRecorder();

export default voiceRecorder;

// Web Audio Recorder implementation using MediaRecorder API

type RecordBackListener = (e: { currentPosition: number }) => void;

interface AudioSet {
  AudioEncoderAndroid?: number;
  AudioSourceAndroid?: number;
  AVEncoderAudioQualityKeyIOS?: number;
  AVNumberOfChannelsKeyIOS?: number;
  AVFormatIDKeyIOS?: number;
  OutputFormatAndroid?: number;
}

class WebAudioRecorderPlayer {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordBackListener: RecordBackListener | null = null;
  private subscriptionDuration: number = 0.1;
  private startTime: number = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private recordedBlob: Blob | null = null;

  setSubscriptionDuration(duration: number): void {
    this.subscriptionDuration = duration;
  }

  addRecordBackListener(listener: RecordBackListener): void {
    this.recordBackListener = listener;
  }

  removeRecordBackListener(): void {
    this.recordBackListener = null;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async startRecorder(_path?: string, _audioSet?: AudioSet): Promise<string> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100);
      this.startTime = Date.now();

      this.intervalId = setInterval(() => {
        if (this.recordBackListener) {
          this.recordBackListener({
            currentPosition: Date.now() - this.startTime,
          });
        }
      }, this.subscriptionDuration * 1000);

      return 'web-recording';
    } catch (error) {
      throw new Error('Microphone permission denied or not available');
    }
  }

  async stopRecorder(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        this.recordedBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(this.recordedBlob);

        // Stop all tracks
        this.mediaRecorder?.stream.getTracks().forEach((track) => track.stop());

        if (this.intervalId) {
          clearInterval(this.intervalId);
          this.intervalId = null;
        }

        resolve(url);
      };

      this.mediaRecorder.stop();
    });
  }

  getRecordedBlob(): Blob | null {
    return this.recordedBlob;
  }
}

// Export types for compatibility
export const AudioEncoderAndroidType = {
  AAC: 3,
};

export const AudioSourceAndroidType = {
  MIC: 1,
};

export const AVEncoderAudioQualityIOSType = {
  high: 96,
};

export const AVEncodingOption = {
  aac: 'aac',
};

export const OutputFormatAndroidType = {
  AAC_ADTS: 6,
};

export type { AudioSet };

export default WebAudioRecorderPlayer;

/**
 * Web mock for expo-camera
 *
 * Web limitations:
 * - Uses MediaDevices API for camera access
 * - Torch/flashlight not supported on most web browsers
 * - Limited camera controls compared to native
 */

export const CameraType = {
  front: 'front',
  back: 'back',
} as const;

export const FlashMode = {
  off: 'off',
  on: 'on',
  auto: 'auto',
  torch: 'torch',
} as const;

export const AutoFocus = {
  on: 'on',
  off: 'off',
} as const;

export const WhiteBalance = {
  auto: 'auto',
  sunny: 'sunny',
  cloudy: 'cloudy',
  shadow: 'shadow',
  incandescent: 'incandescent',
  fluorescent: 'fluorescent',
} as const;

export interface PermissionResponse {
  status: 'granted' | 'denied' | 'undetermined';
  granted: boolean;
  canAskAgain: boolean;
}

export interface CameraCapturedPicture {
  uri: string;
  width: number;
  height: number;
  base64?: string;
  exif?: Record<string, any>;
}

let hasShownWebWarning = false;
const showWebLimitationWarning = (feature: string) => {
  if (!hasShownWebWarning && process.env.NODE_ENV === 'development') {
    console.debug(`[Camera] ${feature} - limited on web platform`);
    hasShownWebWarning = true;
  }
};

/**
 * Request camera permissions
 */
export async function requestCameraPermissionsAsync(): Promise<PermissionResponse> {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { status: 'denied', granted: false, canAskAgain: false };
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(track => track.stop());

    return { status: 'granted', granted: true, canAskAgain: true };
  } catch (error) {
    const err = error as Error;
    if (err.name === 'NotAllowedError') {
      return { status: 'denied', granted: false, canAskAgain: true };
    }
    return { status: 'denied', granted: false, canAskAgain: false };
  }
}

/**
 * Get current camera permissions
 */
export async function getCameraPermissionsAsync(): Promise<PermissionResponse> {
  try {
    if (!navigator.permissions) {
      return { status: 'undetermined', granted: false, canAskAgain: true };
    }
    const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return {
      status: result.state === 'granted' ? 'granted' : result.state === 'denied' ? 'denied' : 'undetermined',
      granted: result.state === 'granted',
      canAskAgain: result.state !== 'denied',
    };
  } catch {
    return { status: 'undetermined', granted: false, canAskAgain: true };
  }
}

/**
 * Request microphone permissions
 */
export async function requestMicrophonePermissionsAsync(): Promise<PermissionResponse> {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { status: 'denied', granted: false, canAskAgain: false };
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());

    return { status: 'granted', granted: true, canAskAgain: true };
  } catch (error) {
    const err = error as Error;
    if (err.name === 'NotAllowedError') {
      return { status: 'denied', granted: false, canAskAgain: true };
    }
    return { status: 'denied', granted: false, canAskAgain: false };
  }
}

/**
 * Get available camera devices
 */
export async function getAvailableCameraTypesAsync(): Promise<string[]> {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(device => device.kind === 'videoinput');

    // Try to determine front/back based on label
    const types: string[] = [];
    cameras.forEach(camera => {
      const label = camera.label.toLowerCase();
      if (label.includes('front') || label.includes('user')) {
        if (!types.includes('front')) types.push('front');
      } else if (label.includes('back') || label.includes('environment')) {
        if (!types.includes('back')) types.push('back');
      }
    });

    // If we couldn't determine, just return generic type
    if (types.length === 0 && cameras.length > 0) {
      types.push('back');
    }

    return types;
  } catch {
    return [];
  }
}

// Camera component mock - in web, this would need to be a React component
// using video element with MediaDevices API
export const Camera = {
  requestCameraPermissionsAsync,
  getCameraPermissionsAsync,
  requestMicrophonePermissionsAsync,
  getAvailableCameraTypesAsync,
  Constants: {
    Type: CameraType,
    FlashMode,
    AutoFocus,
    WhiteBalance,
  },
  // Torch is not directly controllable on web without native APIs
  isAvailableAsync: async () => {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  },
};

// Web torch control (experimental - ImageCapture API)
export async function setTorchModeAsync(enabled: boolean): Promise<boolean> {
  showWebLimitationWarning('Torch/flashlight control');

  try {
    // Try using ImageCapture API (limited browser support)
    if ('ImageCapture' in window) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });

      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };

      if (capabilities?.torch) {
        await track.applyConstraints({
          advanced: [{ torch: enabled } as MediaTrackConstraintSet],
        });
        return true;
      }

      stream.getTracks().forEach(t => t.stop());
    }
  } catch (error) {
    console.debug('[Camera] Torch control not available:', error);
  }

  return false;
}

export default {
  Camera,
  CameraType,
  FlashMode,
  AutoFocus,
  WhiteBalance,
  requestCameraPermissionsAsync,
  getCameraPermissionsAsync,
  requestMicrophonePermissionsAsync,
  getAvailableCameraTypesAsync,
  setTorchModeAsync,
};

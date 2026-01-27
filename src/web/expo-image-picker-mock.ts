/**
 * Web mock for expo-image-picker
 *
 * Uses native HTML file input for image selection on web
 * Camera capture uses getUserMedia API when available
 */

export const MediaTypeOptions = {
  All: 'All',
  Images: 'Images',
  Videos: 'Videos',
} as const;

export const CameraType = {
  front: 'front',
  back: 'back',
} as const;

export interface ImagePickerOptions {
  mediaTypes?: typeof MediaTypeOptions[keyof typeof MediaTypeOptions];
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
  base64?: boolean;
  exif?: boolean;
  allowsMultipleSelection?: boolean;
}

export interface ImagePickerResult {
  canceled: boolean;
  assets: Array<{
    uri: string;
    width: number;
    height: number;
    type?: 'image' | 'video';
    fileName?: string;
    fileSize?: number;
    base64?: string;
    exif?: Record<string, any>;
  }> | null;
}

export interface PermissionResponse {
  status: 'granted' | 'denied' | 'undetermined';
  granted: boolean;
  canAskAgain: boolean;
}

/**
 * Request camera permissions
 */
export async function requestCameraPermissionsAsync(): Promise<PermissionResponse> {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { status: 'denied', granted: false, canAskAgain: false };
    }

    // Try to access the camera to trigger permission prompt
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    // Stop the stream immediately
    stream.getTracks().forEach(track => track.stop());

    return { status: 'granted', granted: true, canAskAgain: true };
  } catch (error) {
    const err = error as Error;
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return { status: 'denied', granted: false, canAskAgain: true };
    }
    return { status: 'denied', granted: false, canAskAgain: false };
  }
}

/**
 * Request media library permissions
 */
export async function requestMediaLibraryPermissionsAsync(): Promise<PermissionResponse> {
  // Web doesn't require explicit permissions for file input
  return { status: 'granted', granted: true, canAskAgain: true };
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
 * Get current media library permissions
 */
export async function getMediaLibraryPermissionsAsync(): Promise<PermissionResponse> {
  return { status: 'granted', granted: true, canAskAgain: true };
}

/**
 * Launch camera for image capture
 */
export async function launchCameraAsync(options?: ImagePickerOptions): Promise<ImagePickerResult> {
  return new Promise((resolve) => {
    // Create a file input that accepts camera capture
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options?.mediaTypes === MediaTypeOptions.Videos ? 'video/*' :
                   options?.mediaTypes === MediaTypeOptions.All ? 'image/*,video/*' : 'image/*';
    input.capture = 'environment'; // Use back camera by default

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const uri = URL.createObjectURL(file);

        // Get image dimensions
        let width = 0;
        let height = 0;

        if (file.type.startsWith('image/')) {
          const dimensions = await getImageDimensions(uri);
          width = dimensions.width;
          height = dimensions.height;
        }

        let base64: string | undefined;
        if (options?.base64) {
          base64 = await fileToBase64(file);
        }

        resolve({
          canceled: false,
          assets: [{
            uri,
            width,
            height,
            type: file.type.startsWith('video/') ? 'video' : 'image',
            fileName: file.name,
            fileSize: file.size,
            base64,
          }],
        });
      } else {
        resolve({ canceled: true, assets: null });
      }
    };

    input.oncancel = () => {
      resolve({ canceled: true, assets: null });
    };

    // Click to open file picker
    input.click();
  });
}

/**
 * Launch image library picker
 */
export async function launchImageLibraryAsync(options?: ImagePickerOptions): Promise<ImagePickerResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options?.mediaTypes === MediaTypeOptions.Videos ? 'video/*' :
                   options?.mediaTypes === MediaTypeOptions.All ? 'image/*,video/*' : 'image/*';

    if (options?.allowsMultipleSelection) {
      input.multiple = true;
    }

    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        const assets = await Promise.all(
          Array.from(files).map(async (file) => {
            const uri = URL.createObjectURL(file);

            let width = 0;
            let height = 0;

            if (file.type.startsWith('image/')) {
              const dimensions = await getImageDimensions(uri);
              width = dimensions.width;
              height = dimensions.height;
            }

            let base64: string | undefined;
            if (options?.base64) {
              base64 = await fileToBase64(file);
            }

            return {
              uri,
              width,
              height,
              type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
              fileName: file.name,
              fileSize: file.size,
              base64,
            };
          })
        );

        resolve({ canceled: false, assets });
      } else {
        resolve({ canceled: true, assets: null });
      }
    };

    input.oncancel = () => {
      resolve({ canceled: true, assets: null });
    };

    input.click();
  });
}

// Helper to get image dimensions
function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
    };
    img.src = uri;
  });
}

// Helper to convert file to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix to get just the base64
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default {
  MediaTypeOptions,
  CameraType,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
  getCameraPermissionsAsync,
  getMediaLibraryPermissionsAsync,
  launchCameraAsync,
  launchImageLibraryAsync,
};

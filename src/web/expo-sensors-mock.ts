/**
 * Web mock for expo-sensors
 *
 * Web limitations:
 * - Pedometer not available on web (no step counting hardware access)
 * - Accelerometer/Gyroscope available via DeviceMotion API (limited support)
 * - Barometer not available on web
 */

type Subscription = {
  remove: () => void;
};

// Pedometer mock - step counting not available on web
export const Pedometer = {
  isAvailableAsync: async (): Promise<boolean> => {
    console.debug('[Pedometer] Step counting not available on web');
    return false;
  },

  getStepCountAsync: async (start: Date, end: Date): Promise<{ steps: number }> => {
    console.debug('[Pedometer] getStepCountAsync - not available on web');
    return { steps: 0 };
  },

  watchStepCount: (callback: (result: { steps: number }) => void): Subscription => {
    console.debug('[Pedometer] watchStepCount - not available on web');
    return { remove: () => {} };
  },

  getPermissionsAsync: async () => {
    return { status: 'denied', granted: false, canAskAgain: false };
  },

  requestPermissionsAsync: async () => {
    return { status: 'denied', granted: false, canAskAgain: false };
  },
};

// Accelerometer mock - uses DeviceMotion API when available
let accelerometerListeners: Array<(data: { x: number; y: number; z: number }) => void> = [];
let accelerometerInterval: NodeJS.Timeout | null = null;

export const Accelerometer = {
  isAvailableAsync: async (): Promise<boolean> => {
    return typeof DeviceMotionEvent !== 'undefined';
  },

  addListener: (callback: (data: { x: number; y: number; z: number }) => void): Subscription => {
    accelerometerListeners.push(callback);

    if (accelerometerListeners.length === 1 && typeof window !== 'undefined') {
      const handleMotion = (event: DeviceMotionEvent) => {
        const acceleration = event.accelerationIncludingGravity;
        if (acceleration) {
          const data = {
            x: (acceleration.x || 0) / 9.81,
            y: (acceleration.y || 0) / 9.81,
            z: (acceleration.z || 0) / 9.81,
          };
          accelerometerListeners.forEach(listener => listener(data));
        }
      };
      window.addEventListener('devicemotion', handleMotion);
    }

    return {
      remove: () => {
        const index = accelerometerListeners.indexOf(callback);
        if (index > -1) {
          accelerometerListeners.splice(index, 1);
        }
      },
    };
  },

  setUpdateInterval: (intervalMs: number) => {
    // DeviceMotion API doesn't support custom intervals
    console.debug('[Accelerometer] setUpdateInterval - using browser default');
  },

  getPermissionsAsync: async () => {
    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      return { status: 'undetermined', granted: false, canAskAgain: true };
    }
    return { status: 'granted', granted: true, canAskAgain: true };
  },

  requestPermissionsAsync: async () => {
    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceMotionEvent as any).requestPermission();
        return {
          status: permission === 'granted' ? 'granted' : 'denied',
          granted: permission === 'granted',
          canAskAgain: permission !== 'denied',
        };
      } catch {
        return { status: 'denied', granted: false, canAskAgain: false };
      }
    }
    return { status: 'granted', granted: true, canAskAgain: true };
  },
};

// Gyroscope mock
let gyroscopeListeners: Array<(data: { x: number; y: number; z: number }) => void> = [];

export const Gyroscope = {
  isAvailableAsync: async (): Promise<boolean> => {
    return typeof DeviceMotionEvent !== 'undefined';
  },

  addListener: (callback: (data: { x: number; y: number; z: number }) => void): Subscription => {
    gyroscopeListeners.push(callback);

    if (gyroscopeListeners.length === 1 && typeof window !== 'undefined') {
      const handleMotion = (event: DeviceMotionEvent) => {
        const rotation = event.rotationRate;
        if (rotation) {
          const data = {
            x: (rotation.alpha || 0) * (Math.PI / 180),
            y: (rotation.beta || 0) * (Math.PI / 180),
            z: (rotation.gamma || 0) * (Math.PI / 180),
          };
          gyroscopeListeners.forEach(listener => listener(data));
        }
      };
      window.addEventListener('devicemotion', handleMotion);
    }

    return {
      remove: () => {
        const index = gyroscopeListeners.indexOf(callback);
        if (index > -1) {
          gyroscopeListeners.splice(index, 1);
        }
      },
    };
  },

  setUpdateInterval: (intervalMs: number) => {
    console.debug('[Gyroscope] setUpdateInterval - using browser default');
  },

  getPermissionsAsync: async () => Accelerometer.getPermissionsAsync(),
  requestPermissionsAsync: async () => Accelerometer.requestPermissionsAsync(),
};

// Barometer mock - not available on web
export const Barometer = {
  isAvailableAsync: async (): Promise<boolean> => false,

  addListener: (callback: (data: { pressure: number; relativeAltitude?: number }) => void): Subscription => {
    console.debug('[Barometer] Not available on web');
    return { remove: () => {} };
  },

  setUpdateInterval: (intervalMs: number) => {},
  getPermissionsAsync: async () => ({ status: 'denied', granted: false, canAskAgain: false }),
  requestPermissionsAsync: async () => ({ status: 'denied', granted: false, canAskAgain: false }),
};

// Magnetometer mock
export const Magnetometer = {
  isAvailableAsync: async (): Promise<boolean> => false,

  addListener: (callback: (data: { x: number; y: number; z: number }) => void): Subscription => {
    console.debug('[Magnetometer] Not available on web');
    return { remove: () => {} };
  },

  setUpdateInterval: (intervalMs: number) => {},
  getPermissionsAsync: async () => ({ status: 'denied', granted: false, canAskAgain: false }),
  requestPermissionsAsync: async () => ({ status: 'denied', granted: false, canAskAgain: false }),
};

// DeviceMotion mock
export const DeviceMotion = {
  isAvailableAsync: async (): Promise<boolean> => {
    return typeof DeviceMotionEvent !== 'undefined';
  },

  addListener: (callback: (data: any) => void): Subscription => {
    if (typeof window !== 'undefined') {
      const handleMotion = (event: DeviceMotionEvent) => {
        callback({
          acceleration: event.acceleration,
          accelerationIncludingGravity: event.accelerationIncludingGravity,
          rotation: event.rotationRate,
          orientation: null,
        });
      };
      window.addEventListener('devicemotion', handleMotion);
      return {
        remove: () => window.removeEventListener('devicemotion', handleMotion),
      };
    }
    return { remove: () => {} };
  },

  setUpdateInterval: (intervalMs: number) => {},
  getPermissionsAsync: async () => Accelerometer.getPermissionsAsync(),
  requestPermissionsAsync: async () => Accelerometer.requestPermissionsAsync(),
};

// LightSensor mock - not available on web
export const LightSensor = {
  isAvailableAsync: async (): Promise<boolean> => false,
  addListener: (callback: (data: { illuminance: number }) => void): Subscription => {
    console.debug('[LightSensor] Not available on web');
    return { remove: () => {} };
  },
  setUpdateInterval: (intervalMs: number) => {},
  getPermissionsAsync: async () => ({ status: 'denied', granted: false, canAskAgain: false }),
  requestPermissionsAsync: async () => ({ status: 'denied', granted: false, canAskAgain: false }),
};

export default {
  Pedometer,
  Accelerometer,
  Gyroscope,
  Barometer,
  Magnetometer,
  DeviceMotion,
  LightSensor,
};

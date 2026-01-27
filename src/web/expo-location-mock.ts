/**
 * Web mock for expo-location
 * Uses browser Geolocation API
 */

export const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
} as const;

export const ActivityType = {
  Other: 1,
  AutomotiveNavigation: 2,
  Fitness: 3,
  OtherNavigation: 4,
  Airborne: 5,
} as const;

interface LocationObject {
  coords: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
}

interface PermissionResponse {
  status: 'granted' | 'denied' | 'undetermined';
  canAskAgain?: boolean;
}

export async function requestForegroundPermissionsAsync(): Promise<PermissionResponse> {
  if (!('geolocation' in navigator)) {
    return { status: 'denied', canAskAgain: false };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve({ status: 'granted', canAskAgain: true }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve({ status: 'denied', canAskAgain: false });
        } else {
          resolve({ status: 'undetermined', canAskAgain: true });
        }
      },
      { timeout: 5000 }
    );
  });
}

export async function requestBackgroundPermissionsAsync(): Promise<PermissionResponse> {
  // Background location not supported on web
  console.warn('[Location] Background location not supported on web');
  return requestForegroundPermissionsAsync();
}

export async function getForegroundPermissionsAsync(): Promise<PermissionResponse> {
  return requestForegroundPermissionsAsync();
}

export async function getBackgroundPermissionsAsync(): Promise<PermissionResponse> {
  return requestForegroundPermissionsAsync();
}

export async function getCurrentPositionAsync(options?: {
  accuracy?: number;
  maximumAge?: number;
  timeout?: number;
}): Promise<LocationObject> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation not available'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            altitude: position.coords.altitude,
            accuracy: position.coords.accuracy,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
          },
          timestamp: position.timestamp,
        });
      },
      (error) => reject(error),
      {
        enableHighAccuracy: options?.accuracy ? options.accuracy >= Accuracy.High : false,
        maximumAge: options?.maximumAge,
        timeout: options?.timeout || 10000,
      }
    );
  });
}

export async function watchPositionAsync(
  options: {
    accuracy?: number;
    timeInterval?: number;
    distanceInterval?: number;
  },
  callback: (location: LocationObject) => void
): Promise<{ remove: () => void }> {
  if (!('geolocation' in navigator)) {
    console.error('[Location] Geolocation not available');
    return { remove: () => {} };
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      callback({
        coords: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          altitude: position.coords.altitude,
          accuracy: position.coords.accuracy,
          altitudeAccuracy: position.coords.altitudeAccuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
        },
        timestamp: position.timestamp,
      });
    },
    (error) => console.error('[Location] Watch error:', error),
    {
      enableHighAccuracy: options.accuracy ? options.accuracy >= Accuracy.High : false,
    }
  );

  return {
    remove: () => navigator.geolocation.clearWatch(watchId),
  };
}

export async function getLastKnownPositionAsync(): Promise<LocationObject | null> {
  try {
    return await getCurrentPositionAsync({ maximumAge: Infinity });
  } catch {
    return null;
  }
}

export async function geocodeAsync(address: string): Promise<Array<{ latitude: number; longitude: number }>> {
  console.warn('[Location] Geocoding not implemented on web');
  return [];
}

export async function reverseGeocodeAsync(location: { latitude: number; longitude: number }): Promise<any[]> {
  console.warn('[Location] Reverse geocoding not implemented on web');
  return [];
}

export default {
  Accuracy,
  ActivityType,
  requestForegroundPermissionsAsync,
  requestBackgroundPermissionsAsync,
  getForegroundPermissionsAsync,
  getBackgroundPermissionsAsync,
  getCurrentPositionAsync,
  watchPositionAsync,
  getLastKnownPositionAsync,
  geocodeAsync,
  reverseGeocodeAsync,
};

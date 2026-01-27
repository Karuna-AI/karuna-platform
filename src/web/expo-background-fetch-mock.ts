/**
 * Web mock for expo-background-fetch
 * Background fetch is not supported on web, so these are no-ops
 */

export const BackgroundFetchResult = {
  NoData: 1,
  NewData: 2,
  Failed: 3,
} as const;

export const BackgroundFetchStatus = {
  Denied: 1,
  Restricted: 2,
  Available: 3,
} as const;

export async function getStatusAsync(): Promise<number> {
  // Return "Available" but it won't actually work on web
  return BackgroundFetchStatus.Available;
}

export async function registerTaskAsync(
  taskName: string,
  options?: {
    minimumInterval?: number;
    stopOnTerminate?: boolean;
    startOnBoot?: boolean;
  }
): Promise<void> {
  console.warn('[BackgroundFetch] Background fetch is not supported on web');
}

export async function unregisterTaskAsync(taskName: string): Promise<void> {
  // No-op
}

export default {
  BackgroundFetchResult,
  BackgroundFetchStatus,
  getStatusAsync,
  registerTaskAsync,
  unregisterTaskAsync,
};

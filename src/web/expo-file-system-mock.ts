/**
 * Web mock for expo-file-system
 * Uses IndexedDB and Blob URLs for file operations
 */

const DB_NAME = 'expo-file-system';
const STORE_NAME = 'files';

export const documentDirectory = 'file:///documents/';
export const cacheDirectory = 'file:///cache/';
export const bundleDirectory = 'file:///bundle/';

export const EncodingType = {
  UTF8: 'utf8',
  Base64: 'base64',
} as const;

export const FileSystemUploadType = {
  BINARY_CONTENT: 0,
  MULTIPART: 1,
} as const;

export const FileSystemSessionType = {
  BACKGROUND: 0,
  FOREGROUND: 1,
} as const;

// Simple IndexedDB wrapper
async function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'uri' });
      }
    };
  });
}

export async function getInfoAsync(
  fileUri: string,
  options?: { md5?: boolean; size?: boolean }
): Promise<{
  exists: boolean;
  isDirectory: boolean;
  modificationTime?: number;
  size?: number;
  uri: string;
  md5?: string;
}> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(fileUri);

      request.onsuccess = () => {
        if (request.result) {
          resolve({
            exists: true,
            isDirectory: request.result.isDirectory || false,
            modificationTime: request.result.modificationTime,
            size: request.result.content?.length || 0,
            uri: fileUri,
          });
        } else {
          resolve({
            exists: false,
            isDirectory: false,
            uri: fileUri,
          });
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    return {
      exists: false,
      isDirectory: false,
      uri: fileUri,
    };
  }
}

export async function readAsStringAsync(
  fileUri: string,
  options?: { encoding?: string; position?: number; length?: number }
): Promise<string> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(fileUri);

    request.onsuccess = () => {
      if (request.result?.content) {
        resolve(request.result.content);
      } else {
        reject(new Error(`File not found: ${fileUri}`));
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function writeAsStringAsync(
  fileUri: string,
  contents: string,
  options?: { encoding?: string }
): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({
      uri: fileUri,
      content: contents,
      modificationTime: Date.now(),
      isDirectory: false,
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteAsync(
  fileUri: string,
  options?: { idempotent?: boolean }
): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(fileUri);

    request.onsuccess = () => resolve();
    request.onerror = () => {
      if (options?.idempotent) {
        resolve();
      } else {
        reject(request.error);
      }
    };
  });
}

export async function moveAsync(options: {
  from: string;
  to: string;
}): Promise<void> {
  const content = await readAsStringAsync(options.from);
  await writeAsStringAsync(options.to, content);
  await deleteAsync(options.from);
}

export async function copyAsync(options: {
  from: string;
  to: string;
}): Promise<void> {
  const content = await readAsStringAsync(options.from);
  await writeAsStringAsync(options.to, content);
}

export async function makeDirectoryAsync(
  fileUri: string,
  options?: { intermediates?: boolean }
): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({
      uri: fileUri,
      isDirectory: true,
      modificationTime: Date.now(),
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function readDirectoryAsync(fileUri: string): Promise<string[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const files = request.result
        .filter((item: any) => item.uri.startsWith(fileUri) && item.uri !== fileUri)
        .map((item: any) => item.uri.replace(fileUri, '').split('/')[0])
        .filter((name: string, index: number, self: string[]) => self.indexOf(name) === index);
      resolve(files);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function downloadAsync(
  uri: string,
  fileUri: string,
  options?: any
): Promise<{ uri: string; status: number; headers: any; md5?: string }> {
  try {
    const response = await fetch(uri);
    const text = await response.text();
    await writeAsStringAsync(fileUri, text);
    return {
      uri: fileUri,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
    };
  } catch (error) {
    throw new Error(`Download failed: ${error}`);
  }
}

export async function uploadAsync(
  url: string,
  fileUri: string,
  options?: any
): Promise<{ status: number; headers: any; body: string }> {
  const content = await readAsStringAsync(fileUri);
  const response = await fetch(url, {
    method: 'POST',
    body: content,
    ...options,
  });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  };
}

export function createDownloadResumable(
  uri: string,
  fileUri: string,
  options?: any,
  callback?: (downloadProgress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
  resumeData?: string
) {
  return {
    downloadAsync: async () => downloadAsync(uri, fileUri, options),
    pauseAsync: async () => ({ resumeData: '' }),
    resumeAsync: async () => downloadAsync(uri, fileUri, options),
    savable: () => '',
  };
}

export default {
  documentDirectory,
  cacheDirectory,
  bundleDirectory,
  EncodingType,
  FileSystemUploadType,
  FileSystemSessionType,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
  deleteAsync,
  moveAsync,
  copyAsync,
  makeDirectoryAsync,
  readDirectoryAsync,
  downloadAsync,
  uploadAsync,
  createDownloadResumable,
};

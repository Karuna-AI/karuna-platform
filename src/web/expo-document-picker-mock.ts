/**
 * Web mock for expo-document-picker
 */

export async function getDocumentAsync(options?: {
  type?: string | string[];
  copyToCacheDirectory?: boolean;
  multiple?: boolean;
}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options?.type) {
      input.accept = Array.isArray(options.type) ? options.type.join(',') : options.type;
    }
    if (options?.multiple) {
      input.multiple = true;
    }
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        const file = files[0];
        resolve({
          type: 'success',
          name: file.name,
          size: file.size,
          uri: URL.createObjectURL(file),
          mimeType: file.type,
          assets: Array.from(files).map(f => ({
            name: f.name,
            size: f.size,
            uri: URL.createObjectURL(f),
            mimeType: f.type,
          })),
        });
      } else {
        resolve({ type: 'cancel', canceled: true });
      }
    };
    input.click();
  });
}

export default {
  getDocumentAsync,
};
